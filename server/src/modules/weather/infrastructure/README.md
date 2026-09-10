# modules/weather/infrastructure —— 基础设施层

只实现本模块 `domain/ports` 的契约。

- **现状**：
  - `open-meteo/open-meteo-weather-provider.ts` —— 实拉：① 城市名 → 坐标（geocoding-api）② 坐标 → 当日实况 + UV（api/forecast）；
    统一 5s 超时，超时 / 非 2xx / 非 JSON 全归 `WeatherUpstreamError`，调用方只管一种失败。
  - `open-meteo/wmo.ts` —— WMO 天气码 → 中文简述。**WMO 码是上游的编码约定、不是业务枚举**，故留在适配器目录，不进 domain；
    未知码返回「未知」而不是编一个像样的天气。
  - `weather-provider/mock-weather-provider.ts` —— 离线示意兜底，不联网、不失败，`source: "mock"` 由 UI 标注。
- **换源**：新写一个实现 + 在 `weather/compose.ts` 按 `kind` 分发（`shared/infrastructure/config.ts` 的 `weatherProvider` 读 `WEATHER_PROVIDER`）。
  若新源也用 WMO 码，`wmo.ts` 可复用；否则在各自目录里放自己的映射。
- **红线**：拿不到数据就抛错，**不要返回假天气**——前端宁可回落到用户手填，也不要一个看起来很真的错值。
