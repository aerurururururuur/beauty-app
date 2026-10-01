/**
 * agent/domain/ports/llm.ts —— LLM 取数端口(本模块持契约)。
 * ★ 端口抛的那个错误类**不住在这里**:见 `domain/errors/llm-unavailable-error.ts`。
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

/**
 * 一次调用的用量。
 * ⚠️ **两个字段都是必填**:读不到就整个不给(`undefined`),不许把缺的那个补成 0 ——
 *    补零之后"供应商没报"与"用量真的是 0"长得一模一样,而且没人会发现(§14-06)。
 */
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
  /**
   * ★ **点名**这一轮必须调用哪一个工具(不传 = 模型自己决定)。
   *
   * 只有一处用得上:开场那一轮逼它把妆面记下来。实测它会只调 `patch_brief`,
   * 然后在正文里把妆面讲完(`system-prompt.ts` 文件头 v11),会话里什么都没落下。
   *
   * ⚠️ 与「随便调一个工具」那种 `required` **不是一回事**,别拿它替代后者:
   *   那档会让纯聊天轮也被逼着调工具,而对话大部分时间是纯聊天。
   * ⚠️ 认不得这条的实现**必须无视它**(离线那两支就是),不许假装照做。
   */
  requireTool?: string;
  /** 输出上限。★ 线上有的实现把它当**必填**,所以 adapter 必须有一个兜底值。 */
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * ★ 失败抛的错误类住在 `domain/errors/llm-unavailable-error.ts`,不在这里。
 * ⚠️ 别把它重新写回本文件——`domain/errors/` 是错误类的唯一住处。
 */
export interface Llm {
  readonly name: string;
  /** 发一轮。失败抛 `domain/errors/` 的 `LlmUnavailableError`。 */
  chat(request: LlmRequest): Promise<LlmResponse>;
}
