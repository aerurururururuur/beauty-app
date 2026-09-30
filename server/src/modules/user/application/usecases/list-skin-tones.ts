/**
 * application/usecases/list-skin-tones.ts —— 列出某账号自建的肤色档。
 * ★ 建得早的排前面(与人设列表的"新的在前"相反,故意的):先建的是他习惯用的那几档。
 * ★ **不查账号是否存在**:调用点与 `ListPersonas` 并行,那边的 `USER_NOT_FOUND` 先炸。
 */
import type { SkinToneRepository } from '../../domain/ports/skin-tone-repository.js';
import type { SkinToneView } from '../../domain/schemas/index.js';
import { validateOwnerQuery } from '../../domain/validators/persona.validator.js';
import { toSkinToneView } from '../skin-tone-view.js';

export class ListSkinTones {
  constructor(private readonly deps: { tones: SkinToneRepository }) {}

  async execute(raw: unknown): Promise<SkinToneView[]> {
    const { userId } = validateOwnerQuery(raw);
    const tones = await this.deps.tones.listByUser(userId);
    return tones
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(toSkinToneView);
  }
}
