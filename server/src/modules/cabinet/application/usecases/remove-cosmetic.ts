/**
 * application/usecases/remove-cosmetic.ts —— 从衣橱里删一条。
 * 与修改同口径:归属不符时报"找不到",不报"无权"(理由见 update-cosmetic.ts)。
 * 删除后**不**回收任何东西(条目自身就是全部数据),故无返回值。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';
import { validateItemId, validateOwnerQuery } from '../../domain/validators/cosmetic-item.validator.js';

export class RemoveCosmetic {
  constructor(private readonly items: CosmeticRepository) {}

  async execute(id: string, raw: unknown): Promise<void> {
    const itemId = validateItemId(id);
    const { userId } = validateOwnerQuery(raw);

    const item = await this.items.findById(itemId);
    if (!item || item.userId !== userId) {
      throw new AppError(ErrorCode.CABINET_ITEM_NOT_FOUND, `衣橱条目不存在:${itemId}`);
    }

    await this.items.remove(itemId);
  }
}
