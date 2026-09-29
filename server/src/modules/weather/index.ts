/**
 * modules/weather —— 天气模块(public barrel)。
 * 当日天气:live(无 key 实拉)/ mock(离线示意)二选一,由 config.weatherProvider 分发。
 * 对外只暴露端口与 GetWeather 用例;换源只改 compose.ts。
 */
export type {
  WeatherProvider,
  WeatherQuery,
  WeatherResult,
} from './domain/ports/weather-provider.js';
export { CityNotFoundError } from './domain/errors/city-not-found-error.js';
export { WeatherUpstreamError } from './domain/errors/weather-upstream-error.js';

// ---- schemas / validators(形状与校验行为)----
export { weatherQuerySchema } from './domain/schemas/index.js';
export type { WeatherQueryRaw } from './domain/schemas/index.js';
// ★ `MAX_CITY` 跟着它的规则搬进了 validator(§4.2)。**仍从这里转出**,不让既有调用方
//   改 import 路径;新代码请直接从 `domain/validators/weather-query.validator.js` 引。
export { MAX_CITY, validateWeatherQuery } from './domain/validators/weather-query.validator.js';

// ---- 对外 API 契约 / DTO ----
export type { WeatherView } from './domain/schemas/index.js';

// ---- 用例 ----
export { GetWeather } from './application/usecases/get-weather.js';

// ---- 默认实现的导出只为组合根与测试(同 makeup 导 MockEngine);业务代码请依赖上面的端口类型 ----
export { OpenMeteoWeatherProvider } from './infrastructure/open-meteo/open-meteo-weather-provider.js';
export { MockWeatherProvider } from './infrastructure/weather-provider/mock-weather-provider.js';
export { conditionFromWmoCode } from './infrastructure/open-meteo/wmo.js';

// ---- presentation(HTTP 路由挂载)----
export { registerWeatherRoutes } from './presentation/routes/weather.route.js';
export type { WeatherDeps } from './presentation/weather.controller.js';

// ---- 组合根 ----
export { createWeatherModule } from './compose.js';
export type {
  WeatherModuleOptions,
  WeatherModuleServices,
  WeatherProviderKind,
} from './compose.js';
