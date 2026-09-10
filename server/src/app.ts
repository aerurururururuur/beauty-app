/**
 * src/app.ts —— Fastify 应用装配(web shell)。
 * 不是业务模块,只做三件事:cors/multipart 等框架插件、挂统一错误处理器、
 * 把各业务模块的 HTTP 路由按前缀 /api 挂上。业务组合在 src/index.ts 完成后再注入。
 */
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { ServerConfig } from './modules/shared/infrastructure/config.js';
import { makeErrorHandler } from './modules/shared/presentation/error-handler.js';
import type { JobsModuleServices } from './modules/jobs/index.js';
import { registerJobsRoutes } from './modules/jobs/index.js';
import type { UserModuleServices } from './modules/user/index.js';
import { registerUsersRoutes } from './modules/user/index.js';
import type { WeatherModuleServices } from './modules/weather/index.js';
import { registerWeatherRoutes } from './modules/weather/index.js';
import type { CabinetModuleServices } from './modules/cabinet/index.js';
import { registerCabinetRoutes } from './modules/cabinet/index.js';

export interface AppDeps {
  config: ServerConfig;
  jobs: JobsModuleServices;
  user: UserModuleServices;
  weather: WeatherModuleServices;
  cabinet: CabinetModuleServices;
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

  // 错误码 → HTTP 的唯一映射(业务/框架错误统一出口)。
  app.setErrorHandler(makeErrorHandler(app.log));

  // 前缀只表达「部署在哪个 URL 空间」,不影响控制器里用到的业务路径。
  await app.register(
    async (scoped) => {
      scoped.get('/health', async () => ({
        ok: true,
        name: '@beauty-app/server',
        uptimeSec: Math.round(process.uptime()),
        now: new Date().toISOString(),
      }));

      registerJobsRoutes(scoped, {
        submitJob: deps.jobs.submitJob,
        getJob: deps.jobs.getJob,
        getJobResult: deps.jobs.getJobResult,
      });

      registerUsersRoutes(scoped, {
        registerUser: deps.user.registerUser,
        authenticateUser: deps.user.authenticateUser,
        getUser: deps.user.getUser,
      });

      registerWeatherRoutes(scoped, {
        getWeather: deps.weather.getWeather,
      });

      registerCabinetRoutes(scoped, {
        addCosmetic: deps.cabinet.addCosmetic,
        listCosmetics: deps.cabinet.listCosmetics,
        updateCosmetic: deps.cabinet.updateCosmetic,
        removeCosmetic: deps.cabinet.removeCosmetic,
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
