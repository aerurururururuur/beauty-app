/**
 * presentation/multipart.ts —— 上传路由的 multipart 解析。**全项目就这一份解析器。**
 *
 * ★ 收 `{ fileField, scalarFields }` 两份**字段名清单**,不认别的
 *   (✏️ 读图那一轮泛化:此前写死文件 `face` + 标量 `userId`)。
 *   两张图那两条路由的差别只在字段名上,别的逐字相同,所以差别就传进来。
 *   ⚠️ **刻意只到这一步**:再做"任意字段 + 任意类型"的通用解析器,
 *   多出来的分支没人走(同 `session-artifacts.ts` 对端口宽窄的理由)。
 *
 * ★ **产出的形状就是端口的 `PhotoUpload`,字段名逐字相同**(`originalName` /
 * `mimeType` / `stream`)。这样控制器那一步是**直传**,不需要一次改名——
 * 而改名的那行代码永远没人测得到(`session-artifacts.ts` 说"适配器透传,不做转换",
 * 这里就是让那句话成立的地方)。
 *
 * ★ **类型推断那一小张表是本地的一份。** 它不是外部依赖、也不是业务规则,
 *   就是七个扩展名;要挪进 `assets` 得先在它的 barrel 上开口子,
 *   而收益只有一个 7 行的字典。**记在 `README.md` 的待办里,等第二处出现时再合。**
 *   (保留它的实际理由:命令行 `curl -F` 不带 Content-Type 时,
 *   不推断就会得到"未知类型"——而那条路正是本项目的冒烟路径。)
 *
 * ── ★★ 文件必须在**循环里**读干净(2026-09-16 修的 bug)─────────────────────────
 *
 * **`part.file` 一旦留到循环外面再读,大于 16 KB 的文件会永远挂住**(不报错、
 * 不完成、连半截文件都不写)。实测:8192 字节过,16384 字节挂——阈值正好是
 * 流内部缓冲的 16384。`curl` 的阈值测试与 `@fastify/multipart` 无关,
 * 是 busboy 的规矩:**上一个 part 的流没被消费,它就不会继续解析下一个**,
 * 于是出了循环之后那条流已经不再有人推数据,`pipeline` 永远等不到结尾。
 * 后果是产品级的:**手机拍的任何一张照片都传不上去**(没有小于 16 KB 的)。
 * ⚠️ 它此前一直没被发现,是因为 `test/` 里**没有任何一条 HTTP 层的上传用例**。
 * 现在有了:`test/multipart-upload.test.ts`,大夹具用 **64 KB**(盖住真机上那条 16 KB 阈值)。
 *
 * 所以这里**在循环里 `toBuffer()`**,再把缓冲区包成 `Readable` 交出去
 * (`Readable.from(buf)` 与原来的形状逐字相同,下游 `pipeline` 不用改)。
 * 换来的代价是**一张照片会整份进内存**——有界(`MAX_UPLOAD_MB`,本路由只收一张),
 * 而且顺带把"文件超限"从**永久挂住**变成 `part.toBuffer()` 抛的那条 413。
 */
import path from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import type { PhotoUpload } from '../domain/ports/session-artifacts.js';

/** 一条上传路由认哪几个字段名。★ 差别只在这里,解析逻辑两边共用一份。 */
export interface UploadFieldSpec {
  /** 文件字段名(本人照片那条是 `face`,参考图那条是 `file`)。 */
  fileField: string;
  /** 标量字段名。**没点名的字段会进 `unknownFields`**。 */
  scalarFields: readonly string[];
}

export interface ParsedUpload {
  /** 没传文件时为 `undefined`(交给校验器去说人话,这里不抢着抛)。 */
  file?: PhotoUpload;
  /**
   * 表单里的标量字段。**只含 `scalarFields` 点过名的键,没传的键不出现**
   * ——"缺了哪个"由校验器说,这里不替它补一个空串。
   * ★ 归属人走表单而不是查询串:那条请求体**只能是 multipart**(要带文件)。
   */
  scalars: Record<string, string>;
  unknownFields: string[];
}

/** 本人照片那条路由认的字段。✏️ 泛化前写死在解析器里,取值一字未改。 */
export const PHOTO_UPLOAD_FIELDS: UploadFieldSpec = {
  fileField: 'face',
  scalarFields: ['userId'],
};

/**
 * 参考图那条路由认的字段(风格图 / 场景图)。
 * ★ 文件字段叫 `file`,**不是 `face`** —— 收的不是本人照片,两条口的隐私义务不同
 *   (见 `entities/session.ts` 的 `RefImageKind`)。
 */
export const IMAGE_UPLOAD_FIELDS: UploadFieldSpec = {
  fileField: 'file',
  scalarFields: ['userId', 'kind'],
};

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

/** 优先用声明类型;缺失或非图片时按扩展名推断,仍然未知则原样返回。 */
export function inferImageMime(declared: string | undefined, filename: string): string {
  if (declared?.startsWith('image/')) return declared;
  const guessed = EXT_MIME[path.extname(filename).toLowerCase()];
  if (guessed) return guessed;
  return declared ?? 'application/octet-stream';
}

export async function parseUploadRequest(
  request: FastifyRequest,
  spec: UploadFieldSpec,
): Promise<ParsedUpload> {
  const out: ParsedUpload = { scalars: {}, unknownFields: [] };
  const isScalar = (name: string): boolean => spec.scalarFields.includes(name);

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== spec.fileField) {
        // ★ 未知字段的流**必须放掉**:不读也不销毁就是漏句柄,
        //   而这个坑只有真正传错字段名的人会踩到——他还会以为是别的地方错了。
        part.file.resume();
        out.unknownFields.push(part.fieldname);
        continue;
      }
      if (out.file) {
        // 同名字段传了两次:留第一张,其余的放掉(校验器已保证只可能处理一张)。
        part.file.resume();
        out.unknownFields.push(`${spec.fileField}(重复)`);
        continue;
      }
      const originalName = part.filename || spec.fileField;
      out.file = {
        originalName,
        mimeType: inferImageMime(part.mimetype, originalName),
        // ★★ **必须在这里读**(而不是把这个流交出去让用例晚点读):
        //    留到循环外面读,>16 KB 的文件会死锁(理由与实测见文件头)。
        //    `Readable.from(buffer)` 的形状与 `part.file` 一致,下游不用改。
        stream: Readable.from(await part.toBuffer()),
      };
    } else if (isScalar(part.fieldname)) {
      out.scalars[part.fieldname] = String((part as { value?: unknown }).value ?? '');
    } else {
      out.unknownFields.push(part.fieldname);
    }
  }

  return out;
}
