/**
 * presentation/routes/users.route.ts —— 账号的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 */
import type { FastifyInstance } from 'fastify';
import { makeUsersController } from '../users.controller.js';
import type { UsersDeps } from '../users.controller.js';
import { MAX_PHOTO_DATAURL } from '../../domain/validators/photo.validator.js';

/**
 * 带头像那两条路由的请求体上限。
 * ★★ **必须比 validator 的 `MAX_PHOTO_DATAURL` 大**:小了先到的是 Fastify 那句英文 413,
 * 而不是我们那句「照片太大了,请换一张小一点的」。取两倍,够装 dataURL 头部与同体其它标量。
 */
const BODY_LIMIT = MAX_PHOTO_DATAURL * 2;

export function registerUsersRoutes(app: FastifyInstance, deps: UsersDeps): void {
  const controller = makeUsersController(deps);

  app.post('/users', controller.register);
  app.post('/users/login', controller.authenticate);
  app.get('/users/:id', controller.get);
  app.patch('/users/:id', { bodyLimit: BODY_LIMIT }, controller.update);
  // ⚠️ 三段,与两段的 `/users/:id` 不冲突(同 `personas.route.ts` 那条说明)。
  app.get('/users/:id/avatar', controller.avatar);
}
