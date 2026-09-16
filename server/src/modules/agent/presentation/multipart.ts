/**
 * presentation/multipart.ts —— `POST /agent/sessions/:id/photo` 的 multipart 解析。
 *
 * ★ **只认两个字段**:文件 `face`,标量 `userId`。所以它没照抄 `jobs` 那份
 * 通用解析器(`jobs/presentation/multipart.ts` 要归拢 face / scene / meta 三路)——
 * 把"可能有很多字段"的解析器搬到一个只可能有一个文件的路由上,
 * 得到的是**没人走的分支**(同 `session-artifacts.ts` 对端口宽窄的理由)。
 *
 * ★ **产出的形状就是端口的 `PhotoUpload`,字段名逐字相同**(`originalName` /
 * `mimeType` / `stream`)。这样控制器那一步是**直传**,不需要一次改名——
 * 而改名的那行代码永远没人测得到(`session-artifacts.ts` 说"适配器透传,不做转换",
 * 这里就是让那句话成立的地方)。
 *
 * ⚠️ 类型推断那一小张表是 `jobs` 那份的**第二份拷贝**。它不是外部依赖、
 * 也不是业务规则,就是七个扩展名;要合成一份得先在 `assets` 的 barrel 上开口子,
 * 而收益只有一个 7 行的字典。**记在 `README.md` 的待办里,等第三处出现时再合。**
 * (保留它的实际理由:命令行 `curl -F` 不带 Content-Type 时,
 * 不推断就会得到"未知类型"——而那条路正是本项目的冒烟路径。)
 */
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { PhotoUpload } from '../domain/ports/session-artifacts.js';

export interface ParsedPhotoRequest {
  /** 没传文件时为 `undefined`(交给校验器去说人话,这里不抢着抛)。 */
  file?: PhotoUpload;
  /** 表单里的 `userId`。**与文件在同一个请求**——不像 GET 那样走查询串。 */
  userId?: string;
  unknownFields: string[];
}

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

export async function parsePhotoRequest(request: FastifyRequest): Promise<ParsedPhotoRequest> {
  const out: ParsedPhotoRequest = { unknownFields: [] };

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'face') {
        // ★ 未知字段的流**必须放掉**:不读也不销毁就是漏句柄,
        //   而这个坑只有真正传错字段名的人会踩到——他还会以为是别的地方错了。
        part.file.resume();
        out.unknownFields.push(part.fieldname);
        continue;
      }
      if (out.file) {
        // 同名字段传了两次:留第一张,其余的放掉(校验器已保证只可能处理一张)。
        part.file.resume();
        out.unknownFields.push('face(重复)');
        continue;
      }
      const originalName = part.filename || 'face';
      out.file = {
        originalName,
        mimeType: inferImageMime(part.mimetype, originalName),
        stream: part.file,
      };
    } else if (part.fieldname === 'userId') {
      out.userId = String((part as { value?: unknown }).value ?? '');
    } else {
      out.unknownFields.push(part.fieldname);
    }
  }

  return out;
}
