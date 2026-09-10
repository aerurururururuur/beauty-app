/**
 * application/mapping/cosmetic-item-view.mapper.ts —— 领域 CosmeticItem → 对外 CosmeticItemView。
 * 只做纯投影,不含任何 IO。特性逐条**复制**成新对象,不把实体的引用透出去
 * (视图与领域对象从此互不影响,也顺带剥掉实体将来可能多出来的字段)。
 */
import type { CosmeticItem } from '../../domain/entities/cosmetic-item.js';
import type { CosmeticItemView } from '../../domain/api/cosmetic-item-view.js';

export function toCosmeticItemView(item: CosmeticItem): CosmeticItemView {
  return {
    id: item.id,
    userId: item.userId,
    name: item.name,
    attributes: item.attributes.map((attr) => ({ label: attr.label, value: attr.value })),
    createdAt: item.createdAt,
    ...(item.updatedAt !== undefined ? { updatedAt: item.updatedAt } : {}),
  };
}
