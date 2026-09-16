/**
 * application/usecases/get-session.ts —— 读一个会话的当前状态。
 *
 * ★ **为什么需要它**:`SendMessage` 只在"用户又说了一句话"时才回吐会话。
 * 页面刷新一下就再也看不到自己定到哪一步了——而 §9 明确要求会话**存服务端**。
 * 存了却没有读的路径,等于没存。
 *
 * 归属校验与 `SendMessage` 同一套(不符与不存在报同一个错),别在两处写出两种说法。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import type { Session } from '../../domain/entities/session.js';

export class GetSession {
  constructor(private readonly deps: { sessions: SessionStore }) {}

  async execute(sessionId: string, userId: string): Promise<Session> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }
    return session;
  }
}
