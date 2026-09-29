/**
 * agent/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * 三类，分工不同：
 *   · `api/`      —— 从**外面**进来的数据（HTTP 入参、`patch_brief` 工具入参），要真解析；
 *   · `entities/` —— 本进程**自己造出来**的对象（消息块、会话），**没有解析入口**：
 *                    它的用处是当形状与品牌的**单一来源**（§4.1/§7.4）——
 *                    实体那边一个字段都不声明，名义化也用 zod 的 `.brand()` 而不是手写标记。
 *   · `contracts/` —— 本模块不向别的模块发布形状，没有这一层。
 *
 * ✏️ 2026-09-29 加 `entities/`。此前那条「agent 没有 entities/」的理由是
 *   **会话与消息不落盘、没有持久化行** —— 那句话仍然成立，但它只否掉了"要有一层解析"，
 *   没否掉"形状该有一处单源"。落在盘上与否，跟形状是不是只写一遍是两件事。
 */
export {
  ANALYZE_CASES,
  REF_IMAGE_KINDS,
  analysesRequestSchema,
  confirmRenderSchema,
  sendMessageSchema,
  startSessionSchema,
} from './api/agent-http.js';
export type {
  AnalysesRequestRaw,
  ConfirmRenderRaw,
  SendMessageRaw,
} from './api/agent-http.js';

export { briefPatchSchema } from './api/brief-patch.js';
export type { BriefPatchRaw } from './api/brief-patch.js';

export {
  messageSchema,
  textBlockSchema,
  toolResultBlockSchema,
  toolUseBlockSchema,
} from './entities/message.js';
export type {
  MessageRow,
  MessageShape,
  TextBlockRow,
  TextBlockShape,
  ToolResultBlockRow,
  ToolResultBlockShape,
  ToolUseBlockRow,
  ToolUseBlockShape,
} from './entities/message.js';

export {
  analysisRecordSchema,
  consultedProductSchema,
  renderRecordSchema,
  sessionSchema,
} from './entities/session.js';
export type {
  AnalysisRecordRow,
  ConsultedProductRow,
  RenderRecordRow,
  SessionRow,
  SessionShape,
} from './entities/session.js';
