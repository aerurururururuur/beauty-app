/**
 * looks/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `entities/` 是持久化那一行的形状，`api/` 是请求/响应 DTO 的类型。
 * ★ 这里只声明「是什么结构」;长度、条数与 id 格式在 `domain/validators/look.validator.ts`(§4.2)。
 */
export {
  createLookSchema,
  lookIdSchema,
  lookPaletteEntrySchema,
  lookPersonalizedSchema,
  lookProductSchema,
  lookSchema,
  lookStepSchema,
  lookTableSchema,
  ownerIdSchema,
  ownerQuerySchema,
} from './entities/look.js';
export type {
  CreateLookRaw,
  LookPaletteEntry,
  LookPersonalized,
  LookProduct,
  LookRow,
  LookStep,
} from './entities/look.js';

export { lookListViewSchema, lookViewSchema } from './api/look-view.js';
export type { LookListView, LookView } from './api/look-view.js';
