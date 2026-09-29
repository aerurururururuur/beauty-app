/**
 * application/usecases/remove-cosmetic.ts —— 从衣橱里删一条。
 * 与修改同口径:归属判定走实体的同一个具名守卫 `assertOwnedBy`,不在本文件重写一遍。
 * 删除后**不**回收任何东西(条目自身就是全部数据),故无返回值。
 */
import { itemNotFound } from '../../domain/entities/cosmetic-item.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';
import { validateItemId, validateOwnerQuery } from '../../domain/validators/cosmetic-item.validator.js';

export class RemoveCosmetic {
  constructor(private readonly items: CosmeticRepository) {}

  async execute(id: string, raw: unknown): Promise<void> {
    const itemId = validateItemId(id);
    const { userId } = validateOwnerQuery(raw);

    const item = await this.items.findById(itemId);
    if (!item) throw itemNotFound(itemId);
    item.assertOwnedBy(userId);

    await this.items.remove(itemId);
  }
}
