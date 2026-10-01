/**
 * application/recipe-guidance.ts —— 把一条配方的**上妆要点**渲染成给模型看的几行。
 *
 * ★ **两个读者,一份渲染**(同 `style-options-description.ts` 的道理):
 *   ① `read_style_recipe` —— 模型**做决定之前**读的那一份;
 *   ② `propose_look` 的成功回执 —— 它真的记下的那一份(可能要叠个性化调整)。
 *   两处必须是同一段文字:漂开就会出现"读到的要点和记下的配方不是一套",
 *   而那正是这个工具要防的东西。
 *
 * ★★ 这一块文字是 2026-10-01 实测逼出来的:用户要「淡颜清冷妆」,拿到的是
 *   **莓果红唇 + 缎光 + 明显浓度**。模型挑的配方其实是对的(`coolclean` 就叫淡颜清冷妆),
 *   但配方正文**从没进过它的上下文** —— 提示里只有 `coolclean(淡颜清冷妆)` 这一串,
 *   而那条配方自己写着「低饱和腮红」「大地色系」「避免任何高饱和点缀」。
 */
import { targetOfStepName } from './step-zones.js';
import type { PlanView } from '../../styling/index.js';

/**
 * 这套配方里**与妆面有关**的步骤原文,连同它落在哪个区、用哪几支色号。
 *
 * ⚠️ 护肤 / 妆前 / 防晒 / 定妆**不列**:它们不动颜色,列进去只白占 token。
 * ⚠️ 色号必须带 `hex`(查不到时那格是空串,跳过):名字看不出「淡」,色值看得出。
 * ★ 每一行都带 `(区名)` —— 模型填 `propose_look` 的 `zones` 时,那张对照表就是它。
 */
export function recipeGuidance(plan: PlanView): string[] {
  const rows: string[] = [];
  for (const step of plan.steps) {
    const target = targetOfStepName(step.name);
    if (target === undefined || target === 'none') continue;
    const shades = step.products
      .map((p) => [p.name, p.code, p.hex].filter(Boolean).join(' '))
      .join(' / ');
    rows.push(`· ${step.name}(${target}):${step.desc}${shades ? ` —— ${shades}` : ''}`);
  }
  return rows;
}
