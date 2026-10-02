import api from './index'

/**
 * api/weather.js —— 当日天气(`GET /weather`,契约见 server/src/modules/weather/README.md)。
 * `?city=北京` 或 `?lat=39.9&lon=116.4`,回 `WeatherView{ source, place?, condition?, temperatureC?, humidityPct?, uvIndex? }`。
 * 桃妆只在 `/form` 拉它,取四格填 `brief.weather`(挑选与处置在 `api/design.js` 的 `briefWeatherOf`)。
 *
 * ★ **不给假实现**(前端全目录无 mock 分支):编一份天气出来正是本仓头号 bug 类型。
 *   拉不到就**整块不带 `weather` 提交**。
 */

/** 城市名上限(字)。与后端 `weather-query.validator.ts` 的 `MAX_CITY` 同值,改一处要改两处。 */
export const MAX_CITY = 32

/**
 * 拉当日天气。
 * ★ `city` 与 `lat`/`lon` **二选一**:两个都给会被后端 422 打回(见 `validateWeatherQuery`)。
 * 拉不到就 reject,`message` 是后端那句人话,调用方**原样展示**(§3 第 2 条)。
 */
export async function fetchWeather({ city = '', lat, lon } = {}) {
  const params =
    lat !== undefined && lon !== undefined ? { lat, lon } : { city: String(city).trim() }
  return api.get('/weather', { params })
}
