/**
 * test/helpers/frontend-kb.ts —— 读**前端那几份知识库**(`vue/src/api/kb/*.js`)。
 *
 * ★ 只为一件事存在:**跨端对表**。特征策略 / 风格配方 / 肤色档 / 人设关系这几份内容,
 *   2026-09-30 起在后端各有一份(见 `styling` / `face-catalog` / `user`),
 *   而前端那一份**仍然是 `/vanity` 等页面在用的那一份**。
 *   两边漂开的坏法是"用户勾了 A、方案里印出 B",
 *   **界面上看不出来** —— 只有拿两边的源文件对一遍照得见。
 *   (同 `test/scene-rules.test.ts` 读 `vue/vite.config.js` 钉 alias 那条先例。)
 *
 * ✏️ **同日:`frontendShades()` 删了。** 色号(那 174 行 hex)是这次唯一**换了东家**
 *   的一份前端内容 —— 前端三份 kb 里的这一份整个并进了 `products/`,
 *   所以它读的 `kb/shades.js` 不再有对手可比,取数改走
 *   `test/helpers/product-content.ts` 的 `realHexOf()`(读发出去的那份内容本身)。
 *
 * ⚠️ 反过来,**下面这些前端文件在 C3(产品目录切后端)之后仍然都在**,对应关系也还成立:
 *   `kb/features.js` / `kb/styles.js` / `kb/skintones.js` / `api/personas.js`。
 *
 * ✏️ 2026-09-30:此前这里还有一个 `frontendGetDesignResult()`,比的是前端
 *   `api/design.js` 那套本地推导。阶段 5 把那套推导**删掉**了(方案改由后端产出),
 *   它一起退休 —— 但它读的 `STYLE_LIBRARY` 还在,而且从"跑得起来的函数"
 *   变成了**搬运前的原件**:后端那份必须与它逐字段相等。
 *
 * ✏️ **同日:`frontendSceneStyles()` 也删了。** 候选池(`SCENE_STYLES` /
 *   `stylePoolFor`)整个不在了(风格与场合是两张独立的表,自由组合),它读的东西
 *   在两端同时消失 —— 留着就会变成一条**读不到导出就抛**的死访问器。
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

export async function frontendStyles(): Promise<FrontendStyle[]> {
  return (await exportOf('../../../vue/src/api/kb/styles.js', 'STYLE_LIBRARY')) as FrontendStyle[];
}

// ── 人设库(✏️ 2026-09-30)────────────────────────────────────────────────────
//
// ★ 人设行里存的 `skinTone` **就是**下面这些前端 id,而它们是**用户数据** ——
//   后端那套 `SKIN_TONES` 长得像、色值逐条不同,拿它校验就是静默 422 掉每一份合法人设。
//   两套词必须能摆在一起对一遍照,这里就是那个地方。

/** 肤色档(`kb/skintones.js` 的 `SKIN_TONES`)。★ 只有前端有 `tone` / `desc` / `hex`。 */
export interface FrontendSkinTone {
  id: string;
  name: string;
  tone: string;
  desc: string;
  hex: string;
}

export async function frontendSkinTones(): Promise<FrontendSkinTone[]> {
  return (await exportOf('../../../vue/src/api/kb/skintones.js', 'SKIN_TONES')) as FrontendSkinTone[];
}

/** 关系档(`api/personas.js` 的 `RELATIONS`)。★ 后端 `PERSONA_RELATIONS` 对的就是它。 */
export interface FrontendRelation {
  id: string;
  label: string;
}

export async function frontendRelations(): Promise<FrontendRelation[]> {
  return (await exportOf('../../../vue/src/api/personas.js', 'RELATIONS')) as FrontendRelation[];
}

/**
 * 肤色档的两张映射表(`api/design.js`)。
 * ★ 读的是**运行时导出**:`SKIN_TONE_FROM_BACKEND` 是 `Object.fromEntries(…)` 现拼的,
 *   `design.js` 里根本没有那 8 行 —— 照源文件 grep 那 8 个键的会以为它不存在。
 */
export interface FrontendSkinToneMaps {
  /** 前端展示档 id → 后端档 id(`SKIN_TONE_TO_BACKEND`)。 */
  toBackend: Record<string, string>;
  /** 后端档 id → 前端展示档 id(`SKIN_TONE_FROM_BACKEND`)。★ 读脸预填那一条路用的就是它。 */
  fromBackend: Record<string, string>;
}

export async function frontendSkinToneMaps(): Promise<FrontendSkinToneMaps> {
  const rel = '../../../vue/src/api/design.js';
  return {
    toBackend: (await exportOf(rel, 'SKIN_TONE_TO_BACKEND')) as Record<string, string>,
    fromBackend: (await exportOf(rel, 'SKIN_TONE_FROM_BACKEND')) as Record<string, string>,
  };
}
