/**
 * modules/weather —— 空壳模块(端口已声明,骨架未 wire)。
 * 当日天气实拉免费源属后续 roadmap;届时实现本端口并在 src/index.ts 组合根接上,
 * 让 brief.weather 从「前端手动预设」升级为「自动拉取」。
 */
import type { WeatherInfo } from '../../../shared/index.js';

export interface WeatherQuery {
  date?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

export interface WeatherProvider {
  readonly name: string;
  fetch(query?: WeatherQuery): Promise<WeatherInfo>;
}
