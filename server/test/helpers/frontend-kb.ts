/**
 * test/helpers/frontend-kb.ts —— 读**前端那几份知识库**(`vue/src/api/kb/*.js`)。
 *
 * ★ 只为一件事存在:**跨端对表**。色卡 / 特征策略 / 风格配方这三份内容,
 *   2026-09-30 起在后端各有一份(见 `styling` 与 `face-catalog`),
 *   而前端那一份**仍然是 `/vanity` 等页面在用的那一份**。
 *   两边漂开的坏法是"用户勾了 A、方案里印出 B"或者"色块少了一块",
 *   **界面上看不出来** —— 只有拿两边的源文件对一遍照得见。
 *   (同 `test/scene-rules.test.ts` 读 `vue/vite.config.js` 钉 alias 那条先例。)
 *
 * ✏️ 2026-09-30:此前这里还有一个 `frontendGetDesignResult()`,比的是前端
 *   `api/design.js` 那套本地推导。阶段 5 把那套推导**删掉**了(方案改由后端产出),
 *   它一起退休 —— **但它读的那两样东西(`STYLE_LIBRARY` / `SCENE_STYLES`)** 还在,
 *   而且从"跑得起来的函数"变成了**搬运前的原件**:后端那份必须与它逐字段相等。
 *
 * ⚠️ **只能用动态 `import()` + `new URL()`,不能写静态 import。**
 *   `test/tsconfig.json` 里 `allowJs` 是关的,静态 import 一个 `.js` 会当场变成
 *   一条类型错误;而这几份文件**本来就是被当数据读的** —— 要的是它导出的数组,
 *   不是它的类型。所以下面每个访问器都把结果收成**这里手写的形状**:
 *   那是一次**有意的窄化**(不是 `as any` 糊过去),少了它,`any` 会顺着对表测试
 *   漏进断言里,`toEqual` 就变成了"随便什么都相等"。
 */

/** 一个特征分组的**展示面**(`FEATURE_GROUPS`)。 */
export interface FrontendFeatureGroup {
  id: string;
  name: string;
  hint: string;
}

/** 一条特征策略(`FEATURE_LIBRARY`)。⚠️ `products` 是产品名,自由文本,不是 `pid`。 */
export interface FrontendFeature {
  id: string;
  group: string;
  name: string;
  desc: string;
  fix: string;
  products: string[];
}

/** 配方里的一支产品。`pid` / `code` 都可能为空(没色号的产品),两端都会跳过它。 */
export interface FrontendProduct {
  name: string;
  pid: string;
  code: string;
}

export interface FrontendStep {
  name: string;
  action: string;
  products: FrontendProduct[];
}

/** 一条风格配方(`STYLE_LIBRARY`)。 */
export interface FrontendStyle {
  id: string;
  name: string;
  family: string;
  keywords: string[];
  minutes: number;
  level: string;
  summary: string;
  steps: FrontendStep[];
}

/** 色号库里的一支色号。这份表**只有前端有** —— 后端不存 hex(硬约定 2)。 */
export interface FrontendShade {
  code: string;
  hex: string;
}
export interface FrontendShadeEntry {
  label: string;
  shades: FrontendShade[];
}

/**
 * 取一个前端模块的具名导出。
 * `rel` 相对本文件(`vue/src/api/kb/features.js` 这样写)。
 */
async function exportOf(rel: string, name: string): Promise<unknown> {
  const mod = (await import(new URL(rel, import.meta.url).href)) as Record<string, unknown>;
  const value = mod[name];
  if (value === undefined) {
    throw new Error(`前端 ${rel} 里没有导出 ${name} —— 对表测试要读的东西被人改名了。`);
  }
  return value;
}

export async function frontendFeatureGroups(): Promise<FrontendFeatureGroup[]> {
  return (await exportOf('../../../vue/src/api/kb/features.js', 'FEATURE_GROUPS')) as FrontendFeatureGroup[];
}

export async function frontendFeatures(): Promise<FrontendFeature[]> {
  return (await exportOf('../../../vue/src/api/kb/features.js', 'FEATURE_LIBRARY')) as FrontendFeature[];
}

/** 色号库。★ 回填 hex 用的就是它 —— 后端给的方案里没有色值。 */
export async function frontendShades(): Promise<Record<string, FrontendShadeEntry>> {
  return (await exportOf('../../../vue/src/api/kb/shades.js', 'SHADE_LIBRARY')) as Record<
    string,
    FrontendShadeEntry
  >;
}

export async function frontendStyles(): Promise<FrontendStyle[]> {
  return (await exportOf('../../../vue/src/api/kb/styles.js', 'STYLE_LIBRARY')) as FrontendStyle[];
}

/** 场景 → 候选风格 id。★ 前端只有 5 个场景,后端那 8 个场合里另 3 个只经对话进来。 */
export async function frontendSceneStyles(): Promise<Record<string, string[]>> {
  return (await exportOf('../../../vue/src/api/kb/styles.js', 'SCENE_STYLES')) as Record<string, string[]>;
}
