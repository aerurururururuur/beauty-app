/**
 * application/decorate-plan.ts —— `PlanDraft` + 色号查询 → `PlanView`。
 *
 * ★ 色值的唯一来源是注入进来的 `ShadeLookup`(`domain/ports/shade-lookup.ts`),
 *   所以本函数是纯的,测试里喂个假端口就能跑。
 *
 * ★ 行为契约(逐条对应,别"顺手优化"):
 *   · ✏️ 2026-10-02:**色板项自带 `hex` 的照用**(模型直接给的颜色),不查库;
 *   · 没有 `hex` 的取**第一个带着该 `code` 的推荐产品**的色值;
 *   · 查不到色值的产品**不占领那个色号** —— 它后面那一支同色号的还能填上;
 *   · 色板里最终仍然 `''` 的那条**丢弃**;推荐产品**留着**,`hex: ''`。
 */
import type { ShadeLookup } from '../domain/ports/shade-lookup.js';
import type { PlanDraft, PlanPaletteEntry, PlanProduct, PlanView } from './plan-view.js';

export function decoratePlan(draft: PlanDraft, shades: ShadeLookup): PlanView {
  // 「色号 → 色值」。★ 扫推荐产品而不是先扫色板:色板本来就是**从产品推出来的**
  //   (`plan-products.ts` 的 `buildPalette`),扫产品才拿得到"第一个带着它的那一支"。
  const hexByCode = new Map<string, string>();
  for (const p of draft.products) {
    // ⚠️ 三个条件缺一不可:`!hex` 跳过才是上面那条"不占领色号"的落点。
    if (!p.code || hexByCode.has(p.code)) continue;
    const hex = shades.hexOf(p.pid, p.code);
    if (hex === '') continue;
    hexByCode.set(p.code, hex);
  }

  const palette: PlanPaletteEntry[] = [];
  for (const entry of draft.palette) {
    // ★ 自带色值的(模型直接给的颜色)照用:它本来就没有色号可查。
    const hex = entry.hex || hexByCode.get(entry.code) || '';
    // ★ 空色值的**不进色板**:色板就是一支色块条,摆一格没有颜色的东西
    //   等于给用户看一个空白,而她无从知道那里本该有颜色。
    if (hex === '') continue;
    palette.push({ ...entry, hex });
  }

  const products: PlanProduct[] = draft.products.map((p) => ({
    ...p,
    hex: p.code ? shades.hexOf(p.pid, p.code) : '',
  }));

  return { ...draft, palette, products };
}
