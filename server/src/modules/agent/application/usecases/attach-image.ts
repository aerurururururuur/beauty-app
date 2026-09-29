/**
 * application/usecases/attach-image.ts —— 把一张**参考图**挂到会话上(风格图 / 场景图)。
 *
 * ★ **收图免费、分析才花钱**,所以这条用例与 `analyze-image.ts` **刻意分开**:
 *   用户先传图(传了也可能不分析),点「分析」那一下才走花钱那条。
 *
 * ★ **不往 `messages[]` 里记话**,与 `attach-photo.ts` 刻意不同——
 *   那条记 `PHOTO_ATTACHED_NOTE`,是因为 `render_look` 需要知道"照片到了";
 *   而分析**不是工具**(用户点了才跑),模型对这两张图既看不见也动不了手。
 *   给它记一句"我传了一张风格图",只会诱它回"我看看这张图",而它做不到。
 *   能让模型看见的是**分析结果**那条说明(见 `observations.ts` 的 `styleReadNote`)。
 *
 * ★ **不是本人照片那条口。** 两条口的隐私义务不同(见 `entities/session.ts` 的
 *   `RefImageKind`),所以 `putImage` / `resolveImage` 与 `putFace` / `resolveFace`
 *   是四个方法而不是两个带 kind 的。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { setImageRef } from '../../domain/entities/session.js';
import type { RefImageKind, Session } from '../../domain/entities/session.js';
import type { PhotoUpload } from '../../domain/ports/session-artifacts.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { SessionStore } from '../../domain/ports/session-store.js';

export class AttachImage {
  constructor(
    private readonly deps: { sessions: SessionStore; artifacts: SessionArtifacts },
  ) {}

  async execute(
    sessionId: string,
    userId: string,
    kind: RefImageKind,
    file: PhotoUpload,
  ): Promise<Session> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    // ★ 先落盘再记会话(同 `render-look.ts`):写盘失败时不会留下一个取不到的引用。
    const ref = await this.deps.artifacts.putImage(sessionId, kind, file);
    const next = setImageRef(session, kind, ref);
    await this.deps.sessions.save(next);
    return next;
  }
}
