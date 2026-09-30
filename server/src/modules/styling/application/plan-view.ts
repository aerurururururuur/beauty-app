/**
 * application/plan-view.ts —— 一份「方案」的对外形状(`derivePlan` 的产出)。
 *
 * ★ **它是视图,不是实体**:由 `derivePlan` 从配方 + 用户特征**当场算出来**,
 *   不进任何存储(只跟着会话走)。所以这里用 interface 而不是 schema——
 *   同 `agent/application/agent-view.ts` 的 `AgentSessionView`。
 *
 * ★★ **不含 `hex`。** 色值的唯一来源是前端 `vue/src/api/kb/shades.js`,
 *   后端只给 `pid + code`,由前端 `hexOf` 回填。理由写在
 *   `domain/entities/style-recipes.ts` 的硬约定 2。
 *
 * ★ **与前端 `api/design.js` 的 `getDesignResult()` 逐字段对齐**——
 *   两边相等由 `test/styling-plan.test.ts` 钉着。刻意**没有**搬过来的四格:
 *   `id` / `taskId`(前端拼出来的本地假 id)、`title` / `tagline`
 *   (恒等于 `styleName` / `family` 的别名)、`steps[].imageUrl`(恒为空串、全仓零读者)。
 *   留一个只有一个生产者、值恒定的字段,就是本仓反复要修的那种假开关。
 */

/** 方案里用到的一个色号。★ `name` 是**出自哪个产品**的名字,不是色号名。 */
export interface PlanPaletteEntry {
  code: string;
  name: string;
}

/**
 * 方案里用到的一支产品。
 * ★ `pid` 是给前端回查 hex 用的,不是给用户看的——`code` 才是色号。
 */
export interface PlanProduct {
  name: string;
  code: string;
  pid: string;
}

/** 一步。`tips` 由步骤名命中 `STEP_LOGIC` 得到(可能为空)。 */
export interface PlanStep {
  /** 形如 `natural-01`。★ 由 `derivePlan` 按配方下标生成,不由配方写死。 */
  id: string;
  name: string;
  desc: string;
  tips: string[];
  products: PlanProduct[];
}

/**
 * 针对用户本人面部特征的一条调整建议。
 * ★ 内容来自 `face-catalog` 的特征策略表(`assests/face-catalog/features.json`),
 *   **不是模型现编的**——模型只能决定"用哪几条",决定不了"那条说的是什么"。
 */
export interface PlanPersonalized {
  id: string;
  /** 分组 id,如 `eye`。 */
  group: string;
  /** 分组中文名,如「眼部」。 */
  groupName: string;
  name: string;
  desc: string;
  fix: string;
  /** 知识库原文里点到的产品名(自由文本,**不是** `pid`)。 */
  products: string[];
}

/** 风格切换条上的一条。步骤数量与顺序本来就不同,所以 `stepCount` 要摆出来。 */
export interface PlanStyleOption {
  id: string;
  name: string;
  family: string;
  summary: string;
  stepCount: number;
}

export interface PlanView {
  styleId: string;
  styleName: string;
  family: string;
  summary: string;
  keywords: string[];
  /** 由「本方案真的用到的色号」推导,保证色板与步骤永远一致。最多 8 条。 */
  palette: PlanPaletteEntry[];
  meta: {
    stepCount: number;
    minutes: number;
    level: string;
  };
  steps: PlanStep[];
  personalized: PlanPersonalized[];
  /** 这个场合的**全部**候选风格(顺序即推荐优先级),供前端摆切换条。 */
  styleOptions: PlanStyleOption[];
}
