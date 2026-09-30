/**
 * presentation/products.controller.ts —— 产品库的请求 → 用例 翻译层。
 * GET /products        整库目录(卡片 + 分类树 + 全部色号)→ 200
 * GET /products/:id    一件产品的六维原文 + 手写补充 + 色号 → 200;未知 id → 404
 *
 * 很薄:两个用例都不收请求体,唯一的"翻译"是把路径参数原样递下去
 * (校验与 404 的翻译在用例里)。错误统一抛 `AppError`,由 shared 的错误处理器映射状态码。
 *
 * ✏️ 路径登记在 `presentation/routes/products.route.ts`(见 `weather.controller.ts` 那段说明)。
 */
import type { FastifyRequest } from 'fastify';
import type { GetProduct } from '../application/usecases/get-product.js';
import type { ListCatalog } from '../application/usecases/list-catalog.js';

export interface ProductsDeps {
  listCatalog: ListCatalog;
  getProduct: GetProduct;
}

export function makeProductsController(deps: ProductsDeps) {
  return {
    list: async () => deps.listCatalog.execute(),
    detail: async (request: FastifyRequest) =>
      deps.getProduct.execute((request.params as { id?: unknown }).id),
  };
}
