/**
 * modules/styling —— 妆容「方案」模块(public barrel)。
 *
 * 一份**方案**是「步骤 / 色板 / 产品 / 个性化调整」这几块内容,由风格配方
 * + 用户的面部特征**当场推导**出来。它是 `agent` 在 `propose_look` 那一步的产出之一
 * (另一半是 `makeup` 的妆面单)。
 *
 * ★ **没有 `compose.ts`**:本模块是**静态内容 + 纯函数**,没有配置、
 *   没有可换的实现,也就没有组合根可写。同 `shared/domain/scene-rules.ts` 的道理。
 *   ⚠️ `domain/ports/shade-lookup.ts` **不是**例外:那是一条**由本模块声明**、
 *   由组装根在 `src/index.ts` 里粘的缝(§7.1),本模块照旧一次 IO 都不做。
 * ★ **没有 `domain/validators/`**:这里没有任何**运行时**输入要校验——
 *   配方是编译期常量,`derivePlan` 的入参由调用方校验(那串 id 认不认得)。
 *   跨条目规则(配方里提到的色号必须查得到)钉在 `test/styling-plan.test.ts`。
 *
 * ── 产出分两步:`PlanDraft`(纯推导 / 给定数据组装)→ `decoratePlan`(+色值, `PlanView`) ──
 * 对外的形状**只有 `PlanView`**;`PlanDraft` 是中间物,别把它直接递给会话。
 *
 * ★ **两条入口**:`derivePlan`(配方参考展开)与 `composePlan`(模型自撰步骤)。
 *   后者是主路 —— 配方只当参考(见 `docs/` 与 `propose_look` 的说明)。
 */
export { STYLE_LIBRARY, styleById } from './domain/entities/style-recipes.js';
export type { StyleProduct, StyleRecipe, StyleStep } from './domain/entities/style-recipes.js';
export type { ShadeLookup } from './domain/ports/shade-lookup.js';
export { derivePlan } from './application/derive-plan.js';
export { composePlan } from './application/compose-plan.js';
export type { ComposePlanInput, ComposePlanStep } from './application/compose-plan.js';
/** ★ 色板条数上限 —— `propose_look` 拿它当模型自给色板的那道闸(超了打回,不静默截)。 */
export { MAX_PALETTE } from './application/plan-products.js';
export { decoratePlan } from './application/decorate-plan.js';
export type {
  PlanDraft,
  PlanPaletteEntry,
  PlanPaletteEntryDraft,
  PlanPersonalized,
  PlanProduct,
  PlanProductDraft,
  PlanStepDraft,
  PlanView,
} from './application/plan-view.js';
