/**
 * modules/weather/compose.ts —— 组合根(空壳)。
 * provider 为 null:未实现、也未在 src/index.ts 接入。实现 WeatherProvider 后于此返回实例。
 */
import type { WeatherProvider } from './domain/ports/weather-provider.js';

export interface WeatherModuleServices {
  provider: WeatherProvider | null;
}

export function createWeatherModule(): WeatherModuleServices {
  return { provider: null };
}
