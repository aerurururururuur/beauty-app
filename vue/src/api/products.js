import api from './index'

/**
 * api/products.js —— 产品库(品牌内容)的 HTTP 调用。
 *
 *   GET /products        整库目录:分类树 + 全部产品卡 + 全部色号 → `CatalogView`
 *   GET /products/:id    一件产品的六维原文 + 手写补充 + 色号 → `ProductDetailResponse`
 *
 * 契约的唯一真源是 `server/src/modules/products/domain/schemas/api/products-view.ts`。
 * ★ **服务端用什么字段名,这里就照用**(`groups[].label` / `products[].categoryLabel` /
 *   `products[].text`),前端**不另起一套词**:这次整件事就是"同一件产品有两个名字",
 *   在传输层再翻一次等于把它请回来。
 *
 * ★ **刻意不给 mock 分支**(同 `agent.js` / `personas.js` / `weather.js`):
 *   产品库现在是 `products/` 那 66 条内容的**唯一**副本。本地编一份假目录,正好把
 *   "真的接上了"和"看起来接上了"变成一模一样。后端不起 → 整屏一句人话
 *   (`stores/vanity.js` 的 `catalogError`),不是一份看起来正常的假目录。
 *
 * ★ **404 有两种来路**,前端不区分、只展示后端那句话:库没加载时这两条路由**根本没注册**
 *   (`PRODUCTS_DIR` 指空,见 `presentation/routes/products.route.ts`),以及 id 不存在。
 *
 * ★ 本模块**只被 `api/vanity.js` 惰性引用**(那半边在首屏链上,见它的文件头)。
 *   新增调用点之前先想清楚:是不是又在往首屏包里塞 axios。
 */

/**
 * 整库目录:66 条卡片 + 全部色号(几十 KB,一次给全,理由见后端那份 schema)。
 * 返回形状原样透给 store,这里一个字段都不改名。
 */
export async function fetchProductCatalog() {
  return api.get('/products')
}

/** 一件产品的详情(**只在信息面板点开时取**,缓存与加载态在 store 里)。 */
export async function fetchProductDetail(productId) {
  return api.get(`/products/${encodeURIComponent(productId)}`)
}
