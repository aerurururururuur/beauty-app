/**
 * application/usecases/update-cosmetic.ts —— 改一条(名称 / 特性,部分更新)。
 * 归属校验在这里:请求里的 userId 与条目的 userId 不符时,**报"找不到"而不是"无权"**——
 * 本轮没有鉴权守卫,403 会泄露"这条存在但不是你的";404 什么都不泄露。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { updateCosmeticItem } from '../../domain/entities/cosmetic-item.js';
import type { CosmeticItemView } from '../../domain/api/cosmetic-item-view.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';
import { validateItemId, validateUpdateInput } from '../../domain/validators/cosmetic-item.validator.js';
import { toCosmeticItemView } from '../mapping/cosmetic-item-view.mapper.js';

export class UpdateCosmetic {
  constructor(private readonly items: CosmeticRepository) {}

  async execute(id: string, raw: unknown): Promise<CosmeticItemView> {
    const itemId = validateItemId(id);
    const input = validateUpdateInput(raw);

    const item = await this.items.findById(itemId);
    if (!item || item.userId !== input.userId) {
      throw new AppError(ErrorCode.CABINET_ITEM_NOT_FOUND, `衣橱条目不存在:${itemId}`);
    }

    const updated = updateCosmeticItem(item, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
    });
    await this.items.save(updated);

    return toCosmeticItemView(updated);
  }
}
