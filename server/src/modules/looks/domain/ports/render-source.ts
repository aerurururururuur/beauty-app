/**
 * domain/ports/render-source.ts —— 「把某次会话的第 n 张成品图给我」的端口。
 *
 * ★ **本模块不 import agent 模块**:端口声明在这里,实现由**组装根**把 agent 的
 *   `GetRender` 包一层(收窄掉「查不到」那几种错)粘进来,见 `src/look-renders.ts`。
 *
 * ★ 为什么是「取路径」而不是「取字节」:复制字节是 `LookCoverStore` 的事,
 *   而「哪张图该不该给他看」的归属判断在 agent 那边。这里只把两道边界接起来。
 *
 * ⚠️ **拿不到就回 `null`,不抛** —— 回 null 的四种情形(会话过期被清 / 进程重启后
 *   会话没了 / 序号不在这个会话里 / 会话不是你的)在调用方看来是**同一件事**:
 *   存不下来。它们在 agent 那边本来就是两个错码,收窄在这一层做。
 */
import type { ResolvedImage } from '../../../shared/index.js';

export interface RenderSource {
  /**
   * 解析 `(sessionId, seq)` 那张成品图的本机路径 + MIME。
   * 不存在 / 不是该用户的 / 序号不在会话里,一律返回 `null`。
   */
  resolve(sessionId: string, seq: number, userId: string): Promise<ResolvedImage | null>;
}
