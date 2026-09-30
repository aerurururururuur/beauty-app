/**
 * application/usecases/list-custom-features.ts —— 列出某账号自建的特征。
 * ★ 建得早的排前面(与人设列表的"新的在前"相反,故意的):先建的是他习惯用的那几条。
 * ★ **不查账号是否存在**:调用点与 `ListPersonas` 并行,那边的 `USER_NOT_FOUND` 先炸。
 */
import type { CustomFeatureRepository } from '../../domain/ports/custom-feature-repository.js';
import type { CustomFeatureView } from '../../domain/schemas/index.js';
import { validateOwnerQuery } from '../../domain/validators/persona.validator.js';
import { toCustomFeatureView } from '../custom-feature-view.js';

export class ListCustomFeatures {
  constructor(private readonly deps: { customFeatures: CustomFeatureRepository }) {}

  async execute(raw: unknown): Promise<CustomFeatureView[]> {
    const { userId } = validateOwnerQuery(raw);
    const items = await this.deps.customFeatures.listByUser(userId);
    return items
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(toCustomFeatureView);
  }
}
