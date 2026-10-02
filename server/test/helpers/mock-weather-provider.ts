/**
 * test/helpers/mock-weather-provider.ts —— WeatherProvider 的测试替身(**生产代码拿不到它**)。
 * **固定返回一组示意值**,不联网、不会失败。
 * 返回的 source='mock',UI 据此标注「离线示意」——它是替身,不是实况,别当实时数据展示。
 */
import type { WeatherInfo } from '../../src/modules/shared/index.js';
import type { WeatherProvider, WeatherQuery, WeatherResult } from '../../src/modules/weather/domain/ports/weather-provider.js';

/** 与前端演示预设同源的示意值(晴 24℃ / 湿度 45% / UV 3)。 */
const DEMO_WEATHER: WeatherInfo = {
  condition: '晴',
  temperatureC: 24,
  humidityPct: 45,
  uvIndex: 3,
};

export class MockWeatherProvider implements WeatherProvider {
  readonly name = 'mock';

  async fetch(query: WeatherQuery = {}): Promise<WeatherResult> {
    const result: WeatherResult = { weather: { ...DEMO_WEATHER }, source: this.name };
    if (query.city) result.place = query.city; // 回显用户输入,便于 UI 显示「北京 · 离线示意」
    return result;
  }
}
