/**
 * agent/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * agent 没有 `entities/`（会话与消息是内存对象，不落盘、没有持久化行），
 * 也没有 `contracts/`（它不向别的模块发布形状）；两个文件都属 `api/`：
 * HTTP 入参与 `patch_brief` 工具入参。
 */
export {
  MAX_AGENT_TEXT,
  startSessionSchema,
  confirmRenderSchema,
  sendMessageSchema,
} from './api/agent-http.js';
export type { StartSessionRaw, SendMessageRaw, ConfirmRenderRaw } from './api/agent-http.js';

export { MAX_DRESS, MAX_SCENE_TEXT, briefPatchSchema } from './api/brief-patch.js';
export type { BriefPatchRaw } from './api/brief-patch.js';
