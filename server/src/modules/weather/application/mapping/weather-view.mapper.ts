/**
 * application/mapping/weather-view.mapper.ts —— WeatherResult → 对外 WeatherView。
 * 只做纯投影:展开 WeatherInfo 里**有值**的字段(不塞一串 undefined),
 * 再补上回显用的 place / source。无 IO、无框架。
 */
import type { WeatherResult } from '../../domain/ports/weather-provider.js';
import type { WeatherView } from '../../domain/api/weather-view.js';

export function toWeatherView(result: WeatherResult): WeatherView {
  const view: WeatherView = { source: result.source };
  if (result.place) view.place = result.place;

  const w = result.weather;
  if (w.condition) view.condition = w.condition;
  if (w.temperatureC !== undefined) view.temperatureC = w.temperatureC;
  if (w.humidityPct !== undefined) view.humidityPct = w.humidityPct;
  if (w.uvIndex !== undefined) view.uvIndex = w.uvIndex;
  return view;
}
