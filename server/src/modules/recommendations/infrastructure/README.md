# modules/recommendations/infrastructure —— 基础设施层

本层放「推荐 provider / 数据源的具体实现」。

- **现状**：空。空壳模块未实现——`recommendations/compose.ts` 返回 `{ provider: null }`，未接入 `src/index.ts`。
- **将来放什么**：`domain/ports/recommender.ts` 的 `RecommendationsProvider` 实现；若「已拥有产品」来自本地手选，产品名录可作静态数据放本层。实现后在 `compose.ts` 返回实例、`src/index.ts` 接入。
