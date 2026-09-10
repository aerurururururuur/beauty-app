/**
 * application/usecases/get-weather.ts —— 取当日天气用例。
 * 职责:入参校验行为(domain/validator)→ 调用 WeatherProvider 端口 → 投影成对外视图。
 *
 * 这里是**上游错误与业务错误码的唯一翻译点**:地名解析不到 → CITY_NOT_FOUND(用户改输入就能好),
 * 其余(超时 / 断网 / 返回体不合预期) → WEATHER_UNAVAILABLE(前端据此回落到手动预设,
 * **绝不返回编造的天气冒充实时**)。控制器因此不必认识任何上游错误类型。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { CityNotFoundError } from '../../domain/ports/weather-provider.js';
import type { WeatherProvider, WeatherResult } from '../../domain/ports/weather-provider.js';
import type { WeatherView } from '../../domain/api/weather-view.js';
import { validateWeatherQuery } from '../../domain/validators/weather-query.validator.js';
import { toWeatherView } from '../mapping/weather-view.mapper.js';

export class GetWeather {
  constructor(private readonly deps: { provider: WeatherProvider }) {}

  async execute(raw: unknown): Promise<WeatherView> {
    const query = validateWeatherQuery(raw);

    let result: WeatherResult;
    try {
      result = await this.deps.provider.fetch(query);
    } catch (err) {
      if (err instanceof CityNotFoundError) {
        throw new AppError(ErrorCode.CITY_NOT_FOUND, err.message);
      }
      throw new AppError(
        ErrorCode.WEATHER_UNAVAILABLE,
        '天气服务暂时不可用,请手动填写天气或稍后再试',
        err instanceof Error ? { reason: err.message } : undefined,
      );
    }

    return toWeatherView(result);
  }
}
