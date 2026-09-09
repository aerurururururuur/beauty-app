# modules/understanding/application —— 应用层

本层放「场景理解的独立用例/服务」。

- **现状**：空。「brief → 妆容方向」的编排发生在 `jobs` 的 RunPipeline（经 `SceneAnalyzer` 端口），本模块不重复持编排逻辑。
- **将来放什么**：若理解链路需独立于 jobs 的编排（多模型投票、置信度阈值策略、缓存最近判定等），作为用例放这里，由 `compose.ts` 装配。
- **边界**：端口契约在 `domain/ports`；mock 与未来视觉大模型实现都在 `infrastructure`。
