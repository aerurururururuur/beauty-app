/**
 * src/look-renders.ts —— ★ `looks` 的 `RenderSource` 端口 → `agent` 的 `GetRender`。
 *
 * **为什么单独一个文件,而不是写在 `src/index.ts` 里**:`index.ts` 一 import 就会跑
 * `main()`(起服务、连外部),里面的东西没法被测;而这里有一条一旦写错就会静默说谎的规则
 * ——哪些错该收窄成"查不到"、哪些必须照抛。放到这里 `test/look-renders.test.ts` 能直接钉住它
 * (同 `src/session-artifacts.ts` 的存在理由)。
 *
 * ★ **它属于组装根那类代码**(§7.1:消费者声明端口,组装根包一层),所以在 `src/` 而不是
 *   在 `modules/looks/` 里 —— `looks` **一行都不该知道** `GetRender` 长什么样。
 *
 * ── 收窄规则(只说一次,别在这里悄悄改) ──────────────────────────────────────
 *
 * | `GetRender` 抛的 | 本适配器回 |
 * |---|---|
 * | `SESSION_NOT_FOUND`(会话不在 / 不是你的) | `null` |
 * | `RENDER_NOT_FOUND`(序号不在会话里 / 字节没了) | `null` |
 * | 其它 `AppError`、任何普通 `Error` | **照抛** |
 *
 * ★ 后一行是全部意义所在:存储故障这类真错误照抛,别把它说成"图过期了"——
 *   那会把一次 500 伪装成一句"请重新生成一版",用户重生成一遍还是失败。
 *   同 `src/index.ts` 里 `userExists` 那条收窄(只认 `USER_NOT_FOUND`,其余抛)。
 *
 * ⚠️ 回 `null` 的四种情形(会话过期被清 / 重启后会话没了 / 序号不在里面 / 会话不是你的)
 *   在调用方看来是**同一件事**:存不下来。它们本来就分不清——会话不在内存里时,
 *   连"它曾经属于谁"都无从查起。
 */
import type { GetRender } from './modules/agent/index.js';
import type { RenderSource } from './modules/looks/index.js';
import { AppError, ErrorCode } from './modules/shared/index.js';
import type { ResolvedImage } from './modules/shared/index.js';

export function createRenderSource(getRender: GetRender): RenderSource {
  return {
    async resolve(sessionId: string, seq: number, userId: string): Promise<ResolvedImage | null> {
      try {
        return await getRender.execute(sessionId, userId, seq);
      } catch (err) {
        if (
          err instanceof AppError &&
          (err.code === ErrorCode.SESSION_NOT_FOUND || err.code === ErrorCode.RENDER_NOT_FOUND)
        ) {
          return null;
        }
        throw err;
      }
    },
  };
}
