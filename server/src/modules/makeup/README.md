# modules/makeup —— 上妆引擎（核心接缝 · 决定性投入）

**全骨架最关键的一条缝。** 成品质量 =「上妆像本人、且自然」的 wow 来源。引擎产物对流水线是不透明数据，真实渲染换什么形状都不影响业务层。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/look.ts` | `Look`（引擎私有契约，对流水线不透明）+ `MakeupZone`（归一化叠加区，供前端 CSS 渲染） |
| `domain/entities/result-text.ts` | `ResultText`：`{ analysis, explain, tips }`（本模块持有，贴近 look/文案） |
| `domain/ports/engine.ts` | ★ `Engine` 端口（本模块持契约）：`{ name, generate(EngineInput) → EngineResult }`；`EngineInput{ face, scenes, brief, scene?, references? }` |
| `domain/validators/engine-output.validator.ts` | `validateEngineResult`：把关外部引擎产物（路径/类型存在、坐标 0..1、RGB 0..255、opacity 0..1、blur≥0，非法 → `INTERNAL_ERROR`） |
| `application/narration.ts` | `buildNarrative`：纯函数组装「为什么这套」（场合 formality × 肤质持妆 × 肤色选色 × 穿搭/天气 tip） |
| `infrastructure/engine/mock-engine.ts` | `MockEngine`：occasion 基准风格 × skinTone 调深浅，产物 = 本人照片原样收编 + `zones/palette` 供前端叠加 |
| `index.ts` | public barrel |
| `compose.ts` | `createMakeupModule()` → `{ engine }`（当前只 new MockEngine） |

## 依赖 / 被依赖

- 依赖：`shared`（`SceneDescriptor` 等类型）、`references`（`ReferenceImage` 类型）。
- 被依赖：`jobs`（注入 `engine`，产物交 `validateEngineResult` 把关）。

## 现状与改法（决定性待办）

- **现状**：mock 可用（occasion 风格 × skinTone 深浅调色，缺省 medium）。demo 的「素颜 vs 得体妆」目前是 zones 的 CSS 叠加示意。
- **待办（按序）**：
  1. **拍板渲染方案**：① 自研参数化渲染（关键点 + 局部调色合成，原创强） vs ② 第三方上妆图像 API（快而稳，需核授权）。阻塞下面两项。
  2. **人脸关键点检测/对齐**：真实照片 → 五官关键点（mediapipe 等）。定位为本模块 infra，仍实现 `Engine` 端口，`compose.ts` 分发。
  3. **参数化渲染**：把妆画到照片像素（唇/眼影/底妆调色合成），保素颜真实、不做夸张滤镜；产物仍交 `validateEngineResult`。
- **永远保留 mock 兜底**：`config.makeupEngine` 分发，mock 常驻可选，演示永不因引擎崩掉。
