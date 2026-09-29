/**
 * modules/products —— 产品库模块(public barrel)。
 * 把 `products/<库>/` 那份内容目录读成可查询的目录，供 agent 的工具消费。
 *
 * ★ **别处不该从这里拿 `JsonProductCatalog`。** 跨模块只用 `ProductCatalog`
 *   端口(agent 还会再包一层自己的端口，见 `agent/domain/ports/product-library.ts`)。
 *   导出具体实现只为让组装根能调 `library()` 打启动日志——这是 `cabinet` 的先例。
 *
 * ★ 端口给的是**领域类型**,给模型看的样子是 `application/products-view.ts` 里的**投影**
 *   (`toLibraryView` / `toProductDetailView`)。两者都是对外的一等公民,所以都在这里转出。
 */
export { DIMENSION_KEYS, DIMENSION_LABELS } from './domain/entities/product.js';
export type { DimensionKey, Product, ProductDerived } from './domain/entities/product.js';
export type {
  LibraryCategory,
  LibraryHealth,
  LibraryNote,
  MatchingGuide,
  ProductLibrary,
} from './domain/entities/library.js';
export type { ProductCatalog } from './domain/ports/product-catalog.js';
export type {
  CategoryView,
  DimensionView,
  LibraryView,
  ProductDetailView,
  ProductSummaryView,
} from './application/products-view.js';
export {
  toLibraryView,
  toProductDetailView,
  toProductSummaryView,
} from './application/products-view.js';
export { JsonProductCatalog, loadCatalogIfPresent } from './infrastructure/json/content-loader.js';
export { createProductsModule } from './compose.js';
export type { ProductsModuleOptions, ProductsModuleServices } from './compose.js';
