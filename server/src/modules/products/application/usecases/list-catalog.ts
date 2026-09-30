/**
 * application/usecases/list-catalog.ts —— `GET /api/products` 的用例。
 *
 * ★ **没有入参,也没有校验**:整库一次给全,没有筛选、没有分页、不收 `userId`。
 *   为什么不收 `userId` 写在路由文件里(`presentation/routes/products.route.ts`)——
 *   那是"这条路由为什么长得不像 cabinet 那几条"的说明,放这里会被下一个读控制器的人漏掉。
 *
 * ★ 它**不加缓存、不做懒加载**:库在启动时就整个读进内存了
 *   (`infrastructure/json/content-loader.ts`),所以"取全库"就是一次内存遍历。
 *   投影跟着跑一遍 —— 66 条的量级下不值得缓存,而缓存会引入第二份真相。
 */
import type { ProductCatalog } from '../../domain/ports/product-catalog.js';
import type { CatalogView } from '../../domain/schemas/index.js';
import { toCatalogView } from '../products-view.js';

export class ListCatalog {
  constructor(private readonly catalog: ProductCatalog) {}

  execute(): CatalogView {
    return toCatalogView(this.catalog.library(), this.catalog.list());
  }
}
