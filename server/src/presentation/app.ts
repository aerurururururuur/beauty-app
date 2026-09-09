/**
 * presentation/app.ts —— Fastify 应用装配(presentation 层)。
 * 只依赖用例集与配置,不直接 new 基础设施实现;组装在 src/index.ts。
 */
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { GetJob } from '../application/usecases/get-job.js';
import type { GetJobResult } from '../application/usecases/get-job-result.js';
import type { SubmitJob } from '../application/usecases/submit-job.js';
import type { ServerConfig } from '../infrastructure/config.js';
import { registerHealthRoutes } from './controllers/health.controller.js';
import { registerJobsRoutes } from './controllers/jobs.controller.js';
import { makeErrorHandler } from './error-handler.js';

export interface AppDeps {
  config: ServerConfig;
  submitJob: SubmitJob;
  getJob: GetJob;
  getJobResult: GetJobResult;
}

/**
 * 对外 URL 前缀。前端 VITE_API_BASE 默认 '/api',产物资源也用同一前缀,
 * 因此所有路由(含 GET /jobs/:id/result)统一挂在 /api 之下,前后端只认一个前缀。
 */
const API_PREFIX = '/api';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: deps.config.logLevel },
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: deps.config.maxUploadMb * 1024 * 1024,
      files: 12, // face 1 + scene ≤ 6(可选氛围参考图),留余量
      fields: 8, // meta(JSON 简报)一个标量 + 余量
    },
  });

  app.setErrorHandler(makeErrorHandler(app.log));

  // 前缀只表达「部署在哪个 URL 空间」,不影响控制器里用到的业务路径。
  await app.register(
    async (scoped) => {
      registerHealthRoutes(scoped);
      registerJobsRoutes(scoped, {
        submitJob: deps.submitJob,
        getJob: deps.getJob,
        getJobResult: deps.getJobResult,
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
