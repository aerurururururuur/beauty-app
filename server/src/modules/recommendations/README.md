# modules/recommendations —— 平价同款/搭配推荐（空壳 · 未 wire）

端口已声明、**骨架未接入**。未来做「省钱普惠」卖点：基于 `场合 × 妆容 × 已拥有产品` →「缺什么补什么」，**优先已有品、缺的推平价线**，诚实标注不渲染成广告位。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/ports/recommender.ts` | `RecommendationsProvider` 端口：`recommend(RecommendInput) → Promise<RecommendationItem[]>`（`RecommendInput{brief, look?}`） |
| `index.ts` | public barrel |
| `compose.ts` | `createRecommendationsModule()` → `{ provider: null }`（**占位：未实现也未接入**） |

## 待办（何时做、怎么做）

1. **输入建模拍板**：用户「已拥有产品」从哪来（骨架可本地手选/硬编码列表；将来属 `user` 模块档案的已拥有品字段）→ 再定 `RecommendationsProvider` 入参出参形状。
2. **规则引擎**：occasion + 肤质/肤色 + 已有产品 → 补齐缺口；输出 `RecommendationItem{ id, name, note }`，诚实标注「品牌参考」。
3. `compose.ts` 返回实例 → `src/index.ts` 接入 → 前端结果页展示推荐区。

## 依赖

- 依赖：`shared`（`MakeupBrief` 类型）；被依赖：`src/index.ts`（接入后）、前端。
