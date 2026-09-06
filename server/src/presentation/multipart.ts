/**
 * presentation/multipart.ts —— multipart 请求解析。
 * 只负责把上传流与标量按「字段名」归拢;字段约束/类型校验交给 domain/schemas 的 zod。
 * 说明:浏览器会自动带 image/* Content-Type;命令行/旧客户端可能不带,
 * 这里按扩展名做一次兜底推断,保证 curl 冒烟也能过。
 */
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { UploadFile } from '../domain/ports/artifact-store.js';

export interface ParsedJobParts {
  faceFiles: UploadFile[];
  sceneFiles: UploadFile[];
  sceneText?: string;
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
        stream: part.file,
      };
      if (part.fieldname === 'face') out.faceFiles.push(file);
      else if (part.fieldname === 'scene') out.sceneFiles.push(file);
      else out.unknownFields.push(part.fieldname);
    } else {
      // field
      const value = String((part as { value?: unknown }).value ?? '');
      if (part.fieldname === 'scene_text') {
        if (out.sceneText === undefined) out.sceneText = value;
        else out.unknownFields.push('scene_text(重复)');
      } else {
        out.unknownFields.push(part.fieldname);
      }
    }
  }

  return out;
}
