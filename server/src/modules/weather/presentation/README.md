# modules/weather/presentation —— 表现层

`controllers/weather.controller.ts` —— 一个端点，`src/app.ts` 挂在 `/api` 前缀下：

| 方法 & 路径 | 说明 |
| --- | --- |
| `GET /weather?city=北京` / `?lat=..&lon=..` | 当日天气 → **200** `WeatherView`；无地点 422 / 城名查不到 404 / 上游挂 502 |

- **现状**：已实现并接线。控制器很薄——把 `request.query` 原样交给用例（校验在 domain/validator、错误翻译在用例），不做业务判断。
- **错误码 → HTTP**：复用 `shared/presentation/error-handler` 的**唯一映射表**，新增错误码去那里补，别在别处再映射。
- **给前端的约定**：`source: "mock"` 时 UI 要标注「离线示意」；任何非 2xx 都该**静默回落手动预设**，不阻塞妆容提交。
