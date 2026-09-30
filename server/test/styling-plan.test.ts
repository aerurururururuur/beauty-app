/**
 * styling-plan.test.ts —— 跨端对表:`styling` 那份**配方内容**与前端 `vue/src/api/kb/styles.js`
 * 必须逐字段相同,外加 `derivePlan` 那几条行为契约。
 *
 * ★ **为什么对表是这一块的唯一正确性证据。**
 *   后端这份配方是 2026-09-30 从前端搬过来的。"搬家搬错了一格"这类错
 *   **没有任何别的征兆**:方案照常算出来、`/result` 照常渲染、日志干净,
 *   只有某一格内容不对——本仓的头号 bug 类型(假开关)。
 *   两边都是纯数据、都能在这一个进程里读起来,那就直接拿同一组去比。
 *
 * ★ 对表的**方向**是"前端说了算":`kb/styles.js` 是**搬运前的原件**,
 *   后端那份是它的搬迁版。所以断言写成"后端应等于前端"。
 *
 * ✏️ **2026-09-30 换了对手。** 此前这里比的是"后端 `derivePlan` vs 前端的
 *   `getDesignResult()`"。阶段 5 把前端那套本地推导**删掉**了(方案改由后端产出),
 *   于是对表劈成两半,各钉一件**现在仍然成立**的事:
 *     ① **内容对表**——后端配方 ≡ `kb/styles.js`(原件留着,同 `public/demo/` 那两个 SVG);
 *     ② **行为契约**——`derivePlan` 从配方展开出来的东西逐条对照**配方自己**
 *        (步骤 id 的拼法、palette 的去重与上限、步骤一笔不多一笔不少)。
 *   ② 不再有"另一端"可对,所以它改成**对配方本身**的断言 —— 这不是把手抄一遍
 *   (`derive-plan.ts` 是唯一一份推导),而是钉住"展开没漏没多"。
 *
 * ✏️ **同日再改:按场合分的候选池(`SCENE_STYLES`)删了。** 场合与风格是两张各自
 *   独立的预设表、自由组合,所以 `derivePlan` 不再收 `occasion`,遍历也从
 *   "8 个场合 × 各 4 条" 换成"**21 条配方各一次**"——覆盖面反而更大(此前有配方
 *   `retrosmokey` 一条池子都进不去,遍历池子根本跑不到它)。
 *   前端 `kb/styles.js` 里那张同名的表随之成了孤儿,所以那条"池子对表"删掉了:
 *   配方内容本身(含 `family`)已由上面 ① 逐字段钉住,池子是它的派生。
 */
import { describe, expect, it } from 'vitest';
import { STYLE_LIBRARY, derivePlan, styleById } from '../src/modules/styling/index.js';
import type { PlanPersonalized, StyleRecipe } from '../src/modules/styling/index.js';
import { realFeatures } from './helpers/face-catalog.js';
import {
  frontendFeatureGroups,
  frontendShades,
  frontendStyles,
} from './helpers/frontend-kb.js';
import type { FrontendShadeEntry } from './helpers/frontend-kb.js';

/**
 * 前端那一刻**用户数据里真的会有**的一串特征 id(人设里存的就是这种裸 id):
 * 四个分组各一条,外加一个**后端词表里没有的** `legacy-xxx` ——
 * 用户人设存的 id 可能比词表旧,那是正常情况,两端都必须把它剔掉而不是报错。
 */
const FEATURE_IDS = ['eye-drop', 'face-round', 'lip-thin', 'skin-oily', 'legacy-xxx'] as const;

/**
 * 照抄前端 `api/design.js` 的 `hexOf` 语义(色值只有前端有,后端只给 `pid + code`)。
 * ★ 抄一份在这里**不是**在复制一份真相:下面那条断言钉的是"配方里每一对非空的
 *   `(pid, code)` 都查得到色值",判据就是这一句 —— 它一旦与前端那边不同,
 *   色板就会与步骤里真的用到的色号对不上,而**界面上看不出来**。
 */
function hexOf(shades: Record<string, FrontendShadeEntry>, pid: string, code: string): string {
  if (!pid || !code) return '';
  const hit = shades[pid]?.shades.find((s) => s.code === code);
  return hit ? hit.hex : '';
}

/**
 * 特征 id → 策略卡。★ 照 `propose_look` 那道过滤(未知 id 剔掉,顺序即用户勾选的顺序),
 * 只是把端口换成测试里那份真词表。
 */
function personalizedOf(ids: readonly string[]): PlanPersonalized[] {
  const features = realFeatures();
  return ids
    .map((id) => features.byId(id))
    .filter((card): card is PlanPersonalized => card !== undefined);
}

// ── ① 内容对表:后端那份配方 ≡ 前端 `kb/styles.js`(搬运前的原件)──────────────

describe('★ 配方内容与 kb/styles.js 逐字段相同', () => {
  it('21 套配方逐条相同(按 id 比,少了哪一条、变了哪一格都能一眼看出来)', async () => {
    const fe = await frontendStyles();
    // 空对空也会"相等":先钉住两边都真有内容。
    expect(fe.length, 'kb/styles.js 里一条配方都没有').toBeGreaterThan(0);
    expect(fe.length, '两边的配方条数不同').toBe(STYLE_LIBRARY.length);

    const feById = new Map(fe.map((s) => [s.id, s]));
    for (const style of STYLE_LIBRARY) {
      expect(feById.get(style.id), `配方 ${style.id} 在 kb/styles.js 里没有`).toEqual(style);
    }
    // 反方向:前端多出来的那几条(上面那条按后端走,查不出多)。
    expect([...feById.keys()].filter((id) => styleById(id) === undefined)).toEqual([]);
  });

  it('★ 每条配方的 family 都非空(「换一版」靠它分组,空了那一组就只有它自己)', () => {
    // family 是**分组的唯一依据**(`derivePlan` 的 `styleOptions`),而它是自由字符串:
    // 写错一个字、漏填一次,都不会有别的征兆 —— 界面照常渲染,只是"换一版"里
    // 只剩当前这一条。所以这里点名钉住,别指望类型。
    expect(STYLE_LIBRARY.filter((s) => s.family.trim() === '').map((s) => s.id)).toEqual([]);
  });
});

// ── ② 色值回填的前提:配方里的 (pid, code) 必须查得到色值 ────────────────────

describe('★ 配方里的色号在前端色号库里查得到(色板少一块没人看得出来)', () => {
  /**
   * 全部配方里的产品,**逐条配方走一遍**。
   * ★ 走 `STYLE_LIBRARY` 而不是"把 8 个池子铺平":`STYLE_LIBRARY` 里有一套**哪条路都进不去**
   *   的配方 —— `retrosmokey` 不在任何场合的池子里(前端那份也一样,是搬过来时就带着的)。
   *   经池子走就会漏掉它,而"色值查不到"正好容易藏在没人跑到的那几条里。
   *   ⚠️ 这里**不改**那份内容:它往哪归是一个内容决定,而且前端必须跟着一起动。
   */
  function allProducts(): { where: string; pid: string; code: string }[] {
    return STYLE_LIBRARY.flatMap((style) =>
      style.steps.flatMap((step) =>
        step.products.map((p) => ({
          where: `${style.id} / ${step.name} / ${p.name}`,
          pid: p.pid,
          code: p.code,
        })),
      ),
    );
  }

  it('每条非空 code 都配着一个能查到非空 hex 的 pid', async () => {
    const shades = await frontendShades();
    const products = allProducts();
    // 21 套配方跑过一遍才算数 —— 池子空掉或者全被 `undefined` 跳过时,这条会红。
    expect(products.length).toBeGreaterThan(100);

    const unresolved = products
      .filter((p) => p.code !== '')
      // ★ 这就是两端过滤条件等价的那个**前提**:后端跳 `!pid || !code`、
      //   前端跳 `!hex || !code`。`code` 非空时两边之差只剩 pid 与 hex ——
      //   pid 空而 hex 非空不可能(hexOf 也要求 pid),所以只可能反过来:
      //   **pid 有、色值查不到** ⇒ 后端会给色板多推一块没有颜色的色卡,而前端不会。
      .filter((p) => p.pid === '' || hexOf(shades, p.pid, p.code) === '')
      .map((p) => `${p.where}(${p.pid} ${p.code})`);

    expect(unresolved).toEqual([]);
  });

  it('★ 没有「有色号但没 pid」的产品(那一种两端会分歧)', async () => {
    const products = allProducts();
    expect(products.filter((p) => p.code !== '' && p.pid === '').map((p) => p.where)).toEqual([]);
  });

  it('★ 「只有 pid、没有 code」是一条**正常**的路,别去"补齐"它', async () => {
    // 睫毛膏 / 妆前乳 / 蜜粉这类没有色号的产品就长这样。它们**不进色板**,
    // 但**留在步骤的产品列表里**——两端都照原样带着。这条钉住"确实有这一类",
    // 免得下一个人把这 55 条当成漏配塞一个假色号进去。
    const products = allProducts();
    expect(products.filter((p) => p.pid !== '' && p.code === '').length).toBeGreaterThan(0);
  });
});

// ── ③ 特征那一块:后端词表与前端库对不上时的行为一致 ────────────────────────

describe('★ 用户特征 → 策略卡', () => {
  it('未知 id 一律**剔掉**,不报错、不补一张通用的', () => {
    // 传进去 5 条,其中 `legacy-xxx` 查不到 ⇒ 只应留下 4 条。
    // ★ 前端那一半(它自己那份 `featureById` 返回 null 再 filter)已随本地推导删除;
    //   "两边认得同一批 id"由 `test/face-catalog.test.ts` 的对表钉着,这里只管**过滤**。
    const be = derivePlan({ styleId: 'banquet', personalized: personalizedOf(FEATURE_IDS) });
    expect(be?.personalized.map((c) => c.id)).toEqual(['eye-drop', 'face-round', 'lip-thin', 'skin-oily']);
  });

  it('顺序就是用户勾选的顺序(不是词表里的顺序)', () => {
    const picked = ['skin-oily', 'eye-drop'];
    const be = derivePlan({ styleId: 'banquet', personalized: personalizedOf(picked) });
    expect(be?.personalized.map((c) => c.id)).toEqual(picked);
  });

  it('分组的界面中文名两端一致(前端 `FEATURE_GROUPS[].name` 说了算)', async () => {
    const groups = await frontendFeatureGroups();
    const nameOf = new Map(groups.map((g) => [g.id, g.name]));
    const cards = personalizedOf(FEATURE_IDS);
    // 两端一致本身由 `face-catalog.test.ts` 那条对表钉着;这里钉的是**方案里印出去的那个名字**
    // 确实是分组表里的那一个 —— 中间漏了一次查表的话,卡片上会是空的。
    for (const card of cards) expect(card.groupName).toBe(nameOf.get(card.group));
  });
});

// ── ④ `derivePlan` 的行为契约:展开不许漏、不许多、不许改名 ──────────────────

describe('derivePlan 的边界与展开', () => {
  it('认不出来的 styleId → undefined(不回落第一条配方)', () => {
    expect(derivePlan({ styleId: 'no-such-style' })).toBeUndefined();
    // 空串同理:`splitInput` 会把空白 trim 成 undefined,但真收到空串也不能放过。
    expect(derivePlan({ styleId: '' })).toBeUndefined();
  });

  it('★ 「换一版」的候选 = 同 family 的兄弟(含自身,顺序即 `STYLE_LIBRARY`)', () => {
    const style = styleById('banquet')!;
    const plan = derivePlan({ styleId: 'banquet' })!;
    const want = STYLE_LIBRARY.filter((s) => s.family === style.family).map((s) => s.id);

    expect(plan.styleOptions.map((o) => o.id)).toEqual(want);
    // 自身在名单里(界面上那一条要能显示"就是它")。
    expect(want).toContain('banquet');
    // 别把整张表当成候选 —— 那就成了"换一版"会跳到不相干的路数上。
    expect(want.length).toBeLessThan(STYLE_LIBRARY.length);
  });

  /**
   * ★ 展开的唯一正确性判据:**拿方案对着配方自己看**。
   *   配方是内容(`STYLE_LIBRARY`),方案是它展开出来的东西 ——
   *   步骤一笔不多、一笔不少、顺序不变、id 拼法固定、`desc` 就是那一步的操作手法。
   *   这几条一起红了才是"搬家搬错了";只对一层(比如只比步骤名)会漏掉 id 那一层,
   *   而**两端的步骤导航按 id 对齐**(`useStepRail` 的锚点是 `step-${id}`)。
   *
   * ★ 遍历**全部 21 条配方**,不再按场合的池子走 —— 后者覆盖不到 `retrosmokey`
   *   (它此前一条池子都进不去),而"没人跑到的那几条"最容易藏错。
   */
  it('每条配方:步骤逐条对得上,id 是 `${style.id}-${两位下标}`', () => {
    let checked = 0;
    for (const style of STYLE_LIBRARY) {
      const plan = derivePlan({ styleId: style.id });
      expect(plan, `配方 ${style.id} 展开不出方案`).toBeDefined();

      expect(plan!.steps.length, `配方 ${style.id} 的步骤数对不上`).toBe(style.steps.length);
      style.steps.forEach((step, i) => {
        const got = plan!.steps[i];
        expect(got?.id).toBe(`${style.id}-${String(i + 1).padStart(2, '0')}`);
        expect(got?.name).toBe(step.name);
        // `desc` 是配方里的操作手法,不是另写的一句。
        expect(got?.desc).toBe(step.action);
        // 产品逐条照搬(名称 / 色号 / pid 都不改),**顺序也照搬**。
        expect(got?.products).toEqual(step.products);
      });

      // 顶部那几格直接取配方,不是拼出来的。
      expect(plan!.keywords).toEqual([...style.keywords]);
      expect(plan!.summary).toBe(style.summary);
      expect(plan!.family).toBe(style.family);
      expect(plan!.meta).toEqual({
        stepCount: style.steps.length,
        minutes: style.minutes,
        level: style.level,
      });
      checked += 1;
    }
    // 表空掉时上面那个循环一次都不进,"全过"与"什么都没比"长得一样。
    expect(checked).toBe(STYLE_LIBRARY.length);
    expect(checked).toBeGreaterThan(0);
  });

  it('★ 色板只收「步骤里真的用到的色号」:按 code 去重、最多 8 条', () => {
    let sawCapped = false;
    for (const style of STYLE_LIBRARY) {
      const plan = derivePlan({ styleId: style.id })!;
      const used = plan.steps.flatMap((s) => s.products).filter((p) => p.pid !== '' && p.code !== '');
      const where = `配方 ${style.id}`;

      expect(plan.palette.length, `${where} 的色板超过 8 条`).toBeLessThanOrEqual(8);
      // 去重:同一个色号不该出现两次。
      expect(new Set(plan.palette.map((p) => p.code)).size, `${where} 的色板里有重复色号`).toBe(
        plan.palette.length,
      );
      // 每一条都真有来处 —— 色板里不该出现步骤里没用到的色号。
      for (const entry of plan.palette) {
        const hit = used.find((p) => p.code === entry.code);
        expect(hit, `${where} 的色板里 ${entry.code} 在步骤里没用到`).toBeDefined();
        // `name` 是"出自哪个产品",取的是第一个带着它的那一支。
        expect(entry.name).toBe(hit!.name);
      }
      // 没到上限时,色板就是"全部用到的色号,按首次出现的顺序"。
      if (plan.palette.length < 8) {
        const firstSeen: string[] = [];
        for (const p of used) if (!firstSeen.includes(p.code)) firstSeen.push(p.code);
        expect(plan.palette.map((p) => p.code), `${where} 的色板与首次出现的顺序对不上`).toEqual(
          firstSeen,
        );
      }
      if (plan.palette.length === 8) sawCapped = true;
    }
    // 上限那一条只在"真有一份配方用到 8 个以上色号"时才比得出来。
    expect(sawCapped, '没有任何一份配方的色号超过 8 个 —— 上限那条没被比到').toBe(true);
  });

  /**
   * 步骤下的「注意事项」来自 `derive-plan.ts` 里那张正则表(`STEP_LOGIC`)。
   * ★ 它**不是**从用户特征来的,而是按**步骤名**命中的 —— 所以这里按步骤名钉几条:
   *   命中哪一条、命中不了会不会硬塞一句。
   *   ⚠️ 这张表**没导出**,所以只能经 `derivePlan` 从真配方里读;
   *     拿真配方里的步骤名断言是因为那才是它实际会遇到的输入。
   */
  it('「注意事项」按步骤名命中正则表,命中不了的步骤就是空的', () => {
    // `natural` 的步骤名正好覆盖了这里要试的几种。
    const styleId = 'natural';
    const tipsOf = (stepName: string) => {
      const at = styleById(styleId)!.steps.findIndex((s) => s.name === stepName);
      expect(at, `配方 ${styleId} 里没有名为「${stepName}」的步骤`).toBeGreaterThanOrEqual(0);
      return derivePlan({ styleId })!.steps[at]?.tips ?? [];
    };

    // 「护肤」不在那张表里 ⇒ 一步不许硬塞。
    expect(tipsOf('护肤')).toEqual([]);
    // 命中「底妆」那条。
    expect(tipsOf('底妆')[0]).toContain('少量多次');
    // 「妆前」命中的是表里**最后**那条(`/防晒|妆前/`),不是别的。
    expect(tipsOf('妆前')[0]).toContain('SPF50');
    // 一条步骤最多带一句注意事项。
    expect(tipsOf('眼妆').length).toBeLessThanOrEqual(1);
  });
});
