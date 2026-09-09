# modules/assets/application —— 应用层

本层放「图片存取的独立用例/策略」。

- **现状**：空。取存行为目前由 `jobs` 的用例（SubmitJob/RunPipeline）**经 `ArtifactStore` 端口直接编排**，本模块不重复持有调用逻辑。
- **将来放什么**：若资产出现不依赖 HTTP 的独立规则（体积/格式白名单、同名覆盖策略、产物清理等），作为用例/服务放这里，仍走 `compose.ts` 装配。
- **边界**：实现（本地文件系统 / 对象存储）永远在 `infrastructure`；本层只写「策略」不写「落盘细节」。
