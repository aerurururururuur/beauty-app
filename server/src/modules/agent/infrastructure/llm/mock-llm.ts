/**
 * infrastructure/llm/mock-llm.ts —— 脚本化的假 LLM。
 *
 * 两个用途,都很重要:
 *
 * 1. **测试**(§11)「`agent-loop` 用 **mock LLM 返回脚本化的响应序列**驱动状态机」。
 *    §11 把那句话称为「**这一层唯一真正的风险控制**」——LLM 行为不可测,
 *    但**循环的骨架可测**:把不确定性关在 `llm.ts` 端口里面,外面全是确定的。
 *    `mockToolCall` / `mockText` 两个构造器就是为了让脚本读起来像一段对话。
 *
 * 2. **离线兜底**:`AGENT_LLM=mock` 时服务仍能起来并回话,不联网、不花钱。
 *    同 `WEATHER_PROVIDER=mock` / `REFERENCE_PROVIDER=mock` 的用法
 *    (红线 §13-1:演示现场第一约束是稳)。
 *
 * ⚠️ **它不会假装自己是真的。** 脚本用完后回的话术明确说"演示模式",
 * 不编造妆面建议——一个会瞎编的 mock 比一个空列表更糟。
 */
import type { ToolUseBlock } from '../../domain/entities/message.js';
import type { Llm, LlmRequest, LlmResponse } from '../../domain/ports/llm.js';

/** 构造一个纯文字回复。 */
export function mockText(text: string): LlmResponse {
  return { content: [{ type: 'text', text }], stopReason: 'end_turn' };
}

/** 构造一个「调工具」的回复。`input` 直接给对象(内部形状,**不是** JSON 字符串)。 */
export function mockToolCall(id: string, name: string, input: unknown): LlmResponse {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stopReason: 'tool_use',
  };
}

/**
 * 构造一个「先说一句再调工具」的回复(检验同一轮的正文与工具调用能共存)。
 * ★ 参数收窄成 `ToolUseBlock[]` 而不是任意 `ContentBlock[]`:多塞一个 text 块
 *   会被 `textOf` 拼进去,变成一段脚本里看不见的重复正文。
 */
export function mockTextAndToolCalls(
  text: string,
  calls: readonly ToolUseBlock[],
): LlmResponse {
  return { content: [{ type: 'text', text }, ...calls], stopReason: 'tool_use' };
}

/** 脚本用完时的兜底话术。**不编内容**。 */
const EXHAUSTED_TEXT =
  '当前是演示模式(没有接真实模型),我只能回到这里。接上模型后我就能真正帮你定妆了。';

export class MockLlm implements Llm {
  readonly name = 'mock';
  private queue: LlmResponse[];
  /** 收到过的请求。测试用来断言「系统提示里有没有带上当前 LookSpec」这类事。 */
  readonly requests: LlmRequest[] = [];

  constructor(script: readonly LlmResponse[] = []) {
    this.queue = [...script];
  }

  /** 追加脚本(可以在跑了一轮之后续)。 */
  push(...responses: LlmResponse[]): void {
    this.queue.push(...responses);
  }

  /** 还剩几条脚本。测试用来断言"该调的调了、没多调"。 */
  remaining(): number {
    return this.queue.length;
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (next) return next;
    // ★ 刻意**不抛** `LlmUnavailableError`:脚本用完不是"上游挂了",
    //   抛那个会让 `agent-loop` 走进"连不上后台"的收束分支,掩盖真正的问题。
    return mockText(EXHAUSTED_TEXT);
  }
}
