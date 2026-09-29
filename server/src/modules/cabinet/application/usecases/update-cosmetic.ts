/**
 * application/usecases/update-cosmetic.ts —— 改一条(名称 / 特性,部分更新)。
 * 归属判定**不在本文件**:调实体的具名守卫 `assertOwnedBy`(§5 那张表)。
 * 「不符时报找不到而不是无权」的理由见 `domain/entities/cosmetic-item.ts` 的 `itemNotFound`。
 */
import { itemNotFound, updateCosmeticItem } from '../../domain/entities/cosmetic-item.js';
import type { CosmeticItemView } from '../../domain/schemas/index.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';
import { validateItemId, validateUpdateInput } from '../../domain/validators/cosmetic-item.validator.js';
import { toCosmeticItemView } from '../cabinet-view.js';

export class UpdateCosmetic {
  constructor(private readonly items: CosmeticRepository) {}

  async execute(id: string, raw: unknown): Promise<CosmeticItemView> {
    const itemId = validateItemId(id);
    const input = validateUpdateInput(raw);

    const item = await this.items.findById(itemId);
    if (!item) throw itemNotFound(itemId);
    item.assertOwnedBy(input.userId);

    const updated = updateCosmeticItem(item, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
    });
    await this.items.save(updated);

    return toCosmeticItemView(updated);
  }
}
