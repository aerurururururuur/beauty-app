# modules/recommendations/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（空壳模块，且预计长期为空）。recommendations 是**非 HTTP 能力模块**——对外只经 `index.ts`(public barrel)；推荐结果以数据并入 `JobView` 回显，不单独开端点。
- **为什么没有**：HTTP 入口统一在 `jobs/presentation` + `src/app.ts`。
- **将来**：推荐条目作为 `JobResult` 的一部分返回即可，无独立 HTTP 需求。
