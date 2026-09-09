# modules/references/application —— 应用层

本层放「参考检索的独立用例/策略」。

- **现状**：空。检索调用发生在 `jobs` 的 RunPipeline（经 `ReferenceProvider` 端口），本模块不重复持编排。
- **将来放什么**：若参考链路需独立策略（真实图源的本地索引/缓存、按场合×肤色的匹配打分、素材合规预检），作为用例放这里，由 `compose.ts` 装配。
- **红线提醒**：素材 license/sourceUrl 合规是领域约束——若做预检放本层，别漏 `license` 必填校验。
