# modules/assets/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（且预计长期为空）。assets 是**非 HTTP 能力模块**——不持有路由/控制器；对外只经 `index.ts`(public barrel) 把 `ArtifactStore` 端口与 `FileSystemArtifactStore` 暴露给 `jobs`。
- **为什么没有**：HTTP 入口统一收敛在 `jobs/presentation`（`/api/jobs` 全家）与 `src/app.ts` web shell。能力模块不各自开 HTTP。
- **将来**：除非 assets 单独提供下载端点（现在下载走 `GET /api/jobs/:id/result`，属 jobs），否则本层保持空。
