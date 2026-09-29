/**
 * agent/domain/errors/llm-unavailable-error.ts —— 传输层不可用:
 * 网络断、超时、鉴权失败、5xx。
 *
 * ★ **与「模型回了话但内容不对」必须分开**(同 `weather/domain/errors` 那对
 *   `CityNotFoundError` vs `WeatherUpstreamError` 的二分):
 *   前者该由 `agent-loop` 捕获、优雅收束成一句道歉(§10 `[I4]`);
 *   后者是正常响应,循环该怎么走怎么走。**别把两者都当 Exception 一锅端。**
 */
export class LlmUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}
