/**
 * presentation/routes/weather.route.ts —— 天气的路径登记。
 * 只有「方法 + 路径 → handler」的映射,没有业务判断(§11:路由的构造归组合根,路由的
 * 职责本身只是登记)。
 */
import type { FastifyInstance } from 'fastify';
import { makeWeatherController } from '../weather.controller.js';
import type { WeatherDeps } from '../weather.controller.js';

export function registerWeatherRoutes(app: FastifyInstance, deps: WeatherDeps): void {
  const controller = makeWeatherController(deps);
  app.get('/weather', controller.get);
}
