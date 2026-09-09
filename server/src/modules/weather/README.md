# modules/weather —— 天气（空壳 · 未 wire）

端口已声明、**骨架未接入**：`brief.weather` 目前由前端手动预设回显。实拉免费源是后续工作。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/ports/weather-provider.ts` | `WeatherProvider` 端口：`fetch(WeatherQuery) → Promise<WeatherInfo>`（`WeatherInfo` 来自 shared：condition/temperatureC/humidityPct/uvIndex） |
| `index.ts` | public barrel |
| `compose.ts` | `createWeatherModule()` → `{ provider: null }`（**占位：未实现也未接入**） |

## 待办（何时做、怎么做）

1. **实现免费天气源 provider**：优先无 key 源（如 open-meteo），**离线 mock 兜底**。
2. `weather/compose.ts` 返回实例 → `src/index.ts` 接入（让 `brief.weather` 从手动预设升级为自动拉取）。
3. 前端：上传页带城市/定位 → 调后端填 `brief.weather`；天气源挂了回落到手动预设，不阻塞提交。

## 依赖

- 依赖：`shared`（`WeatherInfo` 类型）；被依赖：`src/index.ts`（接入后）、前端。
