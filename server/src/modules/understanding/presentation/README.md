# modules/understanding/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（且预计长期为空）。understanding 是**非 HTTP 能力模块**——不持有路由/控制器；对外只经 `index.ts`(public barrel) 暴露 `SceneAnalyzer` 端口 + mock 实现，供 `jobs` 编排使用。
- **为什么没有**：HTTP 入口统一在 `jobs/presentation` + `src/app.ts`。能力模块不各自开 HTTP。
- **将来**：无 HTTP 需求，本层保持空。
