/**
 * infrastructure/file-system/photo-store.ts —— 图片字节的本地文件实现,
 * 一个 id 一份字节,落在 `dir/<id>.<ext>`。✏️ 2026-10-01 由 `persona-photo-store.ts` 泛化而来:
 * 人设照片与账号头像**逐行同款**,只是目录与文案不同 —— 两个端口各留契约(见 `domain/ports/`),
 * 实现共用这一份。★ 不复用 `assets` 的 `ArtifactStore`,理由见 `domain/ports/persona-photo-store.ts`。
 *
 * ★ 写入先临时文件再 rename:直接 `writeFile` 是截断后写,进程中途挂掉会留下**半张脸**,
 *   而且一直 200 发出去。同目录 rename 是原子的。
 * ★ 换图时旧字节必须删:mime 可能变(jpeg → png),不删就在盘上留一份**没人读也没人删**的图。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PHOTO_EXT_BY_MIME } from '../../domain/validators/photo.validator.js';
import type { PersonaPhotoStore } from '../../domain/ports/persona-photo-store.js';
import type { UserAvatarStore } from '../../domain/ports/user-avatar-store.js';

/**
 * ★ 实现自己再挡一道,不指望调用方一定校验过:这里拼的是**路径**,带 `/` 或 `..` 的 id 就是一次目录穿越。
 * 两个 id 空间(人设 / 账号)的格式正则都在各自 validator 里,这一份是防线,不是规则源。
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** `label` 用在报错文案里(「人设照片不见了」/「账号头像不见了」),调用方传,别让实现自己猜。 */
export class FilePhotoStore implements PersonaPhotoStore, UserAvatarStore {
  constructor(
    private readonly dir: string,
    private readonly label: string,
  ) {}

  async save(id: string, mime: string, bytes: Buffer): Promise<void> {
    const ext = this.extOf(mime, id);
    await mkdir(this.dir, { recursive: true });

    const target = this.fileOf(id, ext);
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);

    // ★ 新的已经到位,再清掉**别的扩展名**的旧字节(见文件头)。
    await this.removeStale(id, ext);
  }

  async read(id: string, mime: string): Promise<Buffer> {
    const target = this.fileOf(id, this.extOf(mime, id));
    if (!existsSync(target)) {
      // ★ 普通 Error 而不是 AppError:字节不在是**不变量被打破**(盘被人动过),该 500。
      throw new Error(
        `${this.label}不见了:${target} —— 落盘的行里写着有它,但文件不在。` +
          '多半是 dataDir 被人动过;这不是客户端的问题。',
      );
    }
    return readFile(target);
  }

  async remove(id: string): Promise<void> {
    await this.removeStale(id, null);
  }

  /** 某个 id 名下的**全部**扩展名文件;`keepExt` 给定时留下那一个(换图时的旧字节清理)。 */
  private async removeStale(id: string, keepExt: string | null): Promise<void> {
    this.assertSafeId(id);
    if (!existsSync(this.dir)) return;

    const prefix = `${id}.`;
    for (const name of await readdir(this.dir)) {
      if (!name.startsWith(prefix)) continue;
      // ★ 只认「<id>.<ext>」这几种形态,别把临时文件之外的东西顺手删了。
      const ext = name.slice(prefix.length);
      if (!Object.values(PHOTO_EXT_BY_MIME).includes(ext)) continue;
      if (ext === keepExt) continue;
      await rm(path.join(this.dir, name), { force: true });
    }
  }

  private fileOf(id: string, ext: string): string {
    this.assertSafeId(id);
    return path.join(this.dir, `${id}.${ext}`);
  }

  private extOf(mime: string, id: string): string {
    const ext = PHOTO_EXT_BY_MIME[mime];
    if (!ext) {
      throw new Error(
        `${this.label}的类型不认识:${mime}(id ${id})。—— 落盘行里的 mime 只能是 ` +
          `${Object.keys(PHOTO_EXT_BY_MIME).join(' / ')};行被手改过就会走到这里。`,
      );
    }
    return ext;
  }

  private assertSafeId(id: string): void {
    if (!SAFE_ID.test(id)) {
      throw new Error(
        `id 不能当文件名用:「${id}」。—— 它必须只含 A-Za-z0-9_- ,` +
          '否则拼出来的是一个能跑到目录外面的路径。',
      );
    }
  }
}
