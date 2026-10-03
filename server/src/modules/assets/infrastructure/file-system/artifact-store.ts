/**
 * infrastructure/file-system/artifact-store.ts —— ArtifactStore 的本地文件系统实现。
 * 目录:dataDir/inputs/<jobId>/face|scene/* 、dataDir/results/<jobId>/result<ext>,
 * 以及 dataDir/look-covers/<lookId>/cover<ext>(妆容档案的封面,★ 不受会话 TTL 管)。
 * 输入文件用随机文件名,避免与用户文件名碰撞;storeKey 统一用正斜杠相对路径。
 */
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ImageRef, ResolvedImage } from '../../../shared/index.js';
import type {
  ArtifactStore,
  InputKind,
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

  async putResult(jobId: string, sourceFilePath: string, mimeType: string): Promise<ImageRef> {
    const dir = path.join(this.dataDir, 'results', jobId);
    await mkdir(dir, { recursive: true });
    const name = `result${extFor(mimeType)}`;
    await copyFile(sourceFilePath, path.join(dir, name));
    const storeKey = path.relative(this.dataDir, path.join(dir, name)).split(path.sep).join('/');
    return { storeKey, mimeType };
  }

  async resolveToFilePath(_jobId: string, ref: ImageRef): Promise<string> {
    return toAbs(this.dataDir, ref.storeKey);
  }

  /**
   * ★ 只解析路径,不建流。
   * ⚠️ **MIME 必须由这里反推**(`mimeForExt`):调用方手上只有 id,没有 `ImageRef`,
   *   而盘上的文件名只带扩展名 —— 这是本方法比 `resolveToFilePath` 多给一个字段的理由。
   */
  async resolveResult(jobId: string): Promise<ResolvedImage | null> {
    const dir = path.join(this.dataDir, 'results', jobId);
    if (!existsSync(dir)) return null;
    const entries = await readdir(dir);
    const name = entries.find((f) => f.startsWith('result.'));
    if (!name) return null;
    return {
      filePath: path.join(dir, name),
      mimeType: mimeForExt(path.extname(name)),
    };
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
   * 把源头那份图**复制**成档案封面。`copyFile` 而不是 `rename`/软链:
   *   源在 `results/` 下、会被会话 TTL 递归删掉,复制出来才不受它影响。
   */
  async putLook(lookId: string, sourceFilePath: string, mimeType: string): Promise<void> {
    const dir = path.join(this.dataDir, 'look-covers', lookId);
    await mkdir(dir, { recursive: true });
    await copyFile(sourceFilePath, path.join(dir, `cover${extFor(mimeType)}`));
  }

  /** ★ 只解析路径,不建流(同 `resolveResult`);MIME 由扩展名反推。 */
  async resolveLook(lookId: string): Promise<ResolvedImage | null> {
    const dir = path.join(this.dataDir, 'look-covers', lookId);
    if (!existsSync(dir)) return null;
    const entries = await readdir(dir);
    const name = entries.find((f) => f.startsWith('cover.'));
    if (!name) return null;
    return {
      filePath: path.join(dir, name),
      mimeType: mimeForExt(path.extname(name)),
    };
  }

  /** 同 `remove` 的越界校验与幂等口径,只删 `look-covers/` 这一支。 */
  async removeLook(lookId: string): Promise<void> {
    await rm(toAbs(this.dataDir, path.join('look-covers', lookId)), { recursive: true, force: true });
  }

  /**
   * ★ 两个区各列一层目录名,并起来去重。
   *
   * ★★ **`look-covers/` 刻意不在这里面,别"顺手"加进来。** 返回值喂的是
   *   `sweepOrphans`——它每小时把这里列出、却没有活会话认领的 id **立刻删掉**。
   *   加进来 ⇒ 每一次清扫删光用户的全部妆容档案,而且 200、日志干净。
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
