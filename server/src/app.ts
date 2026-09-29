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
import type { UserModuleServices } from './modules/user/index.js';
import { registerUsersRoutes } from './modules/user/index.js';
import type { WeatherModuleServices } from './modules/weather/index.js';
import { registerWeatherRoutes } from './modules/weather/index.js';
import type { CabinetModuleServices } from './modules/cabinet/index.js';
import { registerCabinetRoutes } from './modules/cabinet/index.js';
import type { AgentModuleServices } from './modules/agent/index.js';
import { registerAgentRoutes } from './modules/agent/index.js';

export interface AppDeps {
  config: ServerConfig;
  user: UserModuleServices;
  weather: WeatherModuleServices;
  cabinet: CabinetModuleServices;
  agent: AgentModuleServices;
}

/**
 * 对外 URL 前缀。前端 VITE_API_BASE 默认 '/api',产物资源也用同一前缀,
 * 因此所有路由(含 GET /agent/sessions/:id/renders/:seq)统一挂在 /api 之下,
 * 前后端只认一个前缀。
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
      // multipart 入口有**两条**,认的字段名不同(逐字见 agent/presentation/multipart.ts):
      //   `…/photo`  文件 `face` + 标量 `userId`;
      //   `…/images` 文件 `file` + 标量 `userId` / `kind`(这条口 `VISION_ANALYZER=off` 时不注册)。
      // 所以 `files: 1`(每条路由只收一张图)、`fields: 2`(最宽的那条正好两个标量)。
      // ⚠️ 超出的部分由 `@fastify/multipart` 直接报错,**不会**流进解析器——
      //   解析器里那两处"放掉多余的流"是给它自己的重复字段用的,别把两者当一回事。
      files: 1,
      fields: 2,
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

      // 对话 agent(普通 JSON;SSE 推流还没做,见控制器文件头)。
      registerAgentRoutes(scoped, {
        startSession: deps.agent.startSession,
        getSession: deps.agent.getSession,
        sendMessage: deps.agent.sendMessage,
        attachPhoto: deps.agent.attachPhoto,
        // ★ 会花钱的两条路之一(另一条是下面的 `analyses`)。它在这里被接到路由上,
        //   除此之外没有别的调用点。
        confirmRender: deps.agent.confirmRender,
        getRender: deps.agent.getRender,
        // ★ 读图那两条口。**原样转手,这里一次都不判** —— "这个部署有没有读图能力"
        //   的判据只有一处(`agent/compose.ts` 是否给 `analyzers`),转到这里已经是
        //   "有就有、没有就整个键不存在"。⚠️ 漏了这一行就是本仓头号 bug:
        //   配了 `VISION_ANALYZER=real`、日志也照打"已启用",而路由根本没注册。
        ...(deps.agent.analysis ? { analysis: deps.agent.analysis } : {}),
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
