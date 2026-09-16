/**
 * modules/agent —— 对话 agent 模块(public barrel)。
 *
 * 依赖 `shared` 与 `makeup`(取 `LookSpec` 契约与 `describeLook`)。
 * ★ **不依赖 `cabinet`**:读衣橱走本模块自己的 `CosmeticReader` 端口,
 * 由组装根(`src/index.ts`)把 cabinet 的实现包一层注进来(§7.1)。
 *
 * 导出分成三段,分界是"谁会用到":
 *   ① **HTTP 层**——用例、视图、路由(对外服务);
 *   ② **组装根**——端口类型、模块装配函数;
 *   ③ **测试接缝**——harness、会话工厂、mock LLM。
 *
 * ★ 为什么连 ③ 也导出(本可以选择不导出):§11 把「用 mock LLM 脚本驱动
 * `agent-loop` 状态机」称为**这一层唯一真正的风险控制**,而测试按仓库惯例
 * 只从 barrel 取东西(`test/*.ts` 一律 `from '../src/modules/xxx/index.js'`)。
 * 要么开这个口子,要么为了"干净"把最有价值的那组测试挡在门外——
 * **后者是拿可测性换整洁,不划算。** 先例:`makeup` 导出 `MockEngine` 也是这个理由。
 */
export { createAgentModule } from './compose.js';
export type { AgentLlmKind, AgentModuleOptions, AgentModuleServices } from './compose.js';

// ---- ② 组装根要用的端口类型(注入 cabinet / assets / user 的实现时只认这些)----
export type { CosmeticReader, CabinetAttribute, CabinetItemSnapshot } from './domain/ports/cosmetic-reader.js';
/**
 * ★ 读品牌产品库的端口。组装根把 products 模块的 `ProductCatalog` 包一层喂进来——
 * ⚠️ 与 cabinet 那份同理,它与 products 的类型**同名同形但不是同一个类型**(§7.1)。
 * 可选依赖:不传就不注册那两个工具(见 `application/tools/registry.ts`)。
 */
export type {
  ProductLibrary,
  ProductLibraryOverview,
  ProductIndexEntry,
  ProductDetailSnapshot,
  ProductFact,
} from './domain/ports/product-library.js';
/**
 * ★ 开会话时校验归属用户的端口。
 * ⚠️ 它与 `cabinet` 那份**同名同形但不是同一个类型**——本模块不 import cabinet(§7.1)。
 * 组装根那边可以用同一个闭包满足两边(形状相同),见 `src/index.ts`。
 */
export type { UserDirectory } from './domain/ports/user-directory.js';
export type { SessionStore } from './domain/ports/session-store.js';
/**
 * ★ 照片与产物存取的端口。组装根用 `assets` 的 `ArtifactStore` 实现它——
 * 映射规则(嵌套 id)在 `src/index.ts` 的适配器里,不在业务代码里。
 */
export type { SessionArtifacts, PhotoUpload } from './domain/ports/session-artifacts.js';
export type { Llm, LlmRequest, LlmResponse, LlmToolDefinition, LlmStopReason, LlmUsage } from './domain/ports/llm.js';
export { LlmUnavailableError } from './domain/ports/llm.js';

// ---- ③ 测试接缝 ----
export { AgentLoop, DEFAULT_MAX_ITERATIONS, DEFAULT_MAX_TOKENS, DEFAULT_TURN_TIMEOUT_MS } from './application/agent-loop.js';
export type { AgentEvent, AgentLoopOptions, AgentStopReason, AgentTurnResult } from './application/agent-loop.js';
export {
  createSession,
  appendMessages,
  patchBrief,
  setLookSpec,
  setFaceRef,
  addRender,
  addConsultedProduct,
  rendersLeft,
} from './domain/entities/session.js';
export type { Session, RenderRecord, ConsultedProduct } from './domain/entities/session.js';
export {
  assistantMessage,
  danglingToolUses,
  textMessage,
  textOf,
  toolResults,
  toolUsesOf,
} from './domain/entities/message.js';
export type {
  ContentBlock,
  Message,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from './domain/entities/message.js';
export { indexTools } from './domain/tools/tool.js';
export type { Tool, ToolContext, ToolOutcome, PendingConfirmation } from './domain/tools/tool.js';
export {
  LIST_PRODUCTS,
  READ_PRODUCT,
  RENDER_LOOK,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
} from './domain/tools/definitions.js';
export { createToolRegistry } from './application/tools/registry.js';
// 工具类**单独导出**是为了能一对一测(测试只从 barrel 取东西,见文件头 ★)。
export { ListCabinetTool } from './application/tools/list-cabinet.js';
export { ListProductsTool } from './application/tools/list-products.js';
export { PatchBriefTool } from './application/tools/patch-brief.js';
export { ProposeLookTool } from './application/tools/propose-look.js';
export { ReadProductTool, renderProductDetail } from './application/tools/read-product.js';
export { RenderLookTool, renderConfirmationSummary, DEFAULT_MAX_RENDERS } from './application/tools/render-look.js';
export { MockLlm, mockText, mockTextAndToolCalls, mockToolCall } from './infrastructure/llm/mock-llm.js';
/**
 * ★ `AGENT_LLM=mock` 时服务端实际用的那个实现(脚本化演示,不是模型)。
 * 导出它是为了让 `test/demo-llm.test.ts` 能**用真的那一个**跑整条链路——
 * 测试里另起一个同形状的假货,就测不出"装配起来的那条到底通不通"。
 */
export { DemoLlm } from './infrastructure/llm/demo-llm.js';
/**
 * ★ 几段回给模型的 observation 的开头。
 * 导出理由同 `MockLlm`:测试要钉住它们(`test/demo-llm.test.ts`),
 * 而它们**不能**被抄第二份——演示驱动正是靠比对这几个前缀判断"出成了还是被拒了"。
 */
export {
  NO_CONFIRMATION_NOTICE,
  PHOTO_ATTACHED_NOTE,
  RENDER_DECLINED_PREFIX,
  RENDER_DONE_PREFIX,
} from './domain/tools/observations.js';
export { DashScopeLlm } from './infrastructure/llm/dashscope-llm.js';
export type { DashScopeLlmOptions } from './infrastructure/llm/dashscope-llm.js';
export { InMemorySessionStore } from './infrastructure/memory/session-store.js';

// ---- ① HTTP 层 ----
export { registerAgentRoutes } from './presentation/controllers/agent.controller.js';
export type { AgentDeps } from './presentation/controllers/agent.controller.js';
export { toSessionView, toTurnView } from './application/mapping/turn-view.mapper.js';
export type {
  AgentSessionView,
  AgentTurnView,
  ConsultedProductView,
  RenderView,
  SessionViewOptions,
} from './application/mapping/turn-view.mapper.js';
export { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from './application/system-prompt.js';
export { describeBrief } from './application/brief-description.js';
export { describeRenderState } from './application/render-state-description.js';
export { describeLookState } from './application/look-state-description.js';
export { StartSession } from './application/usecases/start-session.js';
export { GetSession } from './application/usecases/get-session.js';
export { SendMessage } from './application/usecases/send-message.js';
export { AttachPhoto } from './application/usecases/attach-photo.js';
export { ConfirmRender } from './application/usecases/confirm-render.js';
export { GetRender } from './application/usecases/get-render.js';
export type { RenderArtifact } from './application/usecases/get-render.js';
// ★ `patch_brief` 的入参形状。**导出它是为了让一条跨模块的契约可测**:
//   表单那条路(`jobs` 的 `metaSchema`)与本模块这条补丁路共用同一份字段规则
//   (见 `shared/domain/schemas/brief-fields.ts`),而"两条路给同一个答案"这件事
//   只有在同一处拿到**两边**的 schema 时才验得了(`test/schemas.test.ts`)。
//   没有这个export,那条测试就只能各写一遍断言——那正是它要防的东西。
export { briefPatchSchema } from './domain/schemas/brief-patch.js';
export type { BriefPatchRaw } from './domain/schemas/brief-patch.js';
export {
  DEFAULT_SESSION_TTL_HOURS,
  PurgeExpiredSessions,
} from './application/usecases/purge-expired-sessions.js';
