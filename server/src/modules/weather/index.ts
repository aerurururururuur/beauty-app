/**
 * modules/weather —— 天气模块(public barrel)。
 * 当日天气实拉:open-meteo(无 key)/ mock(离线示意)二选一,由 config.weatherProvider 分发。
 * 对外只暴露端口与 GetWeather 用例;换源只改 compose.ts。
 */
export type {
  WeatherProvider,
  WeatherQuery,
  WeatherResult,
} from './domain/ports/weather-provider.js';
export { CityNotFoundError, WeatherUpstreamError } from './domain/ports/weather-provider.js';

// ---- schemas / validators(形状与校验行为)----
export { MAX_CITY, weatherQuerySchema } from './domain/schemas/weather-query.js';
export type { WeatherQueryRaw } from './domain/schemas/weather-query.js';
export { validateWeatherQuery } from './domain/validators/weather-query.validator.js';

// ---- 对外 API 契约 / DTO ----
export type { WeatherView } from './domain/api/weather-view.js';

// ---- 用例 ----
export { GetWeather } from './application/usecases/get-weather.js';

// ---- 默认实现的导出只为组合根与测试(同 makeup 导 MockEngine);业务代码请依赖上面的端口类型 ----
export { OpenMeteoWeatherProvider } from './infrastructure/open-meteo/open-meteo-weather-provider.js';
export { MockWeatherProvider } from './infrastructure/weather-provider/mock-weather-provider.js';
export { conditionFromWmoCode } from './infrastructure/open-meteo/wmo.js';

// ---- presentation(HTTP 路由挂载)----
export { registerWeatherRoutes } from './presentation/controllers/weather.controller.js';
export type { WeatherDeps } from './presentation/controllers/weather.controller.js';

// ---- 组合根 ----
export { createWeatherModule } from './compose.js';
export type {
  WeatherModuleOptions,
  WeatherModuleServices,
  WeatherProviderKind,
} from './compose.js';
