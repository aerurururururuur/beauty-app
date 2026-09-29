/**
 * domain/entities/product.ts —— 一条产品记录的形状。
 *
 * ★ **形状不在本文件**:`Product` 就是 `schemas/entities/content.ts` 那个
 *   `productFileSchema` 的输出类型(§4.1)。**内容目录里那个 JSON 文件的形状 = 领域模型**,
 *   不是重新设计的模型,也没有"实体 ↔ 存储"的转换——转换层会立刻产生第二个真相。
 *   所以内容由 `scripts/import-products.ts` 从品牌方的 docx 编译而来,这里只负责把它读进来。
 *   别在这里补 `id: string` 之类的字段声明 —— 那是第二份定义。
 *
 * ★ `dimensions` 与 `derived` **物理分开**是有意的:
 *   - `dimensions` 是**品牌资料的原文**,一个字都没有改写;
 *   - `derived` 是**我们加工出来的索引字段**,只用于检索/展示,丢了可以重算。
 *   混在一起的话,过两天就没人分得清哪句是品牌说的、哪句是我们推断的——
 *   而这套系统里"谁说的"是红线(§13-6)。
 *
 * 本文件**没有类**:产品记录是**只读内容**,没有需要「当前状态 / 归属」才判得了的规则
 * (整库校验在 `domain/validators/content.validator.ts`,是"数据坏了就不许启动",归持久层那侧)。
 * 没有行为可挂的类只会是一层脚手架(§3 同 `user` 的 `User`)。
 */
import type { DimensionKey, ProductFile } from '../schemas/index.js';

// ★ 维度键的**字面量**在 schema 层(它是形状的词汇表),这里只转出 —— 不另写一份。
export { DIMENSION_KEYS } from '../schemas/index.js';
export type { DimensionKey } from '../schemas/index.js';

/** 一条产品记录。字段的含义与约束写在 `schemas/entities/content.ts` 的对应格上。 */
export type Product = ProductFile;
/** 我们生成的索引字段。 */
export type ProductDerived = Product['derived'];

/** 六维度的中文名。解析器按它认行,展示也用它。 */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  texture: '质地/妆效',
  ingredients: '核心成分',
  skinTypes: '适用肤质',
  occasions: '适用天气/场景',
  warnings: '成分预警',
  feedback: '社交平台用户反馈摘要',
};
