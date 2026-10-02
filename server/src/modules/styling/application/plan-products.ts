/**
 * application/plan-products.ts —— 推荐产品列表,以及由它推出的顶部色板。
 *
 * ★ **两个读者共用**:`derivePlan`(配方参考展开)与 `composePlan`(模型自撰步骤)。
 *   两处推出来的色板必须一致,所以这条规则只写这一份。
 *
 * ★ 色板**从产品推** —— 保证色板与推荐产品永远一致。
 *   ✏️ 2026-10-02:模型**可以直接给颜色**(见 `compose-plan.ts` 的 `palette` 入参),
 *   那时走的是另一条路,本文件一个字母都没变。
 */
import type { PlanPaletteEntryDraft, PlanProductDraft } from './plan-view.js';

/** 色板条数上限。★ 一条跨端契约,改了前端的色板块数会跟着变。 */
export const MAX_PALETTE = 8;

/** 按 `pid|code` 去重:同一支产品在两个步骤里各提一次,只推荐一次。 */
export function uniqueProducts(list: readonly PlanProductDraft[]): PlanProductDraft[] {
  const seen = new Set<string>();
  const out: PlanProductDraft[] = [];
  for (const p of list) {
    if (!p.pid) continue;
    const key = `${p.pid}|${p.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: p.name, code: p.code, pid: p.pid });
  }
  return out;
}

/**
 * 按 `code` 去重(**不是** `(pid, code)`)、最多 8 条、空项跳过。
 * ⚠️ 查不到色值的那几条还会被 `decoratePlan` 丢掉 —— 两者合起来等价于
 *   "色板里每一条都有颜色",`test/styling-plan.test.ts` 把这条当断言钉着。
 */
export function buildPalette(products: readonly PlanProductDraft[]): PlanPaletteEntryDraft[] {
  const seen = new Set<string>();
  const out: PlanPaletteEntryDraft[] = [];
  for (const p of products) {
    if (!p.pid || !p.code) continue;
    if (seen.has(p.code)) continue;
    seen.add(p.code);
    // code 是色号,name 是出自哪个产品。
    out.push({ code: p.code, name: p.name });
  }
  return out.slice(0, MAX_PALETTE);
}
