/**
 * domain/entities/product.ts —— 一条产品记录的形状。
 *
 * ★ **这个形状 = 内容目录里那个 JSON 文件的形状**,不是重新设计的领域模型。
 * 内容由 `scripts/import-products.ts` 从品牌方的 docx 编译而来,这里只负责把它读进来。
 * 刻意不做"实体 ↔ 存储"的转换:转换层会立刻产生第二个真相。
 *
 * ★ `dimensions` 与 `derived` **物理分开**是有意的:
 *   - `dimensions` 是**品牌资料的原文**,一个字都没有改写;
 *   - `derived` 是**我们加工出来的索引字段**,只用于检索/展示,丢了可以重算。
 *   混在一起的话,过两天就没人分得清哪句是品牌说的、哪句是我们推断的——
 *   而这套系统里"谁说的"是红线(§13-6)。
 */

/**
 * 品牌资料自己定的六个维度(顺序即展示顺序)。
 *
 * ⚠️ `feedback`(**社交平台用户反馈摘要**)是**唯一可选**的一个:
 * 57 条里只有 47 条有,缺的那 10 条不是资料漏了,是那些产品本来就没被摘录。
 * ★ 而且它有个特别的身份——**它是品牌资料里的转述,不是我们采集的用户口碑**。
 * 转述它时必须说明出处(§13-6「不得伪装成用户口碑或中立评测」)。
 */
export const DIMENSION_KEYS = [
  'texture',
  'ingredients',
  'skinTypes',
  'occasions',
  'warnings',
  'feedback',
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** 六维度的中文名。解析器按它认行,展示也用它。 */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  texture: '质地/妆效',
  ingredients: '核心成分',
  skinTypes: '适用肤质',
  occasions: '适用天气/场景',
  warnings: '成分预警',
  feedback: '社交平台用户反馈摘要',
};

/**
 * 我们生成的索引字段。
 *
 * `lookSpecSlots` 是这条产品能对上妆面(`LookSpec`)的哪个槽位。
 * ★ **空数组是常见且正常的结果**——护肤/防晒/妆前/定妆在 `LookSpec` 里没有对应槽位
 * (它只有 base + lip/cheek/eyeshadow/brow),睫毛膏、眼线笔、高光同理。
 * 这个稀疏是**如实**,不是数据缺失。推荐时覆盖薄的地方要明说,不能硬凑。
 */
export interface ProductDerived {
  lookSpecSlots: string[];
  /** 所属系列(如「Pure Shots 悦享青春系列」)。只有护肤类有;原文照存。 */
  series?: string;
}

export interface Product {
  /** 如 `01-pure-shots-clean-reboot-cleanser`。★ 这是给模型用的句柄,也是文件名。 */
  id: string;
  /** 品牌资料里的编号(1–57)。留着便于和源文档对照。 */
  number: number;
  name: string;
  /** 类目 slug(如 `skincare`),对应 `library.json` 里的 categories[].id。 */
  category: string;
  dimensions: Partial<Record<DimensionKey, string>>;
  derived: ProductDerived;
  /**
   * 源资料在这个条目下写的**非维度**说明。
   * 目前只有 #36 藏金粉霜那条"待补"占位会用到——
   * ★ 它存在的意义是:**别让一个空壳看起来像"导成功了"**。
   */
  notes?: string[];
}
