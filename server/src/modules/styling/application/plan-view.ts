/**
 * application/plan-view.ts —— 一份「方案」的对外形状(`derivePlan` 的产出)。
 *
 * ★ **它是视图,不是实体**:由 `derivePlan` 从配方 + 用户特征**当场算出来**,
 *   不进任何存储(只跟着会话走)。所以这里用 interface 而不是 schema——
 *   同 `agent/application/agent-view.ts` 的 `AgentSessionView`。
 *
 * ── ★★ 2026-09-30:色值**上移到了这份视图里**,于是这里有了两组形状 ──────────────
 *
 * | 形状 | 谁产出 | 带 `hex` 吗 |
 * | --- | --- | --- |
 * | `PlanDraft` | `derivePlan`(纯函数、无 IO) | **不带** —— 它只认得配方,不认得产品库 |
 * | `PlanView` | `decoratePlan(draft, shades)` | **带** |
 *
 * 为什么不在 `derivePlan` 里一次给完:那会把「查色号」这件事塞进一个**纯推导**函数里,
 * 它就得收一个端口、变成本模块里唯一一处 IO。拆成两步之后,`PlanDraft → PlanView`
 * 这一步在测试里可以喂一个假 `ShadeLookup`,不需要真内容目录。
 *
 * ★ **色值的唯一来源是产品库的 `shades`**(不再是前端 `kb/shades.js`,那份已退役)。
 *   组装根把产品库包成 `ShadeLookup` 闭包注进来,见 `domain/ports/shade-lookup.ts`。
 *
 * ★ **与前端 `api/design.js` 的 `getDesignResult()` 逐字段对齐**——
 *   两边相等由 `test/styling-plan.test.ts` 钉着。刻意**没有**搬过来的四格:
 *   `id` / `taskId`(前端拼出来的本地假 id)、`title` / `tagline`
 *   (恒等于 `styleName` / `family` 的别名)、`steps[].imageUrl`(恒为空串、全仓零读者)。
 *   留一个只有一个生产者、值恒定的字段,就是本仓反复要修的那种假开关。
 */

/* ── 第一组:推导出来的形状(不带 hex) ────────────────────────────────── */

/** 方案里用到的一个色号。★ `name` 是**出自哪个产品**的名字,不是色号名。 */
export interface PlanPaletteEntryDraft {
  code: string;
  name: string;
}

/**
 * 方案里用到的一支产品。
 * ★ `pid` 是用来回查色值的,不是给用户看的——`code` 才是色号。
 */
export interface PlanProductDraft {
  name: string;
  code: string;
  pid: string;
}

/** 一步。`tips` 由步骤名命中 `STEP_LOGIC` 得到(可能为空)。 */
export interface PlanStepDraft {
  /** 形如 `natural-01`。★ 由 `derivePlan` 按配方下标生成,不由配方写死。 */
  id: string;
  name: string;
  desc: string;
  tips: string[];
  products: PlanProductDraft[];
}

/**
 * `decoratePlan` 之前的样子 —— `derivePlan` 的产出。
 * ⚠️ **它不进会话、不给前端**:真正的对外形状是下面那个 `PlanView`。
 */
export interface PlanDraft {
  styleId: string;
  styleName: string;
  family: string;
  summary: string;
  keywords: string[];
  palette: PlanPaletteEntryDraft[];
  meta: {
    stepCount: number;
    minutes: number;
    level: string;
  };
  steps: PlanStepDraft[];
  personalized: PlanPersonalized[];
  /** 「换一版」的候选:**同 `family` 的兄弟**(含自身),供前端摆切换条。 */
  styleOptions: PlanStyleOption[];
}

/* ── 第二组:补上色值之后的样子(这才是对外的 `PlanView`) ──────────────── */

/**
 * 色板上的一块。★ **`hex` 必有,而且一定非空。**
 *
 * 查不到色值的那一条**不进色板**(见 `decorate-plan.ts`):色板的全部用途就是摆色块,
 * 摆一块没有颜色的色卡,界面上是一格空白——而没人看得出来那本该有颜色。
 * 所以这里能立下"`hex` 非空"这条不变量;产品那一路(下面)不行,理由见它那段。
 */
export interface PlanPaletteEntry extends PlanPaletteEntryDraft {
  /** 形如 `#b03a3a`。**非空** —— 空字符串那种进不了色板。 */
  hex: string;
}

/**
 * 一步里的一支产品。
 *
 * ★ **`hex` 可以是空串**(= 这一支没有色块),这是与色板**刻意不同**的一格:
 * 色号查不到多半是产品库没配 / 内容缺色号,而**这支产品仍然真的用在这步里**——
 * 把它从步骤里删掉,用户就看不见自己要用什么了。产品留着、色点不画,才是老实的降级。
 */
export interface PlanProduct extends PlanProductDraft {
  /** 形如 `#b03a3a`;**空串 = 这一支没有色块**(产品库查不到 / 部署没配产品库)。 */
  hex: string;
}

/** 一步(色值已补齐)。 */
export interface PlanStep extends PlanStepDraft {
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

/** 一份**可以直接给前端**的方案:上面那份 `PlanDraft` 逐格补上 `hex`。 */
export interface PlanView extends PlanDraft {
  palette: PlanPaletteEntry[];
  steps: PlanStep[];
}
