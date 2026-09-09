# modules/understanding —— 场景理解

把「用户需求简报 brief（场合 occasion / 自由文字 sceneText）」翻译成一条可上妆的**妆容方向**，是全链路风格信号的第一棒。**风景/氛围参考图在此不驱动风格**（只作回显，视觉读图是留给未来的加分项）。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/scene.ts` | `SceneAnalysis`：`{ label, direction, tags, confidence, source }`（label 驱动后续参考图/文案/引擎） |
| `domain/ports/scene-analyzer.ts` | `SceneAnalyzer` 端口（本模块持契约）：`analyze(SceneAnalyzerInput) → SceneAnalysis` |
| `infrastructure/scene-analyzer/mock-scene-analyzer.ts` | `MockSceneAnalyzer`：读 `brief.occasion`，否则 `sceneText` 关键词命中（面试/约会/上台/见家长…），否则 `daily` 兜底 |
| `index.ts` | public barrel |
| `compose.ts` | `createUnderstandingModule()` → `{ sceneAnalyzer }` |

## 依赖 / 被依赖

- 依赖：`shared`（`EngineSourceImage` / `MakeupBrief` 类型）。
- 被依赖：`jobs`（注入 `sceneAnalyzer`）；`references` / `makeup` 仅引用 `SceneAnalysis` 类型。

## 现状与改法

- **现状**：mock 匹配已通，`config.sceneAnalyzer` 留了 `mock` / `off` 分发缝。
- **可选加分项（默认关，别让它变主路径）**：视觉大模型读真实照片 / 氛围图提升判定置信度。出错可能让现场 demo 翻车，须可开关且默认 off。接缝 = `domain/ports/scene-analyzer.ts` + `understanding/compose.ts`。
- **红线**：无论如何，不得让氛围参考图重新变成风格主输入。
