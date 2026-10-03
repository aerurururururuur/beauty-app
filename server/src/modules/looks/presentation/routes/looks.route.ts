/**
 * presentation/routes/looks.route.ts —— 「我的妆容档案」的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 */
import type { FastifyInstance } from 'fastify';
import { makeLooksController } from '../looks.controller.js';
import type { LooksDeps } from '../looks.controller.js';

export function registerLooksRoutes(app: FastifyInstance, deps: LooksDeps): void {
  const controller = makeLooksController(deps);

  app.post('/looks', controller.add);
  app.get('/looks', controller.list);
  app.delete('/looks/:id', controller.remove);
  app.get('/looks/:id/cover', controller.cover);
}
