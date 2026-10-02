/**
 * application/plan-view.ts —— 一份「方案」的对外形状。
 *
 * ★ **它是视图,不是实体**:由会话带着走,不进任何存储(所以用 interface 不是 schema)。
 * ★ 产出分两步:纯推导的 `PlanDraft`(**不带 hex**)→ `decoratePlan` 补色值成 `PlanView`。
 *   色值的唯一来源是产品库,经由注入的 `ShadeLookup`(见 `domain/ports/shade-lookup.ts`)。
 * ★ **色号只住在计划级的 `products` 里** —— 步骤文本由模型写用法,不绑具体 SKU。
 */

/* ── 第一组:推导出来的形状(不带 hex) ────────────────────────────────── */

/**
 * 色板上的一块。✏️ 2026-10-02:**两种来源共用一个形状** ——
 *   · 由推荐产品推出来的(`buildPalette`):`code` 是色号,`name` 是**出自哪个产品**,`hex` 留空;
 *   · **模型直接给的颜色**:没有色号时 `code` 是空串,`name` 是**颜色名**(「复古红」),`hex` 已经带着。
 * ⚠️ 一个概念只有一个出处:**模型给了 `palette` 就不再用产品推**(见 `compose-plan.ts`),
 *   两边拼起来的话,这份色板是谁定的就说不清了。
 */
export interface PlanPaletteEntryDraft {
  /** 色号。★ **空串 = 这个颜色没有对应色号**(模型自己给的颜色)。 */
  code: string;
  /** 展示名。产品推出来的填**产品名**,模型给的填**颜色名**。 */
  name: string;
  /** ★ 现成的色值(`#b03a3a`)。**只有模型直接给的颜色有** —— 产品推出来的留给 `decoratePlan` 回查。 */
  hex?: string;
}

/** 方案里推荐的一支产品。★ `pid` 用来回查色值;`code` 空串 = 整件推荐(没有色号)。 */
export interface PlanProductDraft {
  name: string;
  code: string;
  pid: string;
}

/** 一步。`tips` 由步骤名命中 `STEP_LOGIC` 得到(可能为空),不由模型给。 */
export interface PlanStepDraft {
  /** 形如 `natural-01`。★ 按下标生成,不由步骤名推。 */
  id: string;
  name: string;
  desc: string;
  tips: string[];
}

/**
 * `decoratePlan` 之前的样子 —— `derivePlan` / `composePlan` 的产出。
 * ⚠️ **它不进会话、不给前端**:真正的对外形状是下面那个 `PlanView`。
 */
export interface PlanDraft {
  /** 参考了哪条配方(kebab id)。★ 可选:模型也可以完全自己写一套。 */
  styleId?: string;
  styleName: string;
  summary: string;
  keywords: string[];
  palette: PlanPaletteEntryDraft[];
  /**
   * ⚠️ 只有 `stepCount`,**没有 `minutes` / `level`**。
   * 那两格来自配方内容,而步骤改为模型自撰后就没有信息源了——
   * 在界面上摆一个凭空来的"约 30 分钟"正是本仓最恨的假开关。
   */
  meta: { stepCount: number };
  steps: PlanStepDraft[];
  /** 推荐产品。**色号的唯一来源** —— 步骤里一个色号都不出现。 */
  products: PlanProductDraft[];
  personalized: PlanPersonalized[];
}

/* ── 第二组:补上色值之后的样子(这才是对外的 `PlanView`) ──────────────── */

/**
 * 色板上的一块(对外那份)。★ **`hex` 必有,而且一定非空。**
 * 查不到色值的那一条**不进色板**(见 `decorate-plan.ts`)——色板的全部用途就是摆色块,
 * 摆一块没有颜色的色卡,界面上是一格空白,而没人看得出来那本该有颜色。
 */
export interface PlanPaletteEntry extends PlanPaletteEntryDraft {
  /** 形如 `#b03a3a`。**非空** —— 空字符串那种进不了色板。 */
  hex: string;
}

/**
 * 推荐产品里的一支。
 * ★ **`hex` 可以是空串**(= 没色块,整件推荐或产品库没配色号),这是与色板**刻意不同**的一格:
 *   这支产品仍然真的推荐给用户,把它删掉用户就看不到买什么了。色点不画才是老实的降级。
 */
export interface PlanProduct extends PlanProductDraft {
  /** 形如 `#b03a3a`;**空串 = 这一支没有色块**。 */
  hex: string;
}

/**
 * 针对用户本人面部特征的一条调整建议。
 * ★ 内容来自 `face-catalog` 的特征策略表,**不是模型现编的**——
 *   模型只能决定"用哪几条",决定不了"那条说的是什么"。
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

/** 一份**可以直接给前端**的方案:上面那份 `PlanDraft` 逐格补上 `hex`。 */
export interface PlanView extends PlanDraft {
  palette: PlanPaletteEntry[];
  products: PlanProduct[];
}
