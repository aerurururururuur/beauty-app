/**
 * presentation/weather.controller.ts —— 请求 → 用例 的翻译层。
 * GET /weather?city=北京 或 ?lat=39.9&lon=116.4
 *
 * 很薄:把查询串原样交给用例(校验与错误翻译都在 domain/validator 与用例里),不做业务判断。
 *
 * ✏️ 路径登记**不在这个文件**,在 `presentation/routes/weather.route.ts`。
 *    §3 的骨架把这两件事分开:控制器回答「一次请求要做什么」,路由回答
 *    「哪个方法 + 哪个路径接到它」。薄控制器上这两件事看着像同一件,但混在一起之后
 *    「这个路径挂了什么」就只能靠通读函数体才知道。
 */
import type { FastifyRequest } from 'fastify';
import type { GetWeather } from '../application/usecases/get-weather.js';

export interface WeatherDeps {
  getWeather: GetWeather;
}

export function makeWeatherController(deps: WeatherDeps) {
  return {
    get: async (request: FastifyRequest) => deps.getWeather.execute(request.query ?? {}),
  };
}
