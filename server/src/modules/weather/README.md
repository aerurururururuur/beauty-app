# modules/weather —— 天气（已接线）

当日天气实拉：**城市名或坐标 → 天气**，供前端填 `brief.weather`（从「手动预设」升级为「自动拉取」）。

上游用 **open-meteo**：无需 API key、免费额度够 hackathon、无需企业认证（同 §6 对第三方服务的取舍口径）。
两步走——城市名先经 `geocoding-api` 解析成坐标，再向 `api/forecast` 取当日实况 + 当日 UV 指数。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/ports/weather-provider.ts` | `WeatherProvider` 端口（`name` + `fetch`）、`WeatherResult`、两个契约错误 `CityNotFoundError` / `WeatherUpstreamError` |
| `domain/schemas/weather-query.ts` | 查询串形状（全是字符串）+ `MAX_CITY` |
| `domain/validators/weather-query.validator.ts` | 行为：city 与坐标二选一、坐标解析与夹逼、`city` trim |
| `domain/api/weather-view.ts` | ★ 对外契约 `WeatherView`（前端可直接塞进 `brief.weather`） |
| `application/usecases/get-weather.ts` | `GetWeather`：**上游错误 → 业务错误码的唯一翻译点** |
| `application/mapping/weather-view.mapper.ts` | `WeatherResult` → `WeatherView`（只展开有值的字段） |
| `infrastructure/open-meteo/` | 实拉适配器 + `wmo.ts`（WMO 码 → 中文简述） |
| `infrastructure/weather-provider/mock-weather-provider.ts` | 离线示意兜底（不联网、不失败） |
| `presentation/controllers/weather.controller.ts` | `GET /api/weather` |
| `index.ts` / `compose.ts` | public barrel / `createWeatherModule({ kind })` |

## 端点

`GET /api/weather?city=北京` 或 `?lat=39.9&lon=116.4` → `200 WeatherView`

```json
{ "source": "open-meteo", "place": "北京 · 中国",
  "condition": "晴", "temperatureC": 29, "humidityPct": 18, "uvIndex": 6 }
```

## 失败怎么表现（前端据此回落）

| 情况 | 错误码 | HTTP | 前端该做什么 |
| --- | --- | --- | --- |
| 没给地点 | `LOCATION_REQUIRED` | 422 | 提示填城市或定位 |
| 城市解析不到 | `CITY_NOT_FOUND` | 404 | 提示改地名 |
| 上游超时 / 断网 / 返回体不合预期 | `WEATHER_UNAVAILABLE` | 502 | **回落到手动预设，不阻塞提交** |
| 坐标越界 / 非数字 | `VALIDATION_ERROR` | 422 | 提示输入有误 |

**绝不返回编造的天气冒充实时**：拿不到就说拿不到（502），让前端去用用户手填的值。

## 开关与接线

- `WEATHER_PROVIDER=open-meteo`（缺省，实拉）| `mock`（离线示意，演示断网前切）。
  `mock` 的响应带 `source: "mock"`，**UI 要据此标注「离线示意」**，别当实况展示。
- `web shell` 在 `src/app.ts` 挂 `/api/weather`；`brief.weather` 由**前端**调本端点后填进 `POST /jobs` 的 meta——
  jobs 不感知本模块（本轮未动 jobs 的 schema/编排）。

## 依赖 / 被依赖

- 依赖：`shared`（`WeatherInfo` / `AppError` / `ErrorCode`）、zod、`node: 全局 fetch`。不依赖其它业务模块。
- 被依赖：`src/index.ts`（组装）、前端上传页（待接）。

## 待办

- [ ] **前端接入**：上传页带城市 / 定位 → 调 `/api/weather` 填 `brief.weather`；502 / 404 时静默回落手动预设（roadmap §8 第 2 条，属前端板）。
- [ ] 按日期取非当日天气（`WeatherQuery.date` 已预留，当前只取当日实况）。
- [ ] 上游异常可观测性（目前只进 502 的 `details.reason`，无指标；竞赛规模够用）。
