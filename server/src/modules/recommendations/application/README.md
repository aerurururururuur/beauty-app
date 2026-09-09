# modules/recommendations/application —— 应用层

本层放「推荐规则引擎/用例」。

- **现状**：空（空壳模块，未 wire）。`recommendations/compose.ts` 返回 `{ provider: null }`，尚未在 `src/index.ts` 接入。
- **将来放什么**：规则引擎的核心逻辑（「缺什么补什么」：occasion×肤质肤色×已拥有产品 → 先已有品、缺口推平价线，诚实标注品牌参考）建议以用例放这里，由 `compose.ts` 装配——可独立单测，不碰 HTTP。
- **起点**：先拍板「用户已拥有产品从哪来」（本地手选，不建账户），再定 `domain/ports/recommender.ts` 入参出参。
