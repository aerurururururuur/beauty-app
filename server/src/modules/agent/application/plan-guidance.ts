/**
 * application/plan-guidance.ts —— 把一份方案渲染成给模型看的几行。
 *
 * ★ **两个读者,一份渲染**:`read_style_recipe`(做决定之前读的参考)与
 *   `propose_look` 的成功回执(它真记下的那一份,可能叠了个性化调整)。
 *   两处必须是同一段文字,漂开就会出现"读到的和记下的不是一套"。
 *
 * ★ 步骤那一行带 `(区名)`:模型填 `zones` 时,那张对照表就是它。
 * ★ 产品那一行带 `pid/code`:它是**推荐产品的合法取值**,也是模型能抄的真色号。
 */
import { targetOfStepName } from './step-zones.js';
import type { PlanDraft, PlanView } from '../../styling/index.js';

/** `· 步骤名(区):做法`。★ 认不出区的步骤(护肤 / 妆前 …)不缀括号,照旧列出。 */
export function planGuidance(plan: PlanView | PlanDraft): string[] {
  return plan.steps.map((step) => {
    const target = targetOfStepName(step.name);
    const at = target && target !== 'none' ? `(${target})` : '';
    return `· ${step.name}${at}:${step.desc}`;
  });
}

/** `· 产品名 —— pid/code #hex`。★ 色号只住在这里,步骤里一个都不出现。 */
export function productGuidance(plan: PlanView | PlanDraft): string[] {
  return plan.products.map((p) => {
    const at = [p.pid, p.code].filter(Boolean).join('/');
    const hex = 'hex' in p && p.hex ? ` ${p.hex}` : '';
    return `· ${p.name} —— ${at}${hex}`;
  });
}
