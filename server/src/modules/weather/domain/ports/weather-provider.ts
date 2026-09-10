/**
 * modules/weather/domain/ports/weather-provider.ts —— 天气取数端口(本模块持契约)。
 * 领域层不认识 open-meteo / 任何具体源,只认识「给我一个地点,还我当日天气」。
 * 实现见 infrastructure(open-meteo 实拉 / mock 离线兜底),在 compose.ts 按开关分发。
 */
import type { WeatherInfo } from '../../../shared/index.js';

export interface WeatherQuery {
  /** 城市名(与 lat/lon 二选一)。 */
  city?: string;
  /** 纬度(-90..90,与 lon 成对给出)。 */
  lat?: number;
  /** 经度(-180..180)。 */
  lon?: number;
  /** 预留:目前只取当日实况,此字段尚未被任何实现消费。 */
  date?: string;
}

/** 一次天气查询的结果。 */
export interface WeatherResult {
  /** 天气本体(shared 的 WeatherInfo,可直接给 brief.weather 用)。 */
  weather: WeatherInfo;
  /** 解析到的地点名(如「北京市 · 中国」);按坐标查询时可能为空。 */
  place?: string;
  /**
   * 数据来源标识(实现自报,对应 WeatherProvider.name)。
   * UI 据此区分「实时拉取」与「离线示意」,别把 mock 数据当实时展示。
   */
  source: string;
}

/**
 * 地名解析不到坐标 —— 是**用户输入问题**,与「上游挂了」必须分开:
 * 前者该提示改地名(404),后者该回落到手动预设(502)。
 */
export class CityNotFoundError extends Error {
  constructor(readonly city: string) {
    super(`未找到城市:${city}`);
    this.name = 'CityNotFoundError';
  }
}

/** 上游不可用(超时 / 网络断 / 返回体不合预期)。用例据此翻译成 WEATHER_UNAVAILABLE。 */
export class WeatherUpstreamError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'WeatherUpstreamError';
  }
}

export interface WeatherProvider {
  readonly name: string;
  fetch(query?: WeatherQuery): Promise<WeatherResult>;
}
