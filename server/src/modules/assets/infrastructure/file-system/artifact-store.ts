/**
 * infrastructure/file-system/artifact-store.ts —— ArtifactStore 的本地文件系统实现。
 * 目录:dataDir/inputs/<jobId>/face|scene/* 与 dataDir/results/<jobId>/result<ext>。
 * 输入文件用随机文件名,避免与用户文件名碰撞;storeKey 统一用正斜杠相对路径。
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
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

/**
 * storeKey(正斜杠) → 数据目录下绝对路径。
 *
 * ★ **必须是数据目录「下面」的路径,落在数据目录自己身上也不行。**
 *   这一条不是洁癖:`remove()` 是拿这个结果去 `rm(…, { recursive: true })` 的,
 *   而 `path.join('inputs', '..')` 会规范化成 `.`、`path.resolve` 出来正好是数据目录根——
 *   放它过去,一次 `remove('..')` 就会把 `users.json` 与全部产物一起删掉。
 *   写"允许等于根"原本是为了别的调用方(那时没有递归删除),现在有了,**这一格必须堵上**。
 */
function toAbs(dataDir: string, storeKey: string): string {
  const rel = storeKey.split('/').join(path.sep);
  const abs = path.resolve(dataDir, rel);
  const root = path.resolve(dataDir);
  if (!abs.startsWith(root + path.sep)) {
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

  /**
   * ★ 真删两个区。**递归**,所以 `id` 里带一层(`<sessionId>/r1`)也删得掉,
   * 而 `remove(sessionId)` 会连带把 `results/<sessionId>/` 底下所有嵌套目录一起删干净。
   * ⚠️ 路径仍过 `toAbs` 的越界校验(防 `../`);`force: true` 让"不存在"不抛错(幂等)。
   */
  async remove(id: string): Promise<void> {
    await rm(toAbs(this.dataDir, path.join('inputs', id)), { recursive: true, force: true });
    await rm(toAbs(this.dataDir, path.join('results', id)), { recursive: true, force: true });
  }

  /**
   * ★ 两个区各列一层目录名,并起来去重。
   *
   * ⚠️ **必须只取目录**(`withFileTypes` + `isDirectory()`)。
   *   `results/<id>/` 下是 `result.png` 这类文件,若把 `readdir` 的原始结果
   *   直接当 id 交出去,调用方会拿到一堆**文件名**;那些名字去 `remove` 虽然无害
   *   (删不存在的键是幂等的),但"盘上有哪些 id"这个答案就变成假的了。
   *   `inputs/<id>/` 下同理(是 `face/`、`scene/` 两个目录)。
   * ⚠️ 区目录本身可能还不存在(全新数据目录),`existsSync` 挡掉,不抛。
   */
  async listIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const area of ['inputs', 'results']) {
      const dir = path.join(this.dataDir, area);
      if (!existsSync(dir)) continue;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) ids.add(entry.name);
      }
    }
    return [...ids];
  }
}
