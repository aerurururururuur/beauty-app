/**
 * presentation/routes/products.route.ts —— 产品库的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。只有两条口。
 *
 * ★★ **不校验归属、不收 `userId`。** 这是品牌内容,不是用户数据——
 *   它挂在**品牌**下,不挂在账号下,所以这里没有"这条是不是你的"那层判断,
 *   形状与 `GET /weather` 同类,而不是 `GET /cabinet/items`。
 *   写这一句是给下一个读的人看:别条件反射照着 cabinet 那四个路由补 `?userId=` ——
 *   补上去只会让"产品库要账号"这件事看起来成立,而它不成立。
 *
 * ★★ **库不存在时这两条路由根本不注册**(`deps.catalog === undefined`,由调用方
 *   `app.ts` 那行展开决定)。**不做成"注册了但回空列表"** —— 那是本仓明令禁止的假开关:
 *   前端会拿到一个 200 的空目录屏,看起来像"这个品牌没有产品"。
 *   不注册 ⇒ 404 ⇒ 界面给一句人话。口径写在 `compose.ts`。
 */
import type { FastifyInstance } from 'fastify';
import { makeProductsController } from '../products.controller.js';
import type { ProductsDeps } from '../products.controller.js';

export function registerProductsRoutes(app: FastifyInstance, deps: ProductsDeps): void {
  const controller = makeProductsController(deps);

  app.get('/products', controller.list);
  app.get('/products/:id', controller.detail);
}
