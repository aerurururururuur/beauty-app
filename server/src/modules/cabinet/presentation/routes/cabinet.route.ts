/**
 * presentation/routes/cabinet.route.ts —— 衣橱的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 */
import type { FastifyInstance } from 'fastify';
import { makeCabinetController } from '../cabinet.controller.js';
import type { CabinetDeps } from '../cabinet.controller.js';

export function registerCabinetRoutes(app: FastifyInstance, deps: CabinetDeps): void {
  const controller = makeCabinetController(deps);

  app.post('/cabinet/items', controller.add);
  app.get('/cabinet/items', controller.list);
  app.patch('/cabinet/items/:id', controller.update);
  app.delete('/cabinet/items/:id', controller.remove);
}
