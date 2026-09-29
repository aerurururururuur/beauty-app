/**
 * weather/domain/errors/weather-upstream-error.ts —— 上游不可用
 * (超时 / 网络断 / 非 2xx / 返回体不合预期)。用例据此翻译成 `WEATHER_UNAVAILABLE`。
 *
 * ★ 一个实现里**只有一处** `catch` 需要认它:否则"上游换了种挂法"要改的地方就散开了。
 *   与 `CityNotFoundError` 的分工见那个文件的文件头。
 */
export class WeatherUpstreamError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'WeatherUpstreamError';
  }
}
