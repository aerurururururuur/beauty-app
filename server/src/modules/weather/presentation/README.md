# modules/weather/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（空壳模块，且预计长期为空）。weather 是**非 HTTP 能力模块**——天气经 `brief.weather` 随任务提交，不单独开端点；对外只经 `index.ts`(public barrel)。
- **为什么没有**：HTTP 入口统一在 `jobs/presentation` + `src/app.ts`。
- **将来**：天气以结构化数据进 `brief.weather` 回显（已有字段），无独立 HTTP 需求。
