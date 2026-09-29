/**
 * cabinet/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `entities/` 是持久化那一行的形状，`api/` 是请求/响应 DTO 的类型。
 * 这里只声明「是什么结构」，长度与格式规则在 `domain/validators/`。
 */
export {
  MAX_NAME_RAW,
  MAX_NAME,
  MAX_ATTRIBUTES,
  MAX_ATTRIBUTE_LABEL_RAW,
  MAX_ATTRIBUTE_LABEL,
  MAX_ATTRIBUTE_VALUE_RAW,
  MAX_ATTRIBUTE_VALUE,
  itemIdSchema,
  ownerIdSchema,
  createItemSchema,
  updateItemSchema,
  ownerQuerySchema,
} from './entities/cosmetic-item.js';
export type { CreateItemRaw, UpdateItemRaw } from './entities/cosmetic-item.js';

export type {
  CosmeticAttributeView,
  CosmeticItemView,
  CosmeticListView,
} from './api/cosmetic-item-view.js';
