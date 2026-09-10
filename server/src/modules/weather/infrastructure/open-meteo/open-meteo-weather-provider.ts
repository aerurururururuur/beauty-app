/**
 * infrastructure/open-meteo/open-meteo-weather-provider.ts —— WeatherProvider 的 open-meteo 实现。
 * 选它的理由:**无需 API key**、免费额度够 hackathon、无需企业认证(同 roadmap §6 对第三方服务的取舍口径)。
 * 两步走:① 城市名 → 坐标(geocoding-api);② 坐标 → 当日实况(api/forecast)。
 * 拿不到数据一律抛 WeatherUpstreamError,由用例翻成 WEATHER_UNAVAILABLE——
 * 本文件不返回任何「猜的」天气(宁可没有,不要假的)。
 */
import type { WeatherInfo } from '../../../shared/index.js';
import {
  CityNotFoundError,
  WeatherUpstreamError,
} from '../../domain/ports/weather-provider.js';
import type { WeatherProvider, WeatherQuery, WeatherResult } from '../../domain/ports/weather-provider.js';
import { conditionFromWmoCode } from './wmo.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** 默认超时:天气是提交前的辅助信息,慢到 5 秒还不回就该让前端走手动预设,别拖住用户。 */
export const DEFAULT_TIMEOUT_MS = 5000;

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

  /** 统一的取数口:超时 / 非 2xx / 非 JSON 全归 WeatherUpstreamError,调用方只管一种失败。 */
  private async getJson<T>(url: URL): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new WeatherUpstreamError(
        `请求 open-meteo 失败:${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    if (!res.ok) {
      throw new WeatherUpstreamError(`open-meteo 返回 ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new WeatherUpstreamError('open-meteo 返回体不是合法 JSON', err);
    }
  }
}
