/**
 * application/usecases/confirm-render.ts —— ★ **用户点了「确认出图」**。
 *
 * 这是**唯一**会传 `resume: 'approved'` 的地方,也就是整个系统里
 * **唯一能让引擎真的花钱**的入口。所以它只有三件事要做,而且顺序不能变:
 *
 * 1. **归属校验**(同 `SendMessage`:不存在与不属于同一用户报同一个错);
 * 2. ★ **确认真的有待确认的出图请求**——否则不跑。
 *    这一条不是防御性编程:没有它,前端一个手抖的重复点击就会**再跑一整轮 LLM**,
 *    而那一轮没有任何待确认项,模型会在一份"我什么都没说"的历史上自由发挥。
 * 3. 跑循环(带 `'approved'`),存回。
 *
 * ⚠️ **它不自己判断额度**。额度在 `RenderLookTool` 里查(提议时与批准时各一次),
 *   因为那里才看得见"这一轮重放里到底是谁在要出图"。
 *   在这里再查一遍等于把同一条规则抄第二份——而两份规则迟早会不一致。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { danglingToolUses } from '../../domain/entities/message.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import { TOOL_NAMES } from '../../domain/tools/definitions.js';
import type { AgentLoop, AgentTurnResult } from '../agent-loop.js';

export class ConfirmRender {
  constructor(private readonly deps: { sessions: SessionStore; loop: AgentLoop }) {}

  async execute(sessionId: string, userId: string): Promise<AgentTurnResult> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    const dangling = danglingToolUses(session.messages);
    if (!dangling.some((call) => call.name === TOOL_NAMES.renderLook)) {
      // 用 `VALIDATION_ERROR` 而不是 404:会话确实存在,是**这个动作**现在不成立。
      // 前端把它当成"确认框过期了,刷新一下"处理即可。
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '这个会话现在没有待确认的出图请求(可能已经确认过,或者已经被别的话顶掉了)。',
      );
    }

    const result = await this.deps.loop.run(session, undefined, { resume: 'approved' });
    // ★ 无论循环怎么结束都要存回(同 `SendMessage`):哪怕这一轮出图失败,
    //   会话里也已经多了一条 `tool_result` 和一句收束语——不存的话那个
    //   "欠着的 tool_use" 会**原样还在**,用户再点一次确认就会重复花钱。
    await this.deps.sessions.save(result.session);
    return result;
  }
}
