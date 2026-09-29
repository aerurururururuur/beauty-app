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
export { loadFaceVocabulary } from './infrastructure/json/vocabulary-loader.js';
export { parseFaceVocabulary } from './domain/validators/vocabulary.validator.js';
export { createFaceCatalogModule } from './compose.js';
export type { FaceCatalogModuleOptions, FaceCatalogModuleServices } from './compose.js';
