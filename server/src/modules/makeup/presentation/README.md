# modules/makeup/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（且预计长期为空）。makeup 是**非 HTTP 能力模块**——引擎由 `jobs` 的 RunPipeline 经 `Engine` 端口驱动，不持有路由/控制器；对外只经 `index.ts`(public barrel) 暴露 `Engine` 端口 + `MockEngine` + `validateEngineResult` + `buildNarrative`。
- **为什么没有**：HTTP 入口统一在 `jobs/presentation`（任务/成品下载端点）+ `src/app.ts`。成品图由 assets 收编、经 `/api/jobs/:id/result` 提供，不归 makeup。
- **将来**：换真实引擎时，新实现放 `infrastructure/engine`，本层无需动。
