# modules/weather —— 天气（已接线）

当日天气实拉：**城市名或坐标 → 天气**，供前端填 `brief.weather`（从「手动预设」升级为「自动拉取」）。

上游用 **open-meteo**：无需 API key、免费额度够 hackathon、无需企业认证（同 §6 对第三方服务的取舍口径）。
两步走——城市名先经 `geocoding-api` 解析成坐标，再向 `api/forecast` 取当日实况 + 当日 UV 指数。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/ports/weather-provider.ts` | `WeatherProvider` 端口（`name` + `fetch`）、`WeatherQuery`、`WeatherResult` |
| `domain/errors/city-not-found-error.ts` + `weather-upstream-error.ts` | 本端口的两个契约错误。★ 分开是刻意的：「用户改地名就能好」(404) vs 「上游挂了」(502)。**错误类只住这里，别写回 `ports/`** |
| `domain/schemas/api/weather-query.ts` | 查询串形状（全是字符串，**只有类型与 `optional()`**） |
| `domain/validators/weather-query.validator.ts` | 行为：`MAX_CITY` 城市名上限、city 与坐标二选一、坐标解析与夹逼、`city` trim（§4.2：规则与文案同处一地） |
| `domain/schemas/api/weather-view.ts` | ★ 对外契约 `WeatherView`（前端可直接塞进 `brief.weather`） |
| `application/usecases/get-weather.ts` | `GetWeather`：**上游错误 → 业务错误码的唯一翻译点** |
| `application/weather-view.ts` | `WeatherResult` → `WeatherView`（只展开有值的字段） |
| `infrastructure/open-meteo/` | 实拉适配器 + `wmo.ts`（WMO 码 → 中文简述） |
| `presentation/weather.controller.ts` + `presentation/routes/weather.route.ts` | `GET /api/weather` |
| `index.ts` / `compose.ts` | public barrel / `createWeatherModule({ provider })`（实现由组装根注入） |

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

**绝不返回编造的天气冒充实时**：拿不到就说拿不到（502）。
★ **没有"手填天气"的回落路**（曾经有过，已删）：前端 `clearWeather()` 清空后**整块省掉**
`brief.weather`，照样能提交 —— 拉不到就是不带天气，比留着一份对不上城市的值更诚实（红线 §8-4）。

## 接线

- ★ **2026-10-02：`WEATHER_PROVIDER` 开关删了**，`OpenMeteoWeatherProvider` 由组装根注入
  （`createWeatherModule({ provider })`）。曾经的 `mock`（离线示意）只剩 `test/helpers/` 里的测试替身。
  代价是断网时 `/api/weather` 一律 502 —— 前端**整块不带 `weather` 提交**，那是诚实的空。
- `source` 字段报的是**上游名**（实拉时 `open-meteo`），不是开关取值。
  ✏️ 2026-09-30：桃妆（`vue/`）**不标来源**，`source: 'mock'` 那一份**既不摆也不送**
  （`vue/src/api/design.js` 的 `briefWeatherOf` 整块返回 `null`）。它背后的东西（别把示意当实况）
  仍然成立，只是由"标注"改成"不用"。
- `web shell` 在 `src/app.ts` 挂 `/api/weather`；`brief.weather` 由**前端**调本端点后填进
  `POST /agent/sessions` 的 `brief`（会话建立时随 brief 一起进会话）——
  ✏️ 2026-09-29:此前这里写的是 `POST /api/jobs` 的 `meta`，那个模块连同它的表单流水线一起删了。
  **本模块仍然不感知任何出图路径**:它只回一份 `WeatherView`，谁拿去用、怎么用不归它管。

## 依赖 / 被依赖

- 依赖：`shared`（`WeatherInfo` / `AppError` / `ErrorCode`）、zod、`node: 全局 fetch`。不依赖其它业务模块。
- 被依赖：`src/index.ts`（组装）、桃妆的 `/form`（✏️ 2026-09-30 起；此前那个前端的上传页已随它一起删了）。

## 待办

- [x] **前端接入**（2026-09-10）：上传页填城市 → 调 `/api/weather`，取天气四字段填 `brief.weather`；
      422 / 404 / 502 一律**整个不带 `weather` 提交**，不阻塞提交。
      ★ **前端没有「手动预设」可回落**——预设 chips 已按本模块第 2 条的同一口径删掉（roadmap §8）：
      既然不编造天气冒充实时，就不该再让人手挑一个假天气混进 `brief`。断网时 `brief` 里没有天气，
      那是诚实的空，不是缺件。
- [x] **桃妆接入**（2026-09-30）：`/form` 上「查天气」（手填城市）与「用当前位置」（`lat/lon`），
      取四格填 `brief.weather`；拉不到（或将来出现非实况来源）时**整块不带 `weather` 提交**（见上文那条 ✏️）。
      调用点只有 `vue/src/api/weather.js` 与 `vue/src/pages/FormView.vue`，**前端没有 mock 分支**。
- [ ] 按日期取非当日天气（`WeatherQuery.date` 已预留，当前只取当日实况）。
- [ ] 上游异常可观测性（目前只进 502 的 `details.reason`，无指标；竞赛规模够用）。
