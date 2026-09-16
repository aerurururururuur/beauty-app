/**
 * presentation/multipart.ts —— multipart 请求解析。
 * 只负责把上传流与标量按「字段名」归拢;结构与业务校验交给 domain/validator 执行。
 * 说明:浏览器会自动带 image/* Content-Type;命令行/旧客户端可能不带,
 * 这里按扩展名做一次兜底推断,保证 curl 冒烟也能过。
 *
 * ── ★★ 每个文件必须在**循环里**读干净(2026-09-16 修的 bug)─────────────────────
 *
 * 原来的写法是"循环里只登记 `part.file`,出去之后再让用例 `pipeline` 落盘"。
 * 那条路**大于 16 KB 的文件会永远挂住**:不报错、不完成、连半截文件都不写。
 * 实测阈值正好是 **16384 字节**(8192 过 / 16384 挂),也就是流内部缓冲的大小——
 * 规矩是 busboy 的:**上一个 part 的流没被消费,它就不会继续解析下一个**,
 * 所以出了循环以后那条流已经不再有人往里推数据,`pipeline` 永远等不到结尾。
 * 后果是产品级的:**表单路径传任何一张真实照片都会卡死**(手机拍的没有小于 16 KB 的)。
 * ⚠️ 它此前没被发现,是因为 `test/` 里**没有任何一条 HTTP 层的上传用例**,
 * 而现在有了:`test/multipart-upload.test.ts`(★ 那条用例刻意用 64 KB,不是 1 KB)。
 *
 * 所以每个文件在循环里 `toBuffer()`,再把缓冲区包成 `Readable` 交出去——
 * 形状与 `part.file` 逐字相同,`submitJob` 与下游的 `pipeline` 一行都不用改。
 * 代价是**几个文件会整份进内存**:有界(`MAX_UPLOAD_MB` × 至多 7 个文件),
 * 而且顺带把"文件超限"从**永久挂住**变成 `part.toBuffer()` 抛的那条 413。
 * ★ 真嫌内存大,下一步是"在循环里落到临时文件、交出去时换成读那个文件",
 *   而不是把读的动作挪回循环外面——那会把这个 bug 原样放回来。
 */
import path from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import type { UploadFile } from '../../assets/index.js';

export interface ParsedJobParts {
  faceFiles: UploadFile[];
  sceneFiles: UploadFile[];
  /** 结构化需求简报(JSON 字符串):occasion / 肤质肤色 / 穿搭 / 天气 / sceneText。 */
  metaRaw?: string;
  /** 未识别的字段名(仅记录,不影响主流程)。 */
  unknownFields: string[];
}

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

/** 优先用声明类型;缺失或非图片时按扩展名推断,仍然未知则原样返回。 */
function inferMime(declared: string | undefined, filename: string): string {
  if (declared?.startsWith('image/')) return declared;
  const ext = path.extname(filename).toLowerCase();
  const guessed = EXT_MIME[ext];
  if (guessed) return guessed;
  return declared ?? 'application/octet-stream';
}

export async function parseJobParts(request: FastifyRequest): Promise<ParsedJobParts> {
  const out: ParsedJobParts = { faceFiles: [], sceneFiles: [], unknownFields: [] };
  const parts = request.parts();

  for await (const part of parts) {
    if (part.type === 'file') {
      const file: UploadFile = {
        originalName: part.filename || 'unnamed',
        mimeType: inferMime(part.mimetype, part.filename ?? ''),
        // ★★ **必须在这里读**(理由与实测见文件头):留到循环外面读会死锁。
        stream: Readable.from(await part.toBuffer()),
      };
      if (part.fieldname === 'face') out.faceFiles.push(file);
      else if (part.fieldname === 'scene') out.sceneFiles.push(file);
      else out.unknownFields.push(part.fieldname);
    } else {
      // field
      const value = String((part as { value?: unknown }).value ?? '');
      if (part.fieldname === 'meta') {
        if (out.metaRaw === undefined) out.metaRaw = value;
        else out.unknownFields.push('meta(重复)');
      } else {
        out.unknownFields.push(part.fieldname);
      }
    }
  }

  return out;
}
