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
 *   配方内容本身已由上面 ① 逐字段钉住,池子是它的派生。
 *
 * ✏️ **2026-10-02:步骤改由模型自撰,配方降为参考。** 于是 ④⑤ 两段换了两条口径:
 *   步骤不再挂产品(**色号上移到计划级的 `products`**),`meta` 只剩 `stepCount`
 *   (`minutes` / `level` 随配方定死一起删),`styleOptions` / `family` 整块消失。
 *   配方内容本身一个字没动(① 照旧),参考还要用。
 */
import { describe, expect, it } from 'vitest';
import { STYLE_LIBRARY, decoratePlan, derivePlan, styleById } from '../src/modules/styling/index.js';
import type {
  PlanDraft,
  PlanPersonalized,
  PlanProductDraft,
  StyleRecipe,
} from '../src/modules/styling/index.js';
import { realFeatures } from './helpers/face-catalog.js';
import { realCatalog, realHexOf } from './helpers/product-content.js';
import { frontendFeatureGroups, frontendStyles } from './helpers/frontend-kb.js';

/**
 * 前端那一刻**用户数据里真的会有**的一串特征 id(人设里存的就是这种裸 id):
 * 四个分组各一条,外加一个**后端词表里没有的** `legacy-xxx` ——
 * 用户人设存的 id 可能比词表旧,那是正常情况,两端都必须把它剔掉而不是报错。
 */
const FEATURE_IDS = ['eye-drop', 'face-round', 'lip-thin', 'skin-oily', 'legacy-xxx'] as const;

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

/**
 * 一条配方里的推荐产品摊平成**计划级**的样子:**按 `pid|code` 去重、顺序即首次出现**。
 * ★ 它是 ④ 那条对表的**期望值**(与实现对的是同一份原料),改动这条规则要两边一起改。
 */
function recipeProductsOf(style: StyleRecipe): PlanProductDraft[] {
  const out: PlanProductDraft[] = [];
  const seen = new Set<string>();
  for (const step of style.steps) {
    for (const p of step.products) {
      const key = `${p.pid}|${p.code}`;
      // 空 pid = 这条产品没有对到库里(配方里有一批这样写的名字),摊平时跳掉。
      if (p.pid === '' || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: p.name, pid: p.pid, code: p.code });
    }
  }
  return out;
}

/** 一条配方里**重复出现**的 `pid|code`(正常为空)。 */
function duplicateProductsOf(style: StyleRecipe): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const step of style.steps) {
    for (const p of step.products) {
      if (p.pid === '') continue;
      const key = `${p.pid}|${p.code}`;
      if (seen.has(key)) dupes.push(`${style.id} ${key}`);
      seen.add(key);
    }
  }
  return dupes;
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

});

// ── ② 色值回填的前提:配方里的 (pid, code) 必须查得到色值 ────────────────────
//
// ✏️ **2026-09-30:对手从"前端色号库"换成了"产品库"。**
//   色号此前只住在前端 `vue/src/api/kb/shades.js`,后端只写 `pid + code`、不写 hex。
//   那次把前端三份 kb 并进 `products/` 之后,`hexOf(pid, code)` 的取数变成了
//   组装根从 `ProductCatalog` 里查 —— 也就是下面 `realHexOf` 照抄的那一句。
//   ⚠️ 这条断言现在盯的**仍然是同一件真事**:配方里每一对非空的 `(pid, code)`
//   都必须查得到一个非空色值。查不到 ⇒ 色板少一块,而**界面上看不出来**。

describe('★ 配方里的色号在产品库里查得到(色板少一块没人看得出来)', () => {
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

  it('每条非空 code 都配着一个能查到非空 hex 的 pid', () => {
    const products = allProducts();
    // 21 套配方跑过一遍才算数 —— 池子空掉或者全被 `undefined` 跳过时,这条会红。
    expect(products.length).toBeGreaterThan(100);

    const unresolved = products
      .filter((p) => p.code !== '')
      // ★ 这就是过滤条件两半等价的那个**前提**:`derivePlan` 跳 `!pid || !code`、
      //   组装根的 `hexOf` 跳 `!hex`。`code` 非空时两者之差只剩 pid 与 hex ——
      //   pid 空而 hex 非空不可能(`hexOf` 也要求 pid),所以只可能反过来:
      //   **pid 有、色值查不到** ⇒ 色板会多出一块没有颜色的色卡,而没有任何一层会报。
      .filter((p) => p.pid === '' || realHexOf(p.pid, p.code) === '')
      .map((p) => `${p.where}(${p.pid} ${p.code})`);

    expect(unresolved).toEqual([]);
  });

  it('★ 没有「有色号但没 pid」的产品(那一种两端会分歧)', async () => {
    const products = allProducts();
    expect(products.filter((p) => p.code !== '' && p.pid === '').map((p) => p.where)).toEqual([]);
  });

  it('★★ 每一个非空 `pid` 都在产品库里取得到(悬空的 pid 是静默丢掉一整件产品)', () => {
    // ★ 这是**跨模块**的那条断言,也是这次重构唯一会咬人的地方:
    //   配方里的 pid 是一批**手写字符串**,而库里的 id 是另一个进程(导入器)生成的。
    //   两边对不上时,`hexOf` 只是返回空串 —— 那一步的产品**没有色块**,也不报错。
    //   ⚠️ 真实的撞车:合并那四组「一物多 slug」时,`bl-powder` / `bl-liquid` 两个 slug
    //   被并进了 `bl-couture-blush`,而配方里**有 21 处**还写着旧名字。
    //   (已经修好了;这条断言就是当时唯一能照见它的东西。)
    const dangling = [...new Set(allProducts().map((p) => p.pid).filter((pid) => pid !== ''))]
      .filter((pid) => realCatalog().find(pid) === undefined)
      .sort();
    expect(dangling, '配方里这些 pid 在产品库里没有对应的产品').toEqual([]);
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
      });

      // 顶部那几格直接取配方,不是拼出来的。
      expect(plan!.keywords).toEqual([...style.keywords]);
      expect(plan!.summary).toBe(style.summary);
      // ★ 只有 `stepCount`,而且是**数出来的**:`minutes` / `level` 随
      //   "配方定死步骤"一起删了(模型自撰步骤时它们没有信息源)。
      expect(plan!.meta).toEqual({ stepCount: style.steps.length });

      // ★ 配方步骤里那几支产品**整批上移到计划级**(色号从此只住在那儿)。
      expect(plan!.products, `配方 ${style.id} 的推荐产品与配方对不上`).toEqual(
        recipeProductsOf(style),
      );
      checked += 1;
    }
    // 表空掉时上面那个循环一次都不进,"全过"与"什么都没比"长得一样。
    expect(checked).toBe(STYLE_LIBRARY.length);
    expect(checked).toBeGreaterThan(0);
  });

  it('★ 同一条产品在两步里各出现一次 ⇒ 推荐产品里只留一支', () => {
    // ★ 21 套配方里**只有 `retrosmokey` 有这个写法**(腮红膏既当底妆打底、又当腮红),
    //   所以它必须点着名钉 —— 拿它当"重复的那种输入"是这段唯一的机会,
    //   别的配方都没有重复(没有它这条断言会在"全都没有重复"的世界里照样绿)。
    expect(STYLE_LIBRARY.flatMap(duplicateProductsOf)).toEqual(['retrosmokey bl-couture-blush|37']);

    const plan = derivePlan({ styleId: 'retrosmokey' })!;
    const hits = plan.products.filter((p) => p.pid === 'bl-couture-blush');
    expect(hits).toHaveLength(1);
    // 留下的那支带着第一次出现时的名字(不是被去重那次的)。
    expect(hits[0]?.name).toBe('恒久完美透肤烟染腮红');
  });

  it('★ 色板只收「推荐产品里真的用到的色号」:按 code 去重、最多 8 条', () => {
    let sawCapped = false;
    for (const style of STYLE_LIBRARY) {
      const plan = derivePlan({ styleId: style.id })!;
      const used = plan.products.filter((p) => p.pid !== '' && p.code !== '');
      const where = `配方 ${style.id}`;

      expect(plan.palette.length, `${where} 的色板超过 8 条`).toBeLessThanOrEqual(8);
      // 去重:同一个色号不该出现两次。
      expect(new Set(plan.palette.map((p) => p.code)).size, `${where} 的色板里有重复色号`).toBe(
        plan.palette.length,
      );
      // 每一条都真有来处 —— 色板里不该出现推荐产品里没有的色号。
      for (const entry of plan.palette) {
        const hit = used.find((p) => p.code === entry.code);
        expect(hit, `${where} 的色板里 ${entry.code} 在产品里没用到`).toBeDefined();
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
   * 步骤下的「注意事项」来自 `step-logic.ts` 里那张正则表(`STEP_LOGIC`)。
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

// ── ⑤ `decoratePlan`:色值怎么补、补不出来时丢谁留谁 ──────────────────────────
//
// ★ **这一段是 2026-09-30 补的,补的正是那次把色值从前端搬过来的动作。**
//   规则本体从前端 `api/design.js` 的 `decoratePlan` 逐字搬进了
//   `styling/application/decorate-plan.ts`;前端那半删掉了。
//   搬错一格不会有任何征兆:方案照出、界面照渲染,只是某个色块颜色不对 ——
//   所以这里既拿**真产品库**对一遍,也拿**假端口**把丢/留两条边界钉住。
describe('★ decoratePlan', () => {
  const shades = { hexOf: realHexOf };

  it('用真产品库补完:每块色板都有颜色,且与"第一个带它的推荐产品"一致', () => {
    let checked = 0;
    for (const style of STYLE_LIBRARY) {
      const draft = derivePlan({ styleId: style.id })!;
      const plan = decoratePlan(draft, shades);
      const where = `配方 ${style.id}`;

      // ★ 不变量:**色板里没有空颜色的块**(空的那种在 `decoratePlan` 里就被丢了)。
      for (const entry of plan.palette) {
        expect(entry.hex, `${where} 的色板里 ${entry.code} 没有颜色`).toMatch(/^#[0-9a-f]{6}$/i);
      }

      // 每块色板的色值 = 推荐产品里**第一个**带着这个 code、且查得到色的那一支。
      for (const entry of plan.palette) {
        const hit = plan.products.find((p) => p.code === entry.code && p.hex !== '');
        expect(hit, `${where} 的色板里 ${entry.code} 没有带颜色的那一支`).toBeDefined();
        expect(entry.hex).toBe(hit!.hex);
      }

      // 推荐产品一个不少;有色号的每一支都带上了色值。
      expect(plan.products.length).toBe(draft.products.length);
      for (const p of plan.products) {
        expect(p.hex).toBe(realHexOf(p.pid, p.code));
        if (p.pid !== '' && p.code !== '') {
          expect(p.hex, `${where} 的推荐产品 ${p.pid} ${p.code} 没查到颜色`).not.toBe('');
        }
      }
      checked++;
    }
    expect(checked).toBe(STYLE_LIBRARY.length);
  });

  it('★ 查不到颜色的产品**不占领那个色号**:后一支还能把它填上', () => {
    // 第一支产品的色值查不到、第二支查得到,同一个 code —— 色板该拿到第二支的。
    // (这是"这一支没色块",不是"这个色号没色块"。)
    //
    // ⚠️ **这里手拼一份方案,不走 `STYLE_LIBRARY`。** 21 套真配方里**没有**同一个色号
    //   出现两次的(每支产品的色号都不同),拿真配方跑这条规则根本跑不到 ——
    //   删掉规则本体它照样绿,那就是一条自我安慰的断言。
    const draft: PlanDraft = {
      styleId: 'test',
      styleName: '测试',
      summary: '',
      keywords: [],
      // 色板只有一条,而它在推荐产品里对应**两支**。
      palette: [{ code: 'X1', name: '甲' }],
      meta: { stepCount: 1 },
      steps: [{ id: 'test-01', name: '底妆', desc: '', tips: [] }],
      products: [
        { name: '甲', code: 'X1', pid: 'p-first' },
        { name: '甲(备选)', code: 'X1', pid: 'p-second' },
      ],
      personalized: [],
    };

    const plan = decoratePlan(draft, {
      hexOf: (pid, c) => (pid === 'p-second' && c === 'X1' ? '#123456' : ''),
    });

    expect(plan.palette).toEqual([{ code: 'X1', name: '甲', hex: '#123456' }]);
    // 而**第一支**自己仍然没有色块(它是"这一支没颜色",不该被别人的色值顶上)。
    expect(plan.products.map((p) => p.hex)).toEqual(['', '#123456']);
  });

  it('★ 一个色值都查不到时:**色板空、推荐产品原样留着**(hex 为空串),不报错', () => {
    const draft = derivePlan({ styleId: 'natural' })!;
    const plan = decoratePlan(draft, { hexOf: () => '' });

    expect(plan.palette).toEqual([]);
    // ★ 产品**一支都不许少** —— 色号查不到不等于这件产品没用到。
    //   把它删掉,用户就看不见要买什么了(与色板那一格刻意相反)。
    expect(plan.products.map((p) => [p.name, p.code, p.pid])).toEqual(
      draft.products.map((p) => [p.name, p.code, p.pid]),
    );
    for (const p of plan.products) expect(p.hex).toBe('');
    // 除色值外一个字没动。
    expect(plan.styleId).toBe(draft.styleId);
    expect(plan.personalized).toEqual(draft.personalized);
  });
});
