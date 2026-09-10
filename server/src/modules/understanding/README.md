# modules/understanding —— 场景理解

把「用户需求简报 brief（场合 occasion / 自由文字 sceneText）」翻译成一条可上妆的**妆容方向**，是全链路风格信号的第一棒。**风景/氛围参考图在此不驱动风格**（只作回显，视觉读图是留给未来的加分项）。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/scene.ts` | `SceneAnalysis`：`{ label, direction, tags, source }`（label 驱动后续参考图/文案/引擎） |
| `domain/ports/scene-analyzer.ts` | `SceneAnalyzer` 端口（本模块持契约）：`analyze(SceneAnalyzerInput) → SceneAnalysis` |
| `infrastructure/scene-analyzer/mock-scene-analyzer.ts` | `MockSceneAnalyzer`：`sleep(250)` + 调 `describeScene(brief)`。**判定逻辑不在这里** |
| `infrastructure/scene-analyzer/off-scene-analyzer.ts` | `OffSceneAnalyzer`：**不推断**，返回中性结果（见下「off 的语义」） |
| `index.ts` | public barrel |
| `compose.ts` | `createUnderstandingModule({ kind })` → `{ sceneAnalyzer }`；`kind` 取自 `config.sceneAnalyzer` |

## 判定逻辑在哪儿：`shared/domain/scene-rules.ts`（★ 前后端单一源）

场合判定**不在本模块**，在 `shared/domain/scene-rules.ts` 的纯函数 `describeScene(brief)`：

1. `brief.occasion` 显式给定 → 直接采用
2. 否则按 `sceneText` 关键词命中，优先级由 `SCENE_MATCH_ORDER` 决定
3. 都没命中 → `daily` 兜底
4. **之后无论走哪条**，再叠一层「修饰词」（见下）

`MockSceneAnalyzer` 只是加了个 `sleep`（让前端轮询能看到进度），判定结果与纯函数**逐字一致**——`test/understanding.test.ts` 有断言钉住这一点。

**为什么放 `shared` 而不是这里**：前端浏览器 mock 模式（`vue/src/api/mock.js`）必须给出**同一个答案**，否则两侧静默漂移。前端经 vite alias `@scene-rules` 直读该文件、绕过 `api` 层。该文件被约束为**零运行时依赖**（只允许 `import type`），后端 `tsc` 会把它照常编进 `dist/`。

改这个文件 = 同时改前端和后端的行为，两条硬规矩写在其文件头。

## 自由文字真的生效（曾经的短路已修）

此前 `if (brief.occasion)` 会把 `sceneText` **整个丢掉**：用户写满需求，只要点了场合 chip，妆容方向就固定不动。

现在两者**同时**生效：场合定基调，自由文字里的**修饰词**再调一档（追加 tags + 在 `direction` 后接一句「按你的要求…」）。修饰词分五组：低调 / 加浓 / 利落 / 温柔 / 提气色。

去重规则：场合基准 tags 里**已有**该标签 → 整条规则跳过（面试 + 「专业」不会再多一句「更利落一些」，因为面试妆本就以利落为基调）。没有任何修饰词命中时，`direction`/`tags` 与基准**完全一致**，不发散。

**刻意不收「显白」**：按真实肤色走、不默认浅肤色审美是红线 §13-3，「显白」正是那套话术。用户写了也不迎合——**不匹配是设计行为，不是漏配**（`makeup/application/narration.ts` 另有一句正面回应）。想「顺手加上」之前，请先回去读红线。

## off 的语义（别理解错）

`SCENE_ANALYZER=off` → `OffSceneAnalyzer`：返回 `{ label: 'daily', direction: <日常基准>, tags: [], source: 'off' }`。

- **off ≠ 关掉这一棒**。`jobs` 的 `run-pipeline.ts` 强依赖 `scene`，没有它流水线出不了结果；`off` 只是「**不推断**」。
- 诚实标记是 **`source: 'off'`**，**不要只看 `label`**（`label` 是 `daily` 只是为了给下游一个能跑的合法值）。
- 它存在的意义是**紧急逃生门**：将来接了视觉模型而现场翻车时，一个环境变量就能退回「什么都不判断」。

## 依赖 / 被依赖

- 依赖：`shared`（`MakeupBrief` 类型 + `describeScene` 函数）。
- 被依赖：`jobs`（注入 `sceneAnalyzer`）；`references` / `makeup` 仅引用 `SceneAnalysis` 类型。

## 现状与改法

- **现状**：mock / off 均已接通（`config.sceneAnalyzer` 真的能拨）。判定规则前后端单一源，有测试覆盖。
- **`confidence` 已删**（2026-09-10）：它零消费者，而且那四个值（0.92/0.72/0.4/0.3）是按分支**硬写的常量**——0.92 还是 0.72 完全由「用户点没点 chip」决定，而调用方本来就知道这件事。所以它连信息都不含，拿它做 UI（「置信度低，建议补一句」）等于把常量包装成测量值。判不出来时看 `source: 'off'` 就够了。**真接了视觉模型、分数变成真的了再连同测试一起加回来**（`test/understanding.test.ts` 有一条断言它不存在，就是为了挡「顺手加回去」）。
- **可选加分项（默认关，别让它变主路径）**：视觉大模型读真实照片 / 氛围图提升判定置信度。出错可能让现场 demo 翻车，须可开关且默认 off。接缝 = `domain/ports/scene-analyzer.ts` + `understanding/compose.ts`（`kind` 扩成 `'mock' | 'vision' | 'off'` 即可）。
- **红线**：无论如何，不得让氛围参考图重新变成风格主输入。
