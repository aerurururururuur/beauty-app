/**
 * application/decorate-plan.ts —— `PlanDraft` + 色号查询 → `PlanView`。
 *
 * ★ **这条规则是从前端 `vue/src/api/design.js` 的 `decoratePlan` 逐字搬过来的**
 *   (那次搬迁的边界见 `plan-view.ts` 的文件头)。搬过来之后前端那半**删掉**——
 *   色块的颜色从此由服务端给,前端只渲染。**别再让两边各补一次色值**:
 *   两份实现迟早会漂,而漂了以后界面上只是"某一块颜色不太对",没人会去查。
 *
 * ★ 行为契约(逐条对应,别"顺手优化"):
 *   · 色板的 `hex` 取**第一个带着该 `code` 的步骤产品**的色值;
 *   · 查不到色值的产品**不占领那个色号** —— 它后面那一支同色号的还能填上
 *     (这是「这一支没色块」,不是「这个色号没色块」);
 *   · 色板里最终仍然 `''` 的那条**丢弃**;步骤里的产品**留着**,`hex: ''`。
 *
 * ★ 纯函数,没有 IO —— 取色值那件事被推给了注入进来的 `ShadeLookup`
 *   (`domain/ports/shade-lookup.ts`)。所以这个函数在测试里喂个假端口就能跑。
 */
import type { ShadeLookup } from '../domain/ports/shade-lookup.js';
import type {
  PlanDraft,
  PlanPaletteEntry,
  PlanProduct,
  PlanStep,
  PlanView,
} from './plan-view.js';

export function decoratePlan(draft: PlanDraft, shades: ShadeLookup): PlanView {
  // 「色号 → 色值」。★ 先扫步骤而不是先扫色板:色板本来就是**从步骤推出来的**
  //   (`derive-plan.ts` 的 `buildPalette`),扫步骤才拿得到"第一个带着它的那一支"。
  const hexByCode = new Map<string, string>();
  for (const step of draft.steps) {
    for (const p of step.products) {
      // ⚠️ 三个条件缺一不可:`!hex` 跳过才是上面那条"不占领色号"的落点。
      if (!p.code || hexByCode.has(p.code)) continue;
      const hex = shades.hexOf(p.pid, p.code);
      if (hex === '') continue;
      hexByCode.set(p.code, hex);
    }
  }

  const palette: PlanPaletteEntry[] = [];
  for (const entry of draft.palette) {
    const hex = hexByCode.get(entry.code) ?? '';
    // ★ 空色值的**不进色板**:色板就是一支色块条,摆一格没有颜色的东西
    //   等于给用户看一个空白,而她无从知道那里本该有颜色。
    if (hex === '') continue;
    palette.push({ ...entry, hex });
  }

  const steps: PlanStep[] = draft.steps.map((s) => ({
    ...s,
    products: s.products.map(
      (p): PlanProduct => ({ ...p, hex: shades.hexOf(p.pid, p.code) }),
    ),
  }));

  return { ...draft, palette, steps };
}
