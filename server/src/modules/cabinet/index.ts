/**
 * modules/cabinet —— 衣橱模块(public barrel)。
 * 用户自己的化妆品:名称 + **自定义特性**(标签/值),按 userId 归属。
 * 这是 roadmap §9「用户『已拥有产品』从哪来」的答案——将来做平价推荐时按 userId
 * 经 `listByUser` 拿这份清单做「缺什么补什么」(§9 的空壳模块已删,见那节墓碑)。
 *
 * 本轮不做登录态:归属 userId 由客户端显式传,改/删都校验归属
 * (不符报"找不到",不报"无权")。跨模块协作只经由这里。
 */

// ---- 领域实体(纯数据 + 工厂)----
export { MAX_ITEMS_PER_USER, createCosmeticItem, updateCosmeticItem } from './domain/entities/cosmetic-item.js';
export type { CosmeticAttribute, CosmeticItem } from './domain/entities/cosmetic-item.js';

// ---- schemas(形状/契约,无行为)----
export {
  createItemSchema,
  itemIdSchema,
  ownerIdSchema,
  ownerQuerySchema,
  updateItemSchema,
} from './domain/schemas/index.js';
export type { CreateItemRaw, UpdateItemRaw } from './domain/schemas/index.js';

// ---- validators(校验行为,语义错误码)----
// ★ 七个长度常量跟着规则搬到了 validator(§4.2)。**仍从这里转出**,理由同 `shared` 的
//   `MAX_DRESS`/`MAX_SCENE_TEXT`:不让既有调用方改 import 路径。新代码请直接从
//   `domain/validators/cosmetic-item.validator.js` 引——barrel 上这条转发只是兼容。
export {
  MAX_ATTRIBUTES,
  MAX_ATTRIBUTE_LABEL,
  MAX_ATTRIBUTE_LABEL_RAW,
  MAX_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE_RAW,
  MAX_NAME,
  MAX_NAME_RAW,
  validateCreateInput,
  validateItemId,
  validateOwnerQuery,
  validateUpdateInput,
} from './domain/validators/cosmetic-item.validator.js';
export type {
  CleanAttribute,
  CreateItemInput,
  OwnerQuery,
  UpdateItemInput,
} from './domain/validators/cosmetic-item.validator.js';

// ---- 对外 API 契约 / DTO ----
export type {
  CosmeticAttributeView,
  CosmeticItemView,
  CosmeticListView,
} from './domain/schemas/index.js';

// ---- ports(本模块持契约;实现见 infrastructure)----
export type { CosmeticRepository } from './domain/ports/cosmetic-repository.js';
export type { UserDirectory } from './domain/ports/user-directory.js';
// 默认实现的导出只为组合根与测试(同 makeup 导 MockEngine);业务代码请依赖上面的端口类型。
export { JsonCosmeticRepository } from './infrastructure/json/cosmetic-repository.js';

// ---- 用例 ----
export { AddCosmetic } from './application/usecases/add-cosmetic.js';
export { ListCosmetics } from './application/usecases/list-cosmetics.js';
export { RemoveCosmetic } from './application/usecases/remove-cosmetic.js';
export { UpdateCosmetic } from './application/usecases/update-cosmetic.js';

// ---- presentation(HTTP 路由挂载)----
export { registerCabinetRoutes } from './presentation/routes/cabinet.route.js';
export type { CabinetDeps } from './presentation/cabinet.controller.js';

// ---- 组合根 ----
export { createCabinetModule } from './compose.js';
export type { CabinetModuleOptions, CabinetModuleServices } from './compose.js';
