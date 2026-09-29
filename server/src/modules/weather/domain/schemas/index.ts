/**
 * weather/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * 两个文件都属 `api/`：查询串与响应 DTO。没有 `entities/`（不落盘），
 * 也没有 `contracts/`（上游返回体的形状在 `domain/ports/weather-provider.ts` 里）。
 */
export { MAX_CITY, weatherQuerySchema } from './api/weather-query.js';
export type { WeatherQueryRaw } from './api/weather-query.js';

export type { WeatherView } from './api/weather-view.js';
