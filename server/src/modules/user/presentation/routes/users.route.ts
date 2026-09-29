/**
 * presentation/routes/users.route.ts —— 账号的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 */
import type { FastifyInstance } from 'fastify';
import { makeUsersController } from '../users.controller.js';
import type { UsersDeps } from '../users.controller.js';

export function registerUsersRoutes(app: FastifyInstance, deps: UsersDeps): void {
  const controller = makeUsersController(deps);

  app.post('/users', controller.register);
  app.post('/users/login', controller.authenticate);
  app.get('/users/:id', controller.get);
}
