/**
 * application/usecases/remove-look.ts —— 从「我的妆容档案」里删掉一版。
 *
 * ★ **先删字节、再删记录**,顺序不能反(同 purge 的理由):
 *   字节删失败时记录还在,用户能再删一次;反过来先删记录,字节就永远漏在盘上
 *   —— `look-covers/` **没有清扫器**兜底,漏下的目录没人会再碰它。
 *
 * 归属判定走实体的具名守卫 `assertOwnedBy`,不在本文件重写一遍:
 * 「不存在」与「不是你的」共用同一个 `LOOK_NOT_FOUND`,不外泄存在性。
 */
import { lookNotFound } from '../../domain/entities/look.js';
import type { LookCoverStore } from '../../domain/ports/look-cover-store.js';
import type { LookRepository } from '../../domain/ports/look-repository.js';
import { validateLookId, validateOwnerQuery } from '../../domain/validators/look.validator.js';

export class RemoveLook {
  constructor(
    private readonly deps: {
      items: LookRepository;
      covers: LookCoverStore;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<void> {
    const lookId = validateLookId(id);
    const { userId } = validateOwnerQuery(raw);

    const look = await this.deps.items.findById(lookId);
    if (!look) throw lookNotFound();
    look.assertOwnedBy(userId);

    await this.deps.covers.remove(lookId);
    await this.deps.items.remove(lookId);
  }
}
