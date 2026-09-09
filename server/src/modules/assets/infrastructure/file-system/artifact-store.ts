/**
 * infrastructure/file-system/artifact-store.ts —— ArtifactStore 的本地文件系统实现。
 * 目录:dataDir/inputs/<jobId>/face|scene/* 与 dataDir/results/<jobId>/result<ext>。
 * 输入文件用随机文件名,避免与用户文件名碰撞;storeKey 统一用正斜杠相对路径。
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { ImageRef } from '../../../shared/index.js';
import type {
  ArtifactStore,
  InputKind,
  StoredResult,
  UploadFile,
} from '../../domain/ports/artifact-store.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
};

function extFor(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? '.bin';
}

function mimeForExt(ext: string): string {
  for (const [mime, e] of Object.entries(EXT_BY_MIME)) {
    if (e === ext) return mime;
  }
  return 'application/octet-stream';
}

/** storeKey(正斜杠) → 数据目录下绝对路径。 */
function toAbs(dataDir: string, storeKey: string): string {
  const rel = storeKey.split('/').join(path.sep);
  const abs = path.resolve(dataDir, rel);
  const root = path.resolve(dataDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`非法的存储键:${storeKey}`);
  }
  return abs;
}

export class FileSystemArtifactStore implements ArtifactStore {
  constructor(private readonly dataDir: string) {}

  async putInputFile(jobId: string, kind: InputKind, file: UploadFile): Promise<ImageRef> {
    const dir = path.join(this.dataDir, 'inputs', jobId, kind);
    await mkdir(dir, { recursive: true });
    const name = `${kind}-${randomUUID()}${extFor(file.mimeType)}`;
    await pipeline(file.stream, createWriteStream(path.join(dir, name)));
    const storeKey = path.relative(this.dataDir, path.join(dir, name)).split(path.sep).join('/');
    return { storeKey, mimeType: file.mimeType, originalName: file.originalName };
  }

  async putResult(jobId: string, sourceFilePath: string, mimeType: string): Promise<StoredResult> {
    const dir = path.join(this.dataDir, 'results', jobId);
    await mkdir(dir, { recursive: true });
    const name = `result${extFor(mimeType)}`;
    await copyFile(sourceFilePath, path.join(dir, name));
    const storeKey = path.relative(this.dataDir, path.join(dir, name)).split(path.sep).join('/');
    return { ref: { storeKey, mimeType }, url: `/jobs/${jobId}/result` };
  }

  async resolveToFilePath(_jobId: string, ref: ImageRef): Promise<string> {
    return toAbs(this.dataDir, ref.storeKey);
  }

  async readResult(jobId: string): Promise<{ stream: Readable; mimeType: string } | null> {
    const dir = path.join(this.dataDir, 'results', jobId);
    if (!existsSync(dir)) return null;
    const entries = await readdir(dir);
    const name = entries.find((f) => f.startsWith('result.'));
    if (!name) return null;
    const mimeType = mimeForExt(path.extname(name));
    return { stream: createReadStream(path.join(dir, name)), mimeType };
  }
}
