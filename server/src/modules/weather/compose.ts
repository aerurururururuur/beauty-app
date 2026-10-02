/**
 * modules/weather/compose.ts —— 组合根。
 * 天气源**由调用方造好注入**,再把 GetWeather 用例装上。业务层 / 控制器都不感知具体是哪个源。
 */
import { GetWeather } from './application/usecases/get-weather.js';
import type { WeatherProvider } from './domain/ports/weather-provider.js';

export interface WeatherModuleOptions {
  /** 天气源。★ **由组合根造好注入**(`src/index.ts` 的 `OpenMeteoWeatherProvider`)。 */
  provider: WeatherProvider;
}

export interface WeatherModuleServices {
  provider: WeatherProvider;
  getWeather: GetWeather;
}

export function createWeatherModule(options: WeatherModuleOptions): WeatherModuleServices {
  const { provider } = options;
  return { provider, getWeather: new GetWeather({ provider }) };
}
