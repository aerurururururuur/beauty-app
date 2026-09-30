/**
 * src/app.ts —— Fastify 应用装配(web shell)。
 * 不是业务模块,只做三件事:cors/multipart 等框架插件、挂统一错误处理器、
 * 把各业务模块的 HTTP 路由按前缀 /api 挂上。业务组合在 src/index.ts 完成后再注入。
 */
import Fastify, { LogController } from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { ServerConfig } from './modules/shared/infrastructure/config.js';
import { makeErrorHandler } from './modules/shared/presentation/error-handler.js';
import type { UserModuleServices } from './modules/user/index.js';
import { registerPersonasRoutes, registerUsersRoutes } from './modules/user/index.js';
import type { WeatherModuleServices } from './modules/weather/index.js';
import { registerWeatherRoutes } from './modules/weather/index.js';
import type { CabinetModuleServices } from './modules/cabinet/index.js';
import { registerCabinetRoutes } from './modules/cabinet/index.js';
import type { ProductsModuleServices } from './modules/products/index.js';
import { registerProductsRoutes } from './modules/products/index.js';
import type { AgentModuleServices } from './modules/agent/index.js';
import { registerAgentRoutes } from './modules/agent/index.js';

export interface AppDeps {
  config: ServerConfig;
  user: UserModuleServices;
  weather: WeatherModuleServices;
  cabinet: CabinetModuleServices;
  /**
   * 产品库。★ **必填**(不是 `products?`)—— 这一格表达的是"装配时有没有把模块接上",
   * 而"这个部署有没有产品库"是**它内部** `queries` 空不空的事(见下面那段注册)。
   * 做成可选就等于多开一个"忘了传就静默少两条路由"的口子,那正是本仓要防的。
   */
  products: ProductsModuleServices;
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
    // ★ 自带的那套一个请求两条、字段散在嵌套对象里,本地根本扫不动。关掉,
    //   由下面那个 onResponse 一行说完。**别把两条都开着**,那就成了双份。
    //   ⚠️ 用 `logController` 而不是顶层那个 `disableRequestLogging`:后者已废弃。
    logController: new LogController({ disableRequestLogging: true }),
  });

  // 一行一条请求:`POST /api/agent/sessions 201 8ms`。4xx 走 warn、5xx 走 error,
  // 扫一眼就能挑出坏的那些。★ 整行**故意全 ASCII** —— 中文终端按 GBK 解时不会变乱码。
  app.addHook('onResponse', (request, reply) => {
    const line = `${request.method} ${request.url} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`;
    if (reply.statusCode >= 500) request.log.error(line);
    else if (reply.statusCode >= 400) request.log.warn(line);
    else request.log.info(line);
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

      // 人设库(2026-09-30 落地到 user 模块)。★ 不另开 `AppDeps.persona` 键 ——
      //   这六个用例本来就住在 `UserModuleServices` 上,模块边界是 user,路由就从 `deps.user` 取。
      registerPersonasRoutes(scoped, {
        listPersonas: deps.user.listPersonas,
        createPersona: deps.user.createPersona,
        updatePersona: deps.user.updatePersona,
        removePersona: deps.user.removePersona,
        readPersonaPhoto: deps.user.readPersonaPhoto,
        // ★ 自建肤色档这三条**不看任何开关**(它们不花钱、不依赖分析器):接上就有。
        listSkinTones: deps.user.listSkinTones,
        createSkinTone: deps.user.createSkinTone,
        removeSkinTone: deps.user.removeSkinTone,
        // ★ 自建特征那三条同理,同样不看开关。
        listCustomFeatures: deps.user.listCustomFeatures,
        createCustomFeature: deps.user.createCustomFeature,
        removeCustomFeature: deps.user.removeCustomFeature,
        // ★ 读脸那条:判"有没有读脸能力"只有一处(`user/compose.ts` 收没收 `faceReader`),这里不判。
        //   ⚠️ **漏了这一行就是本仓头号 bug**:配了 `VISION_ANALYZER=real`、日志照打,而路由根本没注册。
        ...(deps.user.analyzePersonaFace ? { analyzePersonaFace: deps.user.analyzePersonaFace } : {}),
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

      // 产品库(数字美妆台读它)。★ **整段跟着 `queries` 走**:`PRODUCTS_DIR` 指了不存在的
      //   路径时它是 `undefined` ⇒ 这两条路由**在 Fastify 上根本不存在** ⇒ 前端拿 404 去给一句人话。
      //   ⚠️ **改成"注册着但回空目录"就是本仓头号 bug**:界面会拿到一个 200 的空屏,
      //   看起来像"这个品牌没有产品"。判据只有一处(`products/compose.ts` 里 `queries` 空不空),
      //   这里一次都不重算。同一形状的先例见下面 agent 的 `analysis` 与上面 `analyzePersonaFace`。
      if (deps.products.queries) {
        registerProductsRoutes(scoped, {
          listCatalog: deps.products.queries.listCatalog,
          getProduct: deps.products.queries.getProduct,
        });
      }

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
