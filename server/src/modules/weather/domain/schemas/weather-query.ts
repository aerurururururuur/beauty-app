/**
 * domain/schemas/weather-query.ts —— 天气查询入参的「形状/契约」(zod,无行为)。
 * 只声明结构:查询串里全是字符串,故坐标先按字符串收,数值解析与取值范围
 * (纬经度夹逼、city 与坐标二选一)属 domain/validators/weather-query.validator.ts 的活。
 */
import { z } from 'zod';

/** 城市名上限(字)。 */
export const MAX_CITY = 32;

export const weatherQuerySchema = z
  .object({
    city: z.string().max(MAX_CITY, `城市名最多 ${MAX_CITY} 字`).optional(),
    /** 纬度字符串(解析与 -90..90 夹逼在 validator)。 */
    lat: z.string().optional(),
    /** 经度字符串(解析与 -180..180 夹逼在 validator)。 */
    lon: z.string().optional(),
  })
  .strict();

/** 通过形状校验的查询串(仍是字符串,未清洗)。 */
export type WeatherQueryRaw = z.output<typeof weatherQuerySchema>;
