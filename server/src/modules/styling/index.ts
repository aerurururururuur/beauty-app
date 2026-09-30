/**
 * modules/styling —— 妆容「方案」模块(public barrel)。
 *
 * 一份**方案**是「步骤 / 色板 / 产品 / 个性化调整」这几块内容,由风格配方
 * + 用户的面部特征**当场推导**出来。它是 `agent` 在 `propose_look` 那一步的产出之一
 * (另一半是 `makeup` 的妆面单)。
 *
 * ★ **没有 `compose.ts`**:本模块是**静态内容 + 纯函数**,没有配置、没有 IO、
 *   没有可换的实现,也就没有组合根可写。同 `shared/domain/scene-rules.ts` 的道理。
 * ★ **没有 `domain/validators/`**:这里没有任何**运行时**输入要校验——
 *   配方是编译期常量,`derivePlan` 的入参由调用方校验(那串 id 认不认得)。
 *   跨条目规则(配方里提到的色号必须查得到)钉在 `test/styling-plan.test.ts`。
 */
export { STYLE_LIBRARY, styleById } from './domain/entities/style-recipes.js';
export type { StyleProduct, StyleRecipe, StyleStep } from './domain/entities/style-recipes.js';
export { derivePlan } from './application/derive-plan.js';
export type {
  PlanPaletteEntry,
  PlanPersonalized,
  PlanProduct,
  PlanStep,
  PlanStyleOption,
  PlanView,
} from './application/plan-view.js';
