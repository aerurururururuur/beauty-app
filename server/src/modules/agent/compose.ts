/**
 * modules/agent/compose.ts —— 组合根。
 * 按 `kind` 分发 LLM 实现,再把工具注册表、harness 与两个用例装起来。
 * 业务层 / 控制器都不感知具体是哪一家模型。
 *
 * 形状照 `weather/compose.ts`(`kind` union 在本模块**独立声明**,
 * 免得业务模块反向依赖组装层的配置类型;两处要一起改)。
 */
import type { Analyzers, Engine, SkinTonePalette } from '../makeup/index.js';
import type { ShadeLookup } from '../styling/index.js';
import type { CosmeticReader } from './domain/ports/cosmetic-reader.js';
import type { FeatureStrategies } from './domain/ports/feature-strategies.js';
import type { ProductLibrary } from './domain/ports/product-library.js';
import type { UserDirectory } from './domain/ports/user-directory.js';
import type { SessionStore } from './domain/ports/session-store.js';
import type { SessionArtifacts } from './domain/ports/session-artifacts.js';
import type { Llm } from './domain/ports/llm.js';
import { AgentLoop } from './application/agent-loop.js';
import { createToolRegistry } from './application/tools/registry.js';
import { StartSession } from './application/usecases/start-session.js';
import { GetSession } from './application/usecases/get-session.js';
import { SendMessage } from './application/usecases/send-message.js';
import { AttachPhoto } from './application/usecases/attach-photo.js';
import { AttachImage } from './application/usecases/attach-image.js';
import { AnalyzeImage } from './application/usecases/analyze-image.js';
import { ConfirmRender } from './application/usecases/confirm-render.js';
import { GetRender } from './application/usecases/get-render.js';
import {
  DEFAULT_SESSION_TTL_HOURS,
  PurgeExpiredSessions,
} from './application/usecases/purge-expired-sessions.js';
import { DashScopeLlm } from './infrastructure/llm/dashscope-llm.js';
import { DemoLlm } from './infrastructure/llm/demo-llm.js';
import { InMemorySessionStore } from './infrastructure/memory/session-store.js';

/**
 * LLM 开关。与 `shared/infrastructure/config.ts` 的 `agentLlm` 同形(那边读 `AGENT_LLM`)。
 *
 * ⚠️ **刻意没有 `off`**:对话 agent 没有 LLM 就什么也做不了,硬接一个 off 分支
 * 只会得到又一个假开关——同 `src/index.ts` 里对 `MAKEUP_ENGINE` 那段注释的理由。
 * 离线要兜底就用 `mock`,它至少还能回话。
 *
 * ★ **`mock` 现在是"脚本化演示"(`DemoLlm`),不是"空脚本 + 一句演示模式"。**
 *   改这一个取值的原因很具体:空脚本**永远走不到 `awaiting_confirmation`**
 *   (它的回复里没有 `tool_use`),于是「确认出图」这条全项目唯一花钱的链路,
 *   在**安全的缺省配置下一次都跑不起来**——而它恰恰是最需要能离线复现的那条。
 *   它是脚本、不是模型,这一点写在 `demo-llm.ts` 的文件头与 README 里。
 *
 * ⚠️ **也刻意没有第二个供应商分支。** `llm.ts` 端口已经把形状留好了(§7.3 第 8 条),
 * 但**现在写一个没人调用的空适配器,是一段没有实测支撑、也没人会发现的代码**——
 * 等真要换时再写,那时才有验证它的场合。
 */
export type AgentLlmKind = 'mock' | 'real';

export interface AgentModuleOptions {
  kind: AgentLlmKind;
  /** 仅 `kind='real'` 用。缺 key 时**启动即失败**,不留到第一次对话才炸。 */
  real: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs?: number;
  };
  /** 读用户衣橱。★ 由**组装根**把 cabinet 的 `listByUser` 包一层传进来(§7.1)。 */
  cosmetics: CosmeticReader;
  /**
   * ★ 开会话时校验归属用户是否存在。由**组装根**把 user 模块的 `getUser` 包一层传进来。
   *
   * **必填,刻意不给一个缺省**——同下面 `engine` 的理由,而且这里更硬:
   * 缺省成 `() => true` 就等于"检查静默消失",而那正是本轮踩过的坑
   * (见 `test/agent-render.test.ts` 里那个假存储的注释:漏一个方法,
   * `try/catch` 一吞,该跑的分支就没跑,而 typecheck 与测试**都是绿的**)。
   * **谁装配谁就必须明写。**
   */
  userExists: (userId: string) => Promise<boolean>;
  /**
   * ★ 真出图用的引擎(`makeup` 的端口,**同一个实例**由组装根注进来)。
   *
   * **必填,刻意不给一个缺省。** 缺省成什么都说不过去:缺省成假引擎,
   * 那就是"配好了却出不了图"(最坏的一种);缺省成真引擎,那更是替用户决定了花钱。
   * 谁装配谁就必须明写——和 `cosmetics` 同一条理由。
   */
  engine: Engine;
  /** 照片与成品图。★ 同样由组装根包一层 `assets` 的 `ArtifactStore` 传进来。 */
  artifacts: SessionArtifacts;
  /**
   * 词表端口。★ 由组装根把 `face-catalog` 的 `FaceVocabulary` 包一层传进来(§7.1)。
   * **必填**:缺了它 `propose_look` 就没法按肤色收窄色域,理由同 `userExists` / `engine`。
   */
  palette: SkinTonePalette;
  /**
   * 特征策略卡端口。★ 由组装根把 `face-catalog` 的 `FaceVocabulary` 包一层传进来(§7.1)。
   * **必填**:缺了它方案里「针对本人」那一块恒为空,而界面上看不出来,理由同 `palette`。
   */
  features: FeatureStrategies;
  /**
   * 色号 → 色值。★ 由组装根把 `products` 模块包一层传进来(§7.1)。
   * **必填**:缺了它方案里每一块色卡都没有颜色,而条数一格不少,理由同 `features`。
   *
   * ⚠️ **它与 `products` 不是一回事,别把它折进那个可选键里**:
   *   `products` 空 = 这个部署没有产品库(那时 `hexOf` 一律回空串,是本键的**合法值**);
   *   而本键空 = 接线漏了。前者是部署形态,后者是 bug——合成一格就分不出来了。
   */
  shades: ShadeLookup;
  /**
   * 读品牌产品库。★ 由组装根把 `products` 模块的 `ProductCatalog` 包一层传进来(§7.1)。
   *
   * ★ **可选,而且这是本模块唯一一个可选依赖。** 不传 = 这个部署没有内容目录 →
   *   `list_products` / `read_product` **不进注册表**(模型看不到它们)。
   *   ⚠️ **不是"注册了但返回空"**——那是假开关,理由写在 `tools/registry.ts` 那份注释里。
   */
  products?: ProductLibrary;
  /**
   * ★ 读图分析的三个适配器(`makeup` 的端口,**同一批实例**由组装根注进来)。
   *
   * **可选,而且缺省就是"这个部署没有读图能力"**:不传 = 那两条路由**不注册**、
   * 视图里不出现分析那块。与 `products` 同一条口径——**不是"注册了但返回空"**。
   */
  analyzers?: Analyzers;
  /** §10 `[I8]` 会话 TTL(小时)。缺省 `DEFAULT_SESSION_TTL_HOURS`。 */
  sessionTtlHours?: number;
  /** 单轮最大 LLM 往返(§10 `[I4]`)。 */
  maxIterations?: number;
  /** 单轮墙钟上限毫秒(§10 `[I4]`)。 */
  turnTimeoutMs?: number;
  /** 单次输出上限。 */
  maxTokens?: number;
}

export interface AgentModuleServices {
  sessions: SessionStore;
  llm: Llm;
  loop: AgentLoop;
  /** ★ TTL 清理**不自动跑**——由组装根按时钟调它(见 `src/index.ts` 那段 `setInterval`)。 */
  purgeExpired: PurgeExpiredSessions;
  startSession: StartSession;
  getSession: GetSession;
  sendMessage: SendMessage;
  attachPhoto: AttachPhoto;
  confirmRender: ConfirmRender;
  getRender: GetRender;
  /**
   * ★ 读图那两个用例。**没配 `analyzers` 时整个键不出现** ——
   * `app.ts` 把它原样转给路由,于是"关掉"表现为**入口不存在**。
   */
  analysis?: {
    attachImage: AttachImage;
    analyzeImage: AnalyzeImage;
  };
}

export function createAgentModule(options: AgentModuleOptions): AgentModuleServices {
  const llm: Llm = buildLlm(options);
  const sessionTtlHours = options.sessionTtlHours ?? DEFAULT_SESSION_TTL_HOURS;

  const sessions: SessionStore = new InMemorySessionStore();
  // ★ 一个函数 → 一个端口。形状与 cabinet 那份相同,所以组装根能把**同一个**闭包
  //   交给两边(见 `src/index.ts`);两份类型各自声明是 import 规矩要求的(见端口文件头)。
  const users: UserDirectory = { exists: options.userExists };
  const tools = createToolRegistry({
    cosmetics: options.cosmetics,
    engine: options.engine,
    artifacts: options.artifacts,
    palette: options.palette,
    features: options.features,
    shades: options.shades,
    // 只在真有时才传:`exactOptionalPropertyTypes` 下不能塞一个 `undefined` 进去,
    // 而且"没有产品库"与"产品库是 undefined"在这里本来就是同一件事。
    ...(options.products ? { products: options.products } : {}),
  });
  const loop = new AgentLoop({
    llm,
    tools,
    palette: options.palette,
    ...(options.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
    ...(options.turnTimeoutMs !== undefined ? { turnTimeoutMs: options.turnTimeoutMs } : {}),
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
  });

  return {
    sessions,
    llm,
    loop,
    purgeExpired: new PurgeExpiredSessions({
      sessions,
      artifacts: options.artifacts,
      ttlHours: sessionTtlHours,
    }),
    startSession: new StartSession({ sessions, users }),
    getSession: new GetSession({ sessions }),
    sendMessage: new SendMessage({ sessions, loop }),
    attachPhoto: new AttachPhoto({ sessions, artifacts: options.artifacts }),
    confirmRender: new ConfirmRender({ sessions, loop }),
    getRender: new GetRender({ sessions, artifacts: options.artifacts }),
    // ★ 没配分析器时**整个键不出现**(不是给一个 `undefined`)——语义上就是
    //   "这个部署没有读图能力",路由那边照此不注册那两条口。
    ...(options.analyzers
      ? {
          analysis: {
            attachImage: new AttachImage({
              sessions,
              artifacts: options.artifacts,
            }),
            analyzeImage: new AnalyzeImage({
              sessions,
              artifacts: options.artifacts,
              analyzers: options.analyzers,
            }),
          },
        }
      : {}),
  };
}

function buildLlm(options: AgentModuleOptions): Llm {
  // ★ `mock` ⇒ 脚本化演示(见上面 `AgentLlmKind` 的注释)。
  //   ⚠️ `MockLlm` **没有删**:它是单测的驱动源(按脚本顺序回话),测试直接 new 它;
  //     而 `DemoLlm` 按**请求状态**求值,所以同一个进程里开新会话能重演一遍,不用重启。
  // ★ 它要 `palette`:演示脚本得挑出**这个用户肤色下合法**的色,否则表单那条路配深肤色
  //   人设时会整套被 `validateLookSpec` 拒掉(理由见 `DemoLlm` 的构造参数)。
  if (options.kind === 'mock') return new DemoLlm(options.palette);

  const { apiKey, baseUrl, model, timeoutMs } = options.real;
  if (!apiKey) {
    // ★ 启动即失败,不留到运行时。理由同 §5.4 对 `.env.example` 那段过期注释的处置:
    //   **配置错了却"能启动",是最容易拖到演示当天才炸的一类问题。**
    throw new Error(
      'AGENT_LLM=real 但没有拿到 DASHSCOPE_API_KEY。' +
        '请在 .env 里填上(见 .env.example 的 LLM 一节),或把 AGENT_LLM 设为 mock 走离线兜底。',
    );
  }
  return new DashScopeLlm({
    apiKey,
    baseUrl,
    model,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
}
