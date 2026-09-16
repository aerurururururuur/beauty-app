/**
 * application/usecases/get-render.ts —— 取会话里出过的某一张成品图(字节)。
 *
 * ★ **顺序是硬要求:先查会话归属,再取文件。**
 *   反过来的话,只要猜到会话 id 与序号就能把别人的脸图整张拉走——
 *   而这个接口背后是**用户本人的照片生成的东西**,不是公开资源。
 *   归属不符与不存在**报同一个错**(同 `GetSession`):不泄露"这个会话存在"。
 *
 * ★ 序号在会话里也要**再核一次**(不只看它是不是正整数):
 *   `readRender` 只是按键去读盘,而"盘上有这个键"不等于"这个会话有这张图"。
 *   会话的 `renders[]` 才是"这个会话出过哪些图"的唯一权威。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { Readable } from 'node:stream';

export interface RenderArtifact {
  stream: Readable;
  mimeType: string;
}

export class GetRender {
  constructor(
    private readonly deps: { sessions: SessionStore; artifacts: SessionArtifacts },
  ) {}

  async execute(sessionId: string, userId: string, seq: number): Promise<RenderArtifact> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    // 会话里没有这个序号 → 404。**不去问存储**:存储里可能还留着上一次同名会话的
    // 残骸(测试、手工清理),问它等于把一条本该由业务判断的边界交给盘上有什么。
    const record = session.renders.find((r) => r.seq === seq);
    if (!record) {
      throw new AppError(ErrorCode.RENDER_NOT_FOUND, `这个会话没有第 ${seq} 张图`);
    }

    const artifact = await this.deps.artifacts.readRender(sessionId, seq);
    if (!artifact) {
      // 会话里记着、盘上没有:存储被手工清过,或者写的时候没落成。
      // ★ **不悄悄回落成 404**——这是数据不一致,得让人在日志里看见。
      console.warn(
        `[agent] 会话 ${sessionId} 记着第 ${seq} 张图(${record.ref.storeKey}),但存储里读不到`,
      );
      throw new AppError(ErrorCode.RENDER_NOT_FOUND, `第 ${seq} 张图读不到了`);
    }
    return artifact;
  }
}
