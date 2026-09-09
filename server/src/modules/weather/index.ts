/**
 * modules/weather —— 天气模块(public barrel,空壳)。
 */
export type { WeatherProvider, WeatherQuery } from './domain/ports/weather-provider.js';
export { createWeatherModule } from './compose.js';
export type { WeatherModuleServices } from './compose.js';
