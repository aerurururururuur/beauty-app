# modules/products/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（且预计长期为空）。products 是**非 HTTP 能力模块**——不持有路由/控制器；
  对外只经 `index.ts`(public barrel) 暴露 `ProductCatalog` 端口。
- **为什么没有**：产品推荐**不走新端点**。它流经已有的 agent 会话视图——
  `read_product` 把读过的产品记进会话(`consultedProducts`)，会话视图透出，前端渲染一块角标。
  ★ 这一点是刻意的：`vue/src/api/agent.js` 是全项目**唯一没有 mock 分支**的 api 模块
  (`vue/AGENTS.md` §6 明说「别补」)，走新端点就得碰那条规矩，走会话视图则完全不用。
- **将来**：若要做「产品库管理后台」(看 `health` 体检报告、修条目)——**那才需要本层**，
  且要连 `app.ts` 与前端一起动。在那之前，本层无 HTTP 需求。
