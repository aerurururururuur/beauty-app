/**
 * modules/products —— 产品库模块(public barrel)。
 * 把 `products/<库>/` 那份内容目录读成可查询的目录，供**两位读者**消费：
 * ① agent 的工具(`list_products` / `read_product`，经 `ProductCatalog` 端口，组装根粘合)；
 * ② `vue/` 的数字美妆台(经 `GET /api/products` 那两条路由，见 `presentation/`)。
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
  toCatalogView,
  toLibraryView,
  toProductCardView,
  toProductDetailResponse,
  toProductDetailView,
  toProductSummaryView,
} from './application/products-view.js';
export { GetProduct } from './application/usecases/get-product.js';
export { ListCatalog } from './application/usecases/list-catalog.js';
export { registerProductsRoutes } from './presentation/routes/products.route.js';
export type { ProductsDeps } from './presentation/products.controller.js';
export type {
  CatalogCategoryView,
  CatalogGroupView,
  CatalogView,
  ProductCardView,
  ProductDetailResponse,
  ProductDimensionView,
  ShadeView,
  ShadesView,
} from './domain/schemas/index.js';
export { JsonProductCatalog, loadCatalogIfPresent } from './infrastructure/json/content-loader.js';
export { createProductsModule } from './compose.js';
export type {
  ProductsModuleOptions,
  ProductsModuleServices,
  ProductsQueries,
} from './compose.js';
