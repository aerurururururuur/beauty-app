/**
 * application/usecases/send-message.ts —— 把用户一句话推一轮 harness。
 *
 * 职责边界很清楚:**它只做归属校验 + 读会话 + 跑循环 + 存回**。
 * 「怎么跑」全在 `agent-loop.ts`,「记什么」全在 `domain/entities/session.ts`。
 * 用例层在这里**没有业务判断**,这是分对了层的标志——同 `RunPipeline` 的形状。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import type { AgentLoop, AgentTurnResult } from '../agent-loop.js';

export class SendMessage {
  constructor(private readonly deps: { sessions: SessionStore; loop: AgentLoop }) {}

  async execute(sessionId: string, userId: string, text: string): Promise<AgentTurnResult> {
    const session = await this.deps.sessions.find(sessionId);
    // ★ 归属不符与真不存在**报同一个错**(同 `cabinet` 的取舍):
    // 报「无权」等于确认了"这个会话存在",是可以被枚举的。
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    const result = await this.deps.loop.run(session, text.trim());

    // ★ **无论循环怎么结束都要存回**:哪怕 `llm_unavailable` / `max_iterations`,
    //   返回的 session 里也有用户那句话和收束语。不存的话用户刷新页面就丢了上下文,
    //   而"我们明明告诉她了"这种事说不清。
    await this.deps.sessions.save(result.session);
    return result;
  }
}
