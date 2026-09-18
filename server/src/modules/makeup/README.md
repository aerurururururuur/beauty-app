# modules/makeup —— 上妆引擎（核心接缝 · 决定性投入）

**全骨架最关键的一条缝。** 成品质量 =「上妆像本人、且自然」的 wow 来源。引擎产物对流水线是不透明数据，真实渲染换什么形状都不影响业务层。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/look.ts` | `Look`（引擎私有契约，对流水线不透明）+ `MakeupZone`（归一化叠加区，供前端 CSS 渲染） |
| `domain/entities/result-text.ts` | `ResultText`：`{ analysis, explain, tips }`（本模块持有，贴近 look/文案） |
| `domain/ports/engine.ts` | ★ `Engine` 端口（本模块持契约）：`{ name, generate(EngineInput) → EngineResult }`；`EngineInput{ face, scenes, brief, scene?, references?, lookSpec? }` |
| `domain/validators/engine-output.validator.ts` | `validateEngineResult`：把关外部引擎产物（路径/类型存在、坐标 0..1、RGB 0..255、opacity 0..1、blur≥0，非法 → `INTERNAL_ERROR`） |
| `application/narration.ts` | `buildNarrative`：纯函数组装「为什么这套」（场合 formality × 肤质持妆 × 肤色选色 × 穿搭/天气 tip） |
| `application/look-description.ts` | `describeLook`：`LookSpec` → 一句给用户看的人话（**唯一**一份说法，引擎的 `look.style` 也复用它） |
| `infrastructure/engine/mock-engine.ts` | `MockEngine`：occasion 基准风格 × skinTone 调深浅，产物 = 本人照片原样收编 + `zones/palette` 供前端叠加 |
| `infrastructure/engine/prompt-builder.ts` | ★★ `buildPrompt(spec, opts)`：`LookSpec` → 提示词。**纯函数**，只输出色/质地/浓度 |
| `infrastructure/engine/qwen-request.ts` | `buildGenerateRequest` + `fixtureKeyOf`：**请求组装与夹具键的唯一来源**（录制与回放靠它算出同一个键） |
| `infrastructure/engine/image-engine.ts` | `ImageEngine`：真实出图（`Engine` 的第二个实现，端口一字节没改） |
| `infrastructure/engine/replay-engine.ts` | `ReplayEngine`：回放录制的夹具，**不联网**（CI 用） |
| `infrastructure/engine/engine-fixtures.ts` | 夹具读写（`FIXTURE_FORMAT_VERSION` / `readFixture` / `writeFixture`） |
| `infrastructure/engine/__fixtures__/` | 夹具目录 —— ★ **当前是空的，见那里的 README** |
| `index.ts` | public barrel |
| `compose.ts` | `createMakeupModule({ kind, outputDir, model, qwen?, fixturesDir? })` → `{ engine }` |

## 三个引擎实现（`MAKEUP_ENGINE`）

| 取值 | 类 | 联网 | 计费 | 用途 |
| --- | --- | --- | --- | --- |
| `mock`（**缺省**） | `MockEngine` | 否 | 否 | 演示 / CI / 单测。永不因引擎崩掉 |
| `image` | `ImageEngine` | 是 | ★ **按次** | 真实出图 |
| `replay` | `ReplayEngine` | 否 | 否 | 用录制夹具离线复现（CI）。**必填** `MAKEUP_FIXTURES_DIR` |

> ✏️ **2026-09-17：这个取值原来叫 `qwen`，现改名为 `image`。**
> 理由：`mock` / `replay` 是按**行为**命名的，`qwen` 是按**厂商**命名的，
> 一套枚举里混了两种命名法。（类名那边本来是对的：`MockEngine` / `ImageEngine` / `ReplayEngine`。）
> 改名后取值与类名逐一对齐，**再接第二家生图 API 不必动这个枚举**。
> ⚠️ **旧值 `qwen` 不再兼容**：它和任何拼错的取值一样，**启动即失败**并列出合法取值。
> 不留别名是有意的——留着等于同时存在两个"合法"取值，而其中一个在文档、`.env.example`、
> `MakeupEngineKind` 里都不存在。代价是**老的 `.env` 会让服务起不来**，
> 而这正是要的：它总比"起来了、但出图那一步悄悄返回原图"早一步暴露。

★ **没有 `off`**：没有引擎就出不了成品，给个 `off` 只会得到又一个假开关。

★ **缺省是 `mock`，与 `AGENT_LLM` 同一条规矩**：缺省值必须是「不会意外产生账单」的那个。

⚠️ **未命中夹具时 `ReplayEngine` 会明确报错，不静默返回假图。** 静默假图会让 CI 全绿地骗人——那比没有 CI 更坏。

## ⚠️ `MAKEUP_ENGINE=image` 让表单路径**不可用**

真实引擎**需要妆面单（`LookSpec`）**，而 `POST /api/jobs` 那条表单路径**从来不传它**（见 `domain/ports/engine.ts` 里 `lookSpec` 的注释：它是「算出来的」，不是「用户填的」，且 `brief` 会泄漏进 `JobView`）。

所以这个取值下：

- 对话 agent 路径 → ✅ 能出真图（agent 先 `propose_look` 定出 spec，再交给引擎）；
- 表单路径 → ❌ 引擎**明确报错**，而不是瞎编一套妆。

**这是 §8.1「出图能力接给 agent」的直接后果**，也是缺省 `mock` 不只为了省钱、同时还是 `[I7]` 兜底的原因。别把它当成 bug 去"修"。

## 提示词为什么长这样（`prompt-builder.ts`）

依据是**四次花钱实测**（设计文档 §4.4），不是审美偏好：

| 那次的做法 | 结果 |
| --- | --- |
| run 1：照旧妆面稿（含构图/服装/背景） | ❌ 五官身份**全换** |
| run 3：剥掉构图条款，但**留着几何词**（「放大感美瞳」「外眼角加长」） | ❌ **仍然漂** |
| run 4：几何词也删掉，**只留色/质地/浓度** | ✅ 身份保住 + 妆效清楚可见 |

**结论：身份丢不丢取决于提示词里有没有「几何词」，不取决于锚句。** 所以模板层**不产出**几何词 / 位置词 / 眉形，也不接 `occasion` 的 `direction`/`tags`。

⚠️ 三条要说清的实话（详见 `prompt-builder.ts` 文件头）：

1. 措辞是**降低概率**，不是护栏 —— 实测里「不要磨皮」三次全败，身份把关在 §12.1 的实测打分；
2. ★ 本文件重新渲染的这一版**尚未实测**（run 4 那份手写死的一套妆没法泛化到任意 `LookSpec`），验证路径是夹具 + 实测；
3. `LookSpec.zones.brow.shape` **现在没有任何消费者**（刻意不渲染），是 §6 点名的欠债。

## 依赖 / 被依赖

- 依赖：`shared`（`SceneDescriptor` / `SCENE_RULES` 等）、`references`（`ReferenceImage` 类型）。
- 被依赖：`jobs`（注入 `engine`，产物交 `validateEngineResult` 把关）；`agent`（阶段 3 起经 `render_look` 调用）。
- **`makeup` 不认识 `agent`**：出图能力是**被调用**的，依赖方向单向。引擎本身与消费者无关。

## 现状与待办

- **现状**：`mock` 可用；`image` / `replay` 代码就位、单测绿，**但从未真跑过一次付费生成**（`__fixtures__/` 是空的）。
- **待办**：
  1. ★ **录一份真实夹具**（要花钱）：证明「引擎离线可验」这条验收真的成立。在那之前它只满足一半。
  2. ✏️ **`data/engine-out/` 的清理：agent 那条路已经做了，`jobs` 那条路还没。**（2026-09-16）
     - **已解决的部分**：`agent` 收编一张成品图之后会把引擎那份中间产物**删掉**（见 `src/session-artifacts.ts` 的 `putRender`）。这一步是必须的——那张图**就是用户的脸上了妆**，不删的话 §10 `[I8]` 那句"照片与产物被真实删除"就是**假的**：会话那份删了，`engine-out/` 里的副本永远留着，而且**没有任何模块会去枚举它**。
     - ⚠️ **那道删除带边界：只删确实落在引擎输出目录里的文件。** 少了它就会删掉用户的照片——`MockEngine` 返回的"产物"**就是输入照片自己**（`resultFilePath: input.face.filePath`），而照片在 `inputs/` 下。这是落地时踩到的，不是假想。
     - ⚠️ **仍未解决的**：`jobs` 那条路（`run-pipeline` → `artifactStore.putResult`）**不走那个适配器**，它的中间产物照旧只增不减。`jobs` 已冻结（§8.1），而且 `image` 下表单路径**本来就不可用**（见本文件上面那节 / 设计文档 §8.1），所以这条**当前没有真实泄漏**——但**只要有人让表单路径重新能用，它就立刻变成一笔隐私债**。别当它已经关掉了。
     - ⚠️ **一个配置上的坑**：收编会删源文件，所以 **`MAKEUP_FIXTURES_DIR` 绝不能指到引擎输出目录**（`DATA_DIR/engine-out`）。指过去的话，`replay` 每次的"产物"就是夹具图片自己，收编一删，**花钱录的那张夹具就没了**。
  3. `brow.shape` 要么找到色/质地/浓度维度的替代表达并删字段，要么补实测证明眉形安全。
  4. 自研参数化渲染那条路（关键点 + 局部调色合成）**没有选**：本轮的实测表明第三方编辑模型只改妆是可行的，先把这条路走通。
- **永远保留 mock 兜底**：`compose.ts` 按 kind 分发，mock 常驻可选，演示永不因引擎崩掉。
