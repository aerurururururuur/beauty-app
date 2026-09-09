# modules/weather/infrastructure —— 基础设施层

本层放「天气 provider 的具体实现」。

- **现状**：空。空壳模块未实现——`weather/compose.ts` 返回 `{ provider: null }`，未接入 `src/index.ts`。
- **将来放什么**：一个免费天气源实现（优先无 key，如 open-meteo），实现 `domain/ports/weather-provider.ts` 的 `WeatherProvider`；同时保留离线 mock 兜底。实现后在 `weather/compose.ts` 返回实例、`src/index.ts` 接入。
