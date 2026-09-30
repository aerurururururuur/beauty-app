/**
 * application/usecases/get-product.ts —— `GET /api/products/:id` 的用例。
 *
 * ★ 它是**本模块唯一的错误翻译点**:领域层的 `find(id)` 查不到就是返回 `undefined`
 *   (§10:跨模块端口不抛),翻成 404 只在这里做一次。
 *   控制器因此不认识任何领域类型(同 weather 的 `GetWeather`)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { ProductCatalog } from '../../domain/ports/product-catalog.js';
import type { ProductDetailResponse } from '../../domain/schemas/index.js';
import { toProductDetailResponse } from '../products-view.js';

export class GetProduct {
  constructor(private readonly catalog: ProductCatalog) {}

  /**
   * `rawId` 是**路径参数**,类型上是 `unknown`(可能是数组、可能是 `undefined`)。
   *
   * ★ **形状不对与查不到共用同一个 404,不另报 422。** 理由:这里没有"格式"这回事——
   *   `products` 的 id 是个 slug,而 slug 的语法不对(= 库里不可能有它)与
   *   "语法对但库里没有"对调用方是**同一件事**。分两个码只会让前端多写一个分支。
   *   (编号那样的有格式参数才值得分开,本实体没有。)
   */
  execute(rawId: unknown): ProductDetailResponse {
    const id = typeof rawId === 'string' ? rawId : '';
    const product = this.catalog.find(id);
    if (!product) {
      throw new AppError(ErrorCode.PRODUCT_NOT_FOUND, `产品库里没有「${id}」这件产品`);
    }
    return toProductDetailResponse(product, this.catalog.library());
  }
}
