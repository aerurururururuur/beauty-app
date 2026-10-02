/**
 * application/compose-plan.ts —— 由**给定数据**组一份方案(纯函数、无 IO)。
 *
 * ★ **这是模型自撰步骤那条路的入口**:配方只当参考,步骤由 `propose_look` 传进来,
 *   本函数只负责拼形状 —— **不校验**(步骤名认不认得、色号查不查得到,由 `agent` 在边界上判)。
 * ★ `tips` 复用 `logicFor(name)`(与 `derivePlan` 同一张表),模型改不了它。
 * ★ 色板:✏️ 2026-10-02 起**模型可以直接给**(`palette` 入参,带现成色值);
 *   没给才由 `products` 推出来。**两者不混** —— 一个概念只有一个出处,
 *   拼起来的话这份色板是谁定的就说不清了。
 */
import { buildPalette, uniqueProducts } from './plan-products.js';
import { logicFor } from './step-logic.js';
import type {
  PlanDraft,
  PlanPaletteEntryDraft,
  PlanPersonalized,
  PlanProductDraft,
  PlanStepDraft,
} from './plan-view.js';

/** 模型给的一步。★ **只有名字与做法,不绑产品** —— 色号在计划级的 `products` 里。 */
export interface ComposePlanStep {
  name: string;
  desc: string;
}

export interface ComposePlanInput {
  /** 参考了哪条配方。★ 可选:模型也可以完全自己写一套。 */
  styleId?: string;
  styleName: string;
  summary?: string;
  keywords?: readonly string[];
  steps: readonly ComposePlanStep[];
  /** 推荐产品。★ 色号只住在这里。 */
  products?: readonly PlanProductDraft[];
  /**
   * **模型直接给的色板**(可省)。★ 给了就用它,`hex` 得是现成的(`#b03a3a`);
   * 不给才由 `products` 推(见文件头)。形状与推出来那份共用一个
   * `PlanPaletteEntryDraft`:没有色号时 `code` 是空串。
   */
  palette?: readonly PlanPaletteEntryDraft[];
  personalized?: readonly PlanPersonalized[];
}

export function composePlan(input: ComposePlanInput): PlanDraft {
  // ★ 没有 `styleId` 时用 `look` 当前缀:步骤 id 必须**在方案内唯一且稳定**,
  //   `stepRenders` 那张表(步骤 id → 图号)就是靠它认人的。
  const prefix = input.styleId || 'look';
  const steps: PlanStepDraft[] = input.steps.map((s, i) => ({
    id: `${prefix}-${String(i + 1).padStart(2, '0')}`,
    name: s.name,
    desc: s.desc,
    tips: logicFor(s.name),
  }));

  const products = uniqueProducts([...(input.products ?? [])]);

  return {
    ...(input.styleId ? { styleId: input.styleId } : {}),
    styleName: input.styleName,
    summary: input.summary ?? '',
    keywords: [...(input.keywords ?? [])],
    palette: input.palette?.length ? [...input.palette] : buildPalette(products),
    meta: { stepCount: steps.length },
    steps,
    products,
    personalized: [...(input.personalized ?? [])],
  };
}
