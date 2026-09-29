/**
 * modules/face-catalog —— 面部词表模块(public barrel)。
 * 把 `assests/face-catalog/` 那份内容目录读成一份可查询的 `FaceVocabulary`。
 *
 * ★ 对外只有 `FaceVocabulary` 这一个契约(实体本身就是契约)。加载函数与组件
 *   组合入口另外导出,供组装根使用 —— 这是 `products` 的先例。
 */
export {
  FaceVocabulary,
  FeatureDimension,
  FeatureValue,
  SkinToneTier,
} from './domain/entities/face-vocabulary.js';
/**
 * ★ **两个词表文件的形状也导出**(同 `cabinet` 那条测试接缝的理由)。
 * 实体不再自己声明字段了(形状在 schema 写一次、`Object.assign` 搬过来,§4.1/§7.4),
 * 于是「实体偷偷多一个 schema 里没有的字段」只剩**对表**这一盏灯照得见 ——
 * 只给类型不给 schema,那条测试写不出来(`test/face-catalog.test.ts`)。
 * ⚠️ 它们是**文件的形状**(宽 Raw:色是 `string`),不是收窄后的实体类型;
 *   枚举白名单仍在 `domain/validators/vocabulary.validator.ts`(§4.2)。
 */
export {
  dimensionSchema,
  featureValueSchema,
  toneTierSchema,
} from './domain/schemas/index.js';
export { loadFaceVocabulary } from './infrastructure/json/vocabulary-loader.js';
export { parseFaceVocabulary } from './domain/validators/vocabulary.validator.js';
export { createFaceCatalogModule } from './compose.js';
export type { FaceCatalogModuleOptions, FaceCatalogModuleServices } from './compose.js';
