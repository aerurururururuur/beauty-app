/**
 * modules/weather/compose.ts —— 组合根。
 * 按 config.weatherProvider 分发实现:open-meteo(无 key 实拉)或 mock(离线示意兜底),
 * 再把 GetWeather 用例装上。业务层 / 控制器都不感知具体是哪个源。
 */
import { GetWeather } from './application/usecases/get-weather.js';
import { OpenMeteoWeatherProvider } from './infrastructure/open-meteo/open-meteo-weather-provider.js';
import { MockWeatherProvider } from './infrastructure/weather-provider/mock-weather-provider.js';
import type { WeatherProvider } from './domain/ports/weather-provider.js';

/**
 * 天气源开关。与 `shared/infrastructure/config.ts` 的 `weatherProvider` 同形
 * (那边读 WEATHER_PROVIDER 环境变量);此处独立声明,避免模块反向依赖组装层的配置类型。
 */
export type WeatherProviderKind = 'mock' | 'open-meteo';

export interface WeatherModuleOptions {
  /** 天气源开关(来自 config.weatherProvider)。 */
  kind: WeatherProviderKind;
  /** 上游超时(毫秒);仅 open-meteo 用,缺省 5s。 */
  timeoutMs?: number;
}

export interface WeatherModuleServices {
  provider: WeatherProvider;
  getWeather: GetWeather;
}

export function createWeatherModule(options: WeatherModuleOptions): WeatherModuleServices {
  const provider: WeatherProvider =
    options.kind === 'open-meteo'
      ? new OpenMeteoWeatherProvider(options.timeoutMs)
      : new MockWeatherProvider();

  return { provider, getWeather: new GetWeather({ provider }) };
}
