/**
 * modules/looks —— 「我的妆容档案」模块(public barrel)。
 * 存下用户**生成过的**妆容:一套方案的快照 + 一张**复制过来的**封面图,按 userId 归属。
 * 与 `cabinet` 是两件事:衣橱是"我有什么化妆品",档案是"我生成过什么妆"。
 *
 * ★ 本模块**不 import agent,也不 import assets**:源图与封面字节都经自己的端口
 *   (`render-source.ts` / `look-cover-store.ts`)声明,由组装根粘合。
 * ★ 封面必须在 `look-covers/` 新根下、隐私口径要对外说白 —— 两条都见模块 README。
 */

// ---- 领域实体(字段由 schema 推导,本文件只加归属守卫与工厂)----
export {
  Look,
  MAX_ITEMS_PER_USER,
  coverNotFound,
  coverUnavailable,
  createLook,
  lookNotFound,
} from './domain/entities/look.js';

// ---- schemas(形状/契约,无行为)----
export {
  createLookSchema,
  lookIdSchema,
  ownerIdSchema,
  ownerQuerySchema,
} from './domain/schemas/index.js';
export type { CreateLookRaw } from './domain/schemas/index.js';
/**
 * ★ **落盘行的形状也导出**(同 `cabinet` 那条测试接缝的理由):读出口的解析依据是它(§7.2),
 *   而「盘上写下去的键集合与这份 schema 一格不差」是唯一照得见「实体字段悄悄脱队」的那盏灯。
 *   **它是形状,不是规则**,别顺手往里加长度上限。
 */
export { lookSchema, lookTableSchema } from './domain/schemas/index.js';
export type { LookRow } from './domain/schemas/index.js';

// ---- validators(校验行为,语义错误码)----
export {
  MAX_DESCRIPTION,
  MAX_HEX,
  MAX_KEYWORDS,
  MAX_PALETTE,
  MAX_PRODUCTS,
  MAX_SEQ,
  MAX_STEPS,
  validateCreateInput,
  validateLookId,
  validateOwnerQuery,
} from './domain/validators/look.validator.js';
export type { CreateLookInput, OwnerQuery } from './domain/validators/look.validator.js';

// ---- 对外 API 契约 / DTO ----
export type { LookListView, LookView } from './domain/schemas/index.js';

// ---- ports(本模块持契约;实现见 infrastructure / 组装根)----
export type { LookRepository } from './domain/ports/look-repository.js';
export type { LookCoverStore } from './domain/ports/look-cover-store.js';
export type { RenderSource } from './domain/ports/render-source.js';
export type { UserDirectory } from './domain/ports/user-directory.js';
// 默认实现的导出只为组合根与测试(同 cabinet 导 JsonCosmeticRepository);业务代码请依赖上面的端口类型。
export { JsonLookRepository } from './infrastructure/json/look-repository.js';

// ---- 用例 ----
export { AddLook } from './application/usecases/add-look.js';
export { ListLooks } from './application/usecases/list-looks.js';
export { RemoveLook } from './application/usecases/remove-look.js';
export { ReadLookCover } from './application/usecases/read-look-cover.js';

// ---- presentation(HTTP 路由挂载)----
export { registerLooksRoutes } from './presentation/routes/looks.route.js';
export type { LooksDeps } from './presentation/looks.controller.js';

// ---- 组合根 ----
export { createLooksModule } from './compose.js';
export type { LooksModuleOptions, LooksModuleServices } from './compose.js';
