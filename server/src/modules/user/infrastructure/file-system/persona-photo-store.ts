/**
 * infrastructure/file-system/persona-photo-store.ts —— PersonaPhotoStore 的本地文件实现,
 * 一个 id 一份字节,落在 `<dataDir>/personas/photos/<id>.<ext>`。
 *
 * ★★ 不复用 `assets` 的 `ArtifactStore`,因为它的目录会被 agent 的 TTL 清理**真删**(完整理由见端口文件头)。
 *
 * ★ 写入先临时文件再 rename:直接 `writeFile` 是截断后写,进程中途挂掉会留下**半张脸**
 * (JPEG 仍能解码出上半截),而且一直 200 发出去。同目录 rename 是原子的。
 *
 * ★ 换照片时旧字节必须删:mime 可能变(jpeg → png),不删就在盘上留一份**没人读也没人删**的脸。
 * 顺序:先 rename 好新的,再删其它扩展名的旧文件(见 `removeStale`)。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PersonaPhotoStore } from '../../domain/ports/persona-photo-store.js';

/** 认识的图片类型 → 扩展名。★ 与 validator 的 `PHOTO_MIME` 同一批,改一处要看另一处。 */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * ★ 实现自己再挡一道,不指望调用方一定校验过:这里拼的是**路径**,带 `/` 或 `..` 的 id 就是一次目录穿越。
 * 与 `persona.validator.ts` 的 `PERSONA_ID_PATTERN` 同款 —— 这一份是防线,不是规则源。
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export class FilePersonaPhotoStore implements PersonaPhotoStore {
  constructor(private readonly dir: string) {}

  async save(personaId: string, mime: string, bytes: Buffer): Promise<void> {
    const ext = this.extOf(mime, personaId);
    await mkdir(this.dir, { recursive: true });

    const target = this.fileOf(personaId, ext);
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);

    // ★ 新的已经到位,再清掉**别的扩展名**的旧字节(见文件头)。
    await this.removeStale(personaId, ext);
  }

  async read(personaId: string, mime: string): Promise<Buffer> {
    const target = this.fileOf(personaId, this.extOf(mime, personaId));
    if (!existsSync(target)) {
      // ★ 普通 Error 而不是 AppError:字节不在是**不变量被打破**(盘被人动过),该 500。
      throw new Error(
        `人设照片不见了:${target} —— 落盘的人设行里写着有照片,但文件不在。` +
          '多半是 dataDir 被人动过;这不是客户端的问题。',
      );
    }
    return readFile(target);
  }

  async remove(personaId: string): Promise<void> {
    await this.removeStale(personaId, null);
  }

  /** 某个 id 名下的**全部**扩展名文件;`keepExt` 给定时留下那一个(换照片时的旧字节清理)。 */
  private async removeStale(personaId: string, keepExt: string | null): Promise<void> {
    this.assertSafeId(personaId);
    if (!existsSync(this.dir)) return;

    const prefix = `${personaId}.`;
    for (const name of await readdir(this.dir)) {
      if (!name.startsWith(prefix)) continue;
      // ★ 只认「<id>.<ext>」这三种形态,别把临时文件之外的东西顺手删了。
      const ext = name.slice(prefix.length);
      if (!Object.values(EXT_BY_MIME).includes(ext)) continue;
      if (ext === keepExt) continue;
      await rm(path.join(this.dir, name), { force: true });
    }
  }

  private fileOf(personaId: string, ext: string): string {
    this.assertSafeId(personaId);
    return path.join(this.dir, `${personaId}.${ext}`);
  }

  private extOf(mime: string, personaId: string): string {
    const ext = EXT_BY_MIME[mime];
    if (!ext) {
      throw new Error(
        `不认识的人设照片类型:${mime}(人设 ${personaId})。—— 落盘行里的 mime 只能是 ` +
          `${Object.keys(EXT_BY_MIME).join(' / ')};行被手改过就会走到这里。`,
      );
    }
    return ext;
  }

  private assertSafeId(personaId: string): void {
    if (!SAFE_ID.test(personaId)) {
      throw new Error(
        `人设 id 不能当文件名用:「${personaId}」。—— 它必须只含 A-Za-z0-9_- ,` +
          '否则拼出来的是一个能跑到目录外面的路径。',
      );
    }
  }
}
