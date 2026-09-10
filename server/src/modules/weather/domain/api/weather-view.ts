/**
 * domain/api/weather-view.ts —— ★ 对外 API 契约 / DTO(GET /api/weather 响应体)。
 * 前端把 condition/temperatureC/humidityPct/uvIndex 直接塞进 brief.weather 即可,
 * 另两个字段是回显用的元信息(不给 brief 用)。
 * 不引入网络/框架类型,保持纯数据。
 */
export interface WeatherView {
  condition?: string;
  temperatureC?: number;
  humidityPct?: number;
  uvIndex?: number;
  /** 解析到的地点名(如「北京市 · 中国」);按坐标查询或 mock 时可能没有。 */
  place?: string;
  /** 数据来源:`open-meteo` = 实时拉取,`mock` = 离线示意(UI 要区分标注)。 */
  source: string;
}
