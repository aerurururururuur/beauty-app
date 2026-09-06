/**
 * domain/ports/artifact-store.ts —— 图片文件存储端口。
 * 负责输入落盘、产物保存、把存储键解析成本机文件路径(供引擎/分析器读取)。
 * 具体实现(本地文件系统 / 对象存储)属于 infrastructure。
 */
import type { Readable } from 'node:stream';
import type { ImageRef } from '../entities/image.js';

export interface UploadFile {
  originalName: string;
  mimeType: string;
  stream: Readable;
}

export type InputKind = 'face' | 'scene';

export interface StoredResult {
  ref: ImageRef; // 相对路径 + mimeType
  url: string; // 形如 /jobs/<id>/result
}

export interface ArtifactStore {
  /** 把上传流式写入输入区,返回 ImageRef(storeKey 相对路径)。 */
  putInputFile(jobId: string, kind: InputKind, file: UploadFile): Promise<ImageRef>;
  /** 把引擎产出的本地文件收编为任务产物,返回相对引用与下载 URL。 */
  putResult(jobId: string, sourceFilePath: string, mimeType: string): Promise<StoredResult>;
  /** 把 ImageRef 解析成可被引擎/分析器直接读取的本机文件路径。 */
  resolveToFilePath(jobId: string, ref: ImageRef): Promise<string>;
  /** 读取任务产物(若已生成)。 */
  readResult(jobId: string): Promise<{ stream: Readable; mimeType: string } | null>;
}
