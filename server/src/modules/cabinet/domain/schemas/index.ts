/**
 * cabinet/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `entities/` 是持久化那一行的形状，`api/` 是请求/响应 DTO 的类型。
 * ★ 这里只声明「是什么结构」;长度与 id 格式在 `domain/validators/cosmetic-item.validator.ts`(§4.2)。
 */
export {
  cosmeticAttributeSchema,
  cosmeticItemSchema,
  cosmeticItemTableSchema,
  createItemSchema,
  itemIdSchema,
  ownerIdSchema,
  ownerQuerySchema,
  updateItemSchema,
} from './entities/cosmetic-item.js';
export type {
  CosmeticAttribute,
  CosmeticItemRow,
  CreateItemRaw,
  UpdateItemRaw,
} from './entities/cosmetic-item.js';

export {
  cosmeticAttributeViewSchema,
  cosmeticItemViewSchema,
  cosmeticListViewSchema,
} from './api/cosmetic-item-view.js';
export type {
  CosmeticAttributeView,
  CosmeticItemView,
  CosmeticListView,
} from './api/cosmetic-item-view.js';
