/**
 * presentation/controllers/weather.controller.ts —— 天气 HTTP 路由。
 * GET /weather?city=北京 或 ?lat=39.9&lon=116.4
 * 控制器很薄:把查询串原样交给用例(校验与错误翻译都在 domain/validator 与用例里),不做业务判断。
 */
import type { FastifyInstance } from 'fastify';
import type { GetWeather } from '../../application/usecases/get-weather.js';

export interface WeatherDeps {
  getWeather: GetWeather;
}

export function registerWeatherRoutes(app: FastifyInstance, deps: WeatherDeps): void {
  app.get('/weather', async (request) => {
    return deps.getWeather.execute(request.query ?? {});
  });
}
