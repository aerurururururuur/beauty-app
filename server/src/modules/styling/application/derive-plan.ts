/**
 * application/derive-plan.ts —— 把「一条配方 + 用户特征」展开成一份方案。
 *
 * ★ **纯函数、无 IO**:配方是静态内容,推导只是查表与拼装。
 * ★ **它产不出 hex**:色值要查产品库 —— 补上色值那一步是 `decoratePlan`。
 * ★ 行为契约(搬自前端 `vue/src/api/design.js`,**别"顺手优化"**):
 *   · 步骤 id 是 `${style.id}-${两位下标}`;
 *   · `STEP_LOGIC` 首个命中的正则胜出,顺序有意义(`step-logic.ts`)。
 *
 * ✏️ 2026-10-02:**这条路的产物降级为「参考」**。步骤里不再绑 SKU,色号上移到计划级
 *   `products`;`styleOptions` / `family` 整块删掉(配方切换条没了)。
 */
import { styleById } from '../domain/entities/style-recipes.js';
import type { StyleRecipe } from '../domain/entities/style-recipes.js';
import { buildPalette, uniqueProducts } from './plan-products.js';
import { logicFor } from './step-logic.js';
import type { PlanDraft, PlanPersonalized, PlanProductDraft, PlanStepDraft } from './plan-view.js';

/** 把配方展开成步骤。**顺序即配方的顺序,一步都不许在推导里补。** */
function buildSteps(style: StyleRecipe): PlanStepDraft[] {
  return style.steps.map((t, i) => ({
    id: `${style.id}-${String(i + 1).padStart(2, '0')}`,
    name: t.name,
    desc: t.action,
    tips: logicFor(t.name),
  }));
}

/** 配方里提到的产品,摊平成计划级的一份(去重)。★ 色号只住在它里面。 */
function productsOf(style: StyleRecipe): PlanProductDraft[] {
  return uniqueProducts(
    style.steps.flatMap((t) => t.products.map((p) => ({ name: p.name, code: p.code, pid: p.pid }))),
  );
}

/**
 * 展开一份方案。
 *
 * ★ `styleId` 必须是**认得的一条配方** —— 不认得就返回 `undefined`,
 *   由调用方翻成给模型的错误(列出全部可选,见 `propose_look`)。
 *   刻意**不回落**到第一条:那会让模型给错 id 时静默出一套它没选的妆。
 *
 * ★ `personalized` 由调用方**按顺序解析好**再传进来(未知 id 已剔掉)——
 *   本模块不认得 `face-catalog`,那是另一份内容目录的事(§7.1)。
 */
export function derivePlan(input: {
  styleId: string;
  personalized?: readonly PlanPersonalized[];
}): PlanDraft | undefined {
  const style = styleById(input.styleId);
  if (!style) return undefined;

  const steps = buildSteps(style);
  const products = productsOf(style);

  return {
    styleId: style.id,
    styleName: style.name,
    summary: style.summary,
    keywords: [...style.keywords],
    palette: buildPalette(products),
    meta: { stepCount: steps.length },
    steps,
    products,
    personalized: [...(input.personalized ?? [])],
  };
}
