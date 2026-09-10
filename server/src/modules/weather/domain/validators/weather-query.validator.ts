/**
 * domain/validators/weather-query.validator.ts —— 天气查询入参的校验行为。
 * 形状(weatherQuerySchema)只声明查询串的结构;这里执行形状表达不了的规则:
 *   ① city 与 (lat+lon) 二选一,两者都给或都不给都要说清楚;
 *   ② 坐标字符串 → 数值,并把范围夹逼成语义错误;
 *   ③ 清洗(city trim;trim 后为空视同没给)。
 * 失败抛带业务错误码的 AppError(缺地点是 LOCATION_REQUIRED,值不合法是 VALIDATION_ERROR)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { WeatherQuery } from '../ports/weather-provider.js';
import { weatherQuerySchema } from '../schemas/weather-query.js';
import { zodIssuesMessage } from './validate.js';

function parseCoord(raw: string, label: string, min: number, max: number): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${label}必须是数字`);
  }
  if (value < min || value > max) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${label}需在 ${min}..${max} 之间`);
  }
  return value;
}

/** 校验天气查询;不合法抛 AppError,合法返回可直接交给 provider 的查询。 */
export function validateWeatherQuery(raw: unknown): WeatherQuery {
  // ① 形状
  const parsed = weatherQuerySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  // ② 清洗
  const city = parsed.data.city?.trim();
  const hasCoords = parsed.data.lat !== undefined || parsed.data.lon !== undefined;

  if (city && hasCoords) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'city 与 lat/lon 只能给一个');
  }
  if (city) return { city };
  if (!hasCoords) {
    throw new AppError(ErrorCode.LOCATION_REQUIRED, '请提供城市(city)或坐标(lat/lon)');
  }
  if (parsed.data.lat === undefined || parsed.data.lon === undefined) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '坐标需 lat 与 lon 成对给出');
  }

  // ③ 数值解析与范围
  return {
    lat: parseCoord(parsed.data.lat, '纬度', -90, 90),
    lon: parseCoord(parsed.data.lon, '经度', -180, 180),
  };
}
