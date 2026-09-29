/**
 * face-catalog/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * 两个 JSON 词表文件的形状是两个持久化/资产文件的行，故进 `entities/`。
 * 「档位是否自洽」那类业务规则在 `domain/validators/vocabulary.validator.ts`。
 *
 * ★ 三个子形状(`toneTierSchema` / `featureValueSchema` / `dimensionSchema`)也转出：
 *   实体要从它们的输出类型上**切字段**(`SkinToneTier` 等),对表测试要用 `.shape`。
 *   ⚠️ 它们描述的是**文件**的形状(宽 Raw:色是 `string`、槽位是 `string`),
 *   收窄仍在 validator 里(§4.2),别拿这三个去 parse 一份外部数据。
 */
export {
  dimensionSchema,
  featureFileSchema,
  featureValueSchema,
  skinToneFileSchema,
  toneTierSchema,
} from './entities/vocabulary.js';
export type {
  DimensionRow,
  FeatureValueRow,
  ToneTierRow,
} from './entities/vocabulary.js';
