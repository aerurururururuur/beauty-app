/**
 * products/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * 内容目录里那两个 JSON 文件的形状 = 资产文件的行，故进 `entities/`。
 * ✏️ 2026-09-30：**本模块有 HTTP 面了**（数字美妆台那一半界面读产品库），
 * 于是多出 `api/` 这一层 DTO。此前这里那句「无 HTTP 面，无 `api/`」作废。
 * ⚠️ 「目录不存在」仍然是合法的关闭形态——那时两条路由**不注册**，判断在 `compose.ts`。
 *
 * ★ 领域类型(`Product` / `ProductLibrary`)也由这里推导 —— 内容文件的形状**就是**
 *   领域模型，见 `entities/content.ts` 的文件头(§4.1)。
 */
export {
  DIMENSION_KEYS,
  dimensionKeySchema,
  libraryFileSchema,
  productFileSchema,
} from './entities/content.js';
export type { DimensionKey, LibraryFile, ProductFile } from './entities/content.js';
export {
  catalogViewSchema,
  productCardViewSchema,
  productDetailViewSchema,
  shadeViewSchema,
  shadesViewSchema,
} from './api/products-view.js';
export type {
  CatalogCategoryView,
  CatalogGroupView,
  CatalogView,
  ProductCardView,
  ProductDetailResponse,
  ProductDimensionView,
  ShadeView,
  ShadesView,
} from './api/products-view.js';
