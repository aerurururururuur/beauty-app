/**
 * 天气模块单测:WMO 码映射 / 查询校验 / 用例错误翻译 / open-meteo 适配器(打桩 fetch,不联网)。
 * 联网的部分只留在真实 e2e 里,单测必须离线可跑、不 flaky。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import {
  CityNotFoundError,
  GetWeather,
  MockWeatherProvider,
  OpenMeteoWeatherProvider,
  WeatherUpstreamError,
  conditionFromWmoCode,
  validateWeatherQuery,
} from '../src/modules/weather/index.js';
import { FakeWeatherProvider } from './helpers/fakes.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 地理编码 + 实况两次调用一次配好,返回 fetch 桩以便断言请求 URL。 */
function stubOpenMeteo(geo: unknown, forecast: unknown) {
  const mock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(geo))
    .mockResolvedValueOnce(jsonResponse(forecast));
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conditionFromWmoCode', () => {
  it('常见码映射成中文', () => {
    expect(conditionFromWmoCode(0)).toBe('晴');
    expect(conditionFromWmoCode(2)).toBe('多云');
    expect(conditionFromWmoCode(63)).toBe('中雨');
    expect(conditionFromWmoCode(95)).toBe('雷阵雨');
  });

  it('未知码返回「未知」,不编一个像样的天气', () => {
    expect(conditionFromWmoCode(1234)).toBe('未知');
  });
});

describe('validateWeatherQuery', () => {
  it('city 走 trim;坐标解析成数字', () => {
    expect(validateWeatherQuery({ city: ' 北京 ' })).toEqual({ city: '北京' });
    expect(validateWeatherQuery({ lat: '39.9', lon: '116.4' })).toEqual({ lat: 39.9, lon: 116.4 });
  });

  it('地点缺失 → LOCATION_REQUIRED;两者都给 / 只给一半 → VALIDATION_ERROR', () => {
    const code = (raw: unknown) =>
      ((): string => {
        try {
          validateWeatherQuery(raw);
        } catch (e) {
          return (e as AppError).code;
        }
        return 'no-error';
      })();

    expect(code({})).toBe(ErrorCode.LOCATION_REQUIRED);
    expect(code({ city: '   ' })).toBe(ErrorCode.LOCATION_REQUIRED);
    expect(code({ city: '北京', lat: '39.9', lon: '116.4' })).toBe(ErrorCode.VALIDATION_ERROR);
    expect(code({ lat: '39.9' })).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('坐标非数字 / 越界 → VALIDATION_ERROR', () => {
    expect(() => validateWeatherQuery({ lat: 'abc', lon: '116' })).toThrow(AppError);
    expect(() => validateWeatherQuery({ lat: '91', lon: '116' })).toThrow(AppError);
    expect(() => validateWeatherQuery({ lat: '39', lon: '181' })).toThrow(AppError);
  });
});

describe('GetWeather(错误翻译)', () => {
  const ok = {
    weather: { condition: '晴', temperatureC: 24, humidityPct: 45, uvIndex: 3 },
    place: '北京 · 中国',
    source: 'open-meteo',
  };

  it('成功:展开成视图并带上 source / place', async () => {
    const view = await new GetWeather({ provider: new FakeWeatherProvider(ok) }).execute({
      city: '北京',
    });
    expect(view).toEqual({
      condition: '晴',
      temperatureC: 24,
      humidityPct: 45,
      uvIndex: 3,
      place: '北京 · 中国',
      source: 'open-meteo',
    });
  });

  it('上游缺的字段不进视图(不塞 undefined)', async () => {
    const view = await new GetWeather({
      provider: new FakeWeatherProvider({ weather: { condition: '晴' }, source: 'fake' }),
    }).execute({ city: '北京' });
    expect(view).toEqual({ condition: '晴', source: 'fake' });
  });

  it('解析不到城市 → CITY_NOT_FOUND(404 语义)', async () => {
    const usecase = new GetWeather({
      provider: new FakeWeatherProvider(new CityNotFoundError('没这城')),
    });
    await expect(usecase.execute({ city: '没这城' })).rejects.toMatchObject({
      code: ErrorCode.CITY_NOT_FOUND,
    });
  });

  it('上游挂了 → WEATHER_UNAVAILABLE(前端据此回落手动预设,而不是拿到假数据)', async () => {
    const usecase = new GetWeather({
      provider: new FakeWeatherProvider(new WeatherUpstreamError('超时')),
    });
    await expect(usecase.execute({ city: '北京' })).rejects.toMatchObject({
      code: ErrorCode.WEATHER_UNAVAILABLE,
    });
  });

  it('入参不合法时不惊动上游', async () => {
    const provider = new FakeWeatherProvider(ok);
    await expect(new GetWeather({ provider }).execute({})).rejects.toMatchObject({
      code: ErrorCode.LOCATION_REQUIRED,
    });
    expect(provider.calls).toBe(0);
  });
});

describe('MockWeatherProvider', () => {
  it('返回示意值并自报 source=mock,并回显城市', async () => {
    const res = await new MockWeatherProvider().fetch({ city: '北京' });
    expect(res.source).toBe('mock');
    expect(res.place).toBe('北京');
    expect(res.weather.temperatureC).toBe(24);
  });
});

describe('OpenMeteoWeatherProvider(打桩 fetch)', () => {
  const geo = {
    results: [{ name: '北京', latitude: 39.9075, longitude: 116.3972, country: '中国' }],
  };
  const forecast = {
    current: { temperature_2m: 28.94, relative_humidity_2m: 18.2, weather_code: 0 },
    daily: { uv_index_max: [6.15] },
  };

  it('城市名 → 坐标 → 实况,取整并拼出地点', async () => {
    const fetchMock = stubOpenMeteo(geo, forecast);
    const res = await new OpenMeteoWeatherProvider(1000).fetch({ city: '北京' });

    expect(res.weather).toEqual({ condition: '晴', temperatureC: 29, humidityPct: 18, uvIndex: 6 });
    expect(res.place).toBe('北京 · 中国');
    expect(res.source).toBe('open-meteo');

    // 第二步必须用解析出来的坐标去查实况
    const forecastUrl = String(fetchMock.mock.calls[1]![0]);
    expect(forecastUrl).toContain('latitude=39.9075');
    expect(forecastUrl).toContain('longitude=116.3972');
  });

  it('直接给坐标时跳过地理编码,且不带 place', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(forecast));
    vi.stubGlobal('fetch', fetchMock);

    const res = await new OpenMeteoWeatherProvider(1000).fetch({ lat: 39.9, lon: 116.4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.place).toBeUndefined();
  });

  it('城市查无结果 → CityNotFoundError', async () => {
    stubOpenMeteo({ results: [] }, forecast);
    await expect(new OpenMeteoWeatherProvider(1000).fetch({ city: '没这城' })).rejects.toBeInstanceOf(
      CityNotFoundError,
    );
  });

  it('非 2xx / 非 JSON / 断网 / 缺 current → 一律 WeatherUpstreamError', async () => {
    const provider = new OpenMeteoWeatherProvider(1000);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(provider.fetch({ lat: 1, lon: 2 })).rejects.toBeInstanceOf(WeatherUpstreamError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>nope</html>', { status: 200 })),
    );
    await expect(provider.fetch({ lat: 1, lon: 2 })).rejects.toBeInstanceOf(WeatherUpstreamError);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('网络断了')));
    await expect(provider.fetch({ lat: 1, lon: 2 })).rejects.toBeInstanceOf(WeatherUpstreamError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ daily: {} })));
    await expect(provider.fetch({ lat: 1, lon: 2 })).rejects.toBeInstanceOf(WeatherUpstreamError);
  });
});
