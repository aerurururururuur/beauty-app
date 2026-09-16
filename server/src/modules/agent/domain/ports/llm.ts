/**
 * agent/domain/ports/llm.ts —— LLM 取数端口(本模块持契约)。
 *
 * 领域层不认识任何具体家,只认识「给我一段对话和一组工具,
 * 还我下一轮回复」。实现见 `infrastructure/llm/`,在 `compose.ts` 按开关分发。
 * 形状照 `weather/domain/ports/weather-provider.ts` 的先例。
 *
 * ★ **这道缝就是「换供应商不改业务层」的全部兑现**(§7.3 第 8 条)。
 *   被它挡在外面的,是线上两支协议真实存在的差异:
 *
 *   | 概念 | 块式 | 平行消息式 |
 *   | --- | --- | --- |
 *   | 工具入参 schema | `input_schema` | `parameters` |
 *   | 调用 id | `tool_use.id` | `tool_calls[].id` |
 *   | 调用入参 | `input`(**已解析对象**) | `function.arguments`(**JSON 字符串**) |
 *   | 结果回填 | 一条 user 消息里的 `tool_result` 块 | 多条 `{role:'tool', tool_call_id}` |
 *   | 终止判据 | `stop_reason` | `finish_reason` |
 *   | 强制选工具 | `tool_choice: {type:'any'}` | `tool_choice: 'required'` |
 *
 *   特别是**「已解析对象 vs JSON 字符串」这一格**:它是跨供应商最常见的 bug,
 *   而 `agent-loop` 完全看不到它——`ToolUseBlock.input` 在端口这一侧**永远是对象**。
 *
 * ★ `stopReason` 的归一化也在这道缝里完成(adapter 负责翻译):
 *
 *   | 归一化值 | 块式 `stop_reason` | 平行消息式 `finish_reason` |
 *   | --- | --- | --- |
 *   | `end_turn` | `end_turn` / `stop_sequence` | `stop` |
 *   | `tool_use` | `tool_use` | `tool_calls` |
 *   | `max_tokens` | `max_tokens` | `length` |
 *   | `refusal` | `refusal` | `content_filter` |
 *
 *   表外的值(如 `prefill`、服务端工具专用的 `pause_turn`)本项目不依赖——
 *   由 adapter 记日志后归到 `end_turn`,不在归一化表里假装支持。
 */
import type { ContentBlock, Message } from '../entities/message.js';

/** 一个给模型看的工具定义。 */
export interface LlmToolDefinition {
  /** 工具名。★ 供应方对字符集有限制(`^[a-zA-Z0-9_-]{1,64}$` 一类),不要用点号。 */
  name: string;
  /**
   * ★ **工具描述是给模型看的 prompt,是产品的一部分**(§7.3 第 3 条):
   * 要按文案对待、要有人看、要能改。它不是注释。
   */
  description: string;
  /**
   * 入参的 JSON Schema。字段名用中性的 `inputSchema`,
   * **刻意不叫 `parameters` 也不叫 `input_schema`**——
   * 照抄任何一支都会让内部类型看着像"以那支为准"。
   */
  inputSchema: Record<string, unknown>;
}

/** 归一化后的终止原因(映射表见文件头)。 */
export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  /** 这一轮的内容块(正文 + 工具调用,按出现顺序)。 */
  content: ContentBlock[];
  stopReason: LlmStopReason;
  /** 用量。供应商不给时缺省——**不要拿它当计费依据,各家 tokenizer 不同**(§15.3)。 */
  usage?: LlmUsage;
  /** 原始响应体。落夹具用(§5.4 record/replay),不参与业务判断。 */
  raw?: unknown;
}

export interface LlmRequest {
  system?: string;
  /** 完整历史。★ 无状态协议:每轮都要整份重发,不是增量。 */
  messages: Message[];
  /** 不传 = 本轮不给工具(纯文本轮)。 */
  tools?: LlmToolDefinition[];
  /** 输出上限。★ 线上有的实现把它当**必填**,所以 adapter 必须有一个兜底值。 */
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * 传输层不可用:网络断、超时、鉴权失败、5xx。
 *
 * ★ **与「模型回了话但内容不对」必须分开**(同 `weather-provider.ts` 那条
 *  `CityNotFoundError` vs `WeatherUpstreamError` 的二分):
 * 前者该由 `agent-loop` 捕获、优雅收束成一句道歉(§10 `[I4]`);
 * 后者是正常响应,循环该怎么走怎么走。**别把两者都当 Exception 一锅端。**
 */
export class LlmUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

export interface Llm {
  readonly name: string;
  /** 发一轮。失败抛 {@link LlmUnavailableError}。 */
  chat(request: LlmRequest): Promise<LlmResponse>;
}
