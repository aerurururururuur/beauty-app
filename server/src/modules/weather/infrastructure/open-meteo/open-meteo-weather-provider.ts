/**
 * infrastructure/open-meteo/open-meteo-weather-provider.ts —— WeatherProvider 的 open-meteo 实现。
 * 选它的理由:**无需 API key**、免费额度够 hackathon、无需企业认证(同 roadmap §6 对第三方服务的取舍口径)。
 * 两步走:① 城市名 → 坐标(geocoding-api);② 坐标 → 当日实况(api/forecast)。
 * 拿不到数据一律抛 WeatherUpstreamError,由用例翻成 WEATHER_UNAVAILABLE——
 * 本文件不返回任何「猜的」天气(宁可没有,不要假的)。
 */
import type { WeatherInfo } from '../../../shared/index.js';
import { CityNotFoundError } from '../../domain/errors/city-not-found-error.js';
import { WeatherUpstreamError } from '../../domain/errors/weather-upstream-error.js';
import type { WeatherProvider, WeatherQuery, WeatherResult } from '../../domain/ports/weather-provider.js';
import { conditionFromWmoCode } from './wmo.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * **每次尝试**的上游超时(毫秒)。每个 URL 各算一次,一次 `/api/weather` 最坏 = 2 步 × 2 次尝试。
 * ★ 2026-10-01 由 12000 降到 6000,同日给 `getJson` 加了一次重试:冷启动那次尝试反正会被
 *   放弃(第一次点击的 11.7s / 502 就是被旧超时掐掉的那一次),早点放弃、把它交给重试 ——
 *   紧接的重试只要 1.8s,因为失败的那一发已经把上游捂热了。
 * ⚠️ 上限被 `vue/src/api/index.js` 的 30s 客户端超时定死:2 步 × 2 次 × 6s = 24s,
 *   调到 8s 就正好撞上它,用户看到的会变成 axios 的 "timeout of 30000ms exceeded"。
 */
export const DEFAULT_TIMEOUT_MS = 6000;

interface GeocodeResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
  }>;
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
  };
  daily?: { uv_index_max?: number[] };
}

/** 解析后的地点。 */
interface Spot {
  lat: number;
  lon: number;
  place?: string;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = 'open-meteo';

  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async fetch(query: WeatherQuery = {}): Promise<WeatherResult> {
    const spot = await this.resolveSpot(query);
    const body = await this.getJson<ForecastResponse>(this.forecastUrl(spot));
    const current = body.current;
    if (!current) {
      throw new WeatherUpstreamError('open-meteo 返回体缺少 current 字段');
    }

    const weather: WeatherInfo = {};
    if (typeof current.weather_code === 'number') {
      weather.condition = conditionFromWmoCode(current.weather_code);
    }
    // 取整:brief.weather 是给人看的回显,28.9℃ / 18.3% 这种精度没有意义。
    if (typeof current.temperature_2m === 'number') {
      weather.temperatureC = Math.round(current.temperature_2m);
    }
    if (typeof current.relative_humidity_2m === 'number') {
      weather.humidityPct = Math.round(current.relative_humidity_2m);
    }
    const uv = body.daily?.uv_index_max?.[0];
    if (typeof uv === 'number') {
      weather.uvIndex = Math.round(uv);
    }

    const result: WeatherResult = { weather, source: this.name };
    if (spot.place) result.place = spot.place;
    return result;
  }

  /** 城市名 → 坐标;坐标直给则原样采用。解析不到城市抛 CityNotFoundError(用户改输入就能好)。 */
  private async resolveSpot(query: WeatherQuery): Promise<Spot> {
    if (query.city) {
      const url = new URL(GEOCODE_URL);
      url.searchParams.set('name', query.city);
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'zh');
      const body = await this.getJson<GeocodeResponse>(url);
      const hit = body.results?.[0];
      if (!hit) {
        throw new CityNotFoundError(query.city);
      }
      const place = [hit.name, hit.country].filter((s): s is string => Boolean(s)).join(' · ');
      return { lat: hit.latitude, lon: hit.longitude, place };
    }
    if (typeof query.lat === 'number' && typeof query.lon === 'number') {
      return { lat: query.lat, lon: query.lon };
    }
    // 校验器已挡住「缺地点」;这里是端口被直接调用时的兜底。
    throw new WeatherUpstreamError('查询缺少地点(city 或 lat/lon)');
  }

  private forecastUrl(spot: Spot): URL {
    const url = new URL(FORECAST_URL);
    url.searchParams.set('latitude', String(spot.lat));
    url.searchParams.set('longitude', String(spot.lon));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code');
    url.searchParams.set('daily', 'uv_index_max');
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('timezone', 'auto');
    return url;
  }

  /**
   * 统一的取数口:超时 / 非 2xx / 非 JSON 全归 WeatherUpstreamError,调用方只管一种失败。
   * ★ **只对「fetch 抛错」重试一次**(超时 / 断网):那一发多半只是撞上上游冷启动,
   *   而它已经把上游捂热了。非 2xx 与坏 JSON **不重试** —— 上游在回答,再问一遍
   *   只是把 404 拖成两倍延迟。第二次的结果才是结果,包括第二次也失败时抛的那个错。
   */
  private async getJson<T>(url: URL): Promise<T> {
    const res = await this.fetchOnce(url).catch(() => this.fetchOnce(url));
    if (!res.ok) {
      throw new WeatherUpstreamError(`open-meteo 返回 ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new WeatherUpstreamError('open-meteo 返回体不是合法 JSON', err);
    }
  }

  /** 单发。超时 / 断网一律归 WeatherUpstreamError。 */
  private async fetchOnce(url: URL): Promise<Response> {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new WeatherUpstreamError(
        `请求 open-meteo 失败:${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}
