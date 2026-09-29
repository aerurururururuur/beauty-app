/**
 * presentation/routes/jobs.route.ts —— 任务的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断。
 */
import type { FastifyInstance } from 'fastify';
import { makeJobsController } from '../jobs.controller.js';
import type { JobsDeps } from '../jobs.controller.js';

export function registerJobsRoutes(app: FastifyInstance, deps: JobsDeps): void {
  const controller = makeJobsController(deps);

  app.post('/jobs', controller.submit);
  app.get('/jobs/:id', controller.get);
  app.get('/jobs/:id/result', controller.getResult);
}
