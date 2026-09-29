/**
 * weather/domain/errors/city-not-found-error.ts —— 地名解析不到坐标。
 *
 * ★ 它与 `WeatherUpstreamError` 是**一对**,必须分开:
 *   前者是**用户输入问题**(该提示改地名,404),后者是**上游挂了**(该回落到手动预设,502)。
 *   合成一个的话,用户把城市名打错会看到"天气服务不可用",然后去重试。
 *
 * ★ 这两个是**本模块对第三方上游**的端口契约错误,不是跨模块的——
 *   翻译点只有一个(`application/usecases/get-weather.ts`,§10)。
 *   真正跨模块的那几个端口**不抛**(§10)。
 */
export class CityNotFoundError extends Error {
  constructor(readonly city: string) {
    super(`未找到城市:${city}`);
    this.name = 'CityNotFoundError';
  }
}
