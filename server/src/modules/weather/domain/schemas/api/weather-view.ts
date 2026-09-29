/**
 * domain/schemas/api/weather-view.ts —— ★ 对外 API 契约 / DTO(GET /api/weather 响应体)。
 * 前端把 condition/temperatureC/humidityPct/uvIndex 直接塞进 brief.weather 即可,
 * 另两个字段是回显用的元信息(不给 brief 用)。
 * 不引入网络/框架类型,保持纯数据。
 *
 * ★ 形状的单源是下面那份 schema,`WeatherView` 由它 `z.output` 推出(§4.1) ——
 *   此前这里是一个手写 `interface`,而它本来就在 `domain/schemas/` 底下:
 *   目录名承诺的"形状都在这儿",与"形状是一行行手抄的"是两回事。
 * ★ **只有形状**:哪些字段缺席、值怎么裁剪是 `application/weather-view.ts` 那条管道的事(§6)。
 */
import { z } from 'zod';

export const weatherViewSchema = z
  .object({
    condition: z.string().optional(),
    temperatureC: z.number().optional(),
    humidityPct: z.number().optional(),
    uvIndex: z.number().optional(),
    /** 解析到的地点名(如「北京市 · 中国」);按坐标查询或 mock 时可能没有。 */
    place: z.string().optional(),
    /** 数据来源:`open-meteo` = 实时拉取,`mock` = 离线示意(UI 要区分标注)。 */
    source: z.string(),
  })
  .strict();

/** 已投出去的天气视图。字段含义见上面各格。 */
export type WeatherView = z.output<typeof weatherViewSchema>;
