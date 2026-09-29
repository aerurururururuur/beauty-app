# modules/makeup —— 上妆引擎（核心接缝 · 决定性投入）

**全骨架最关键的一条缝。** 成品质量 =「上妆像本人、且自然」的 wow 来源。引擎产物对流水线是不透明数据，真实渲染换什么形状都不影响业务层。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/look.ts` | `Look`（引擎私有契约，对调用方不透明）+ `MakeupZone`（归一化叠加区）。★ ✏️ 2026-09-29：`look` **今天零消费者**——`render_look` 只取 `resultFilePath`/`mimeType`，验完形状就丢；见该文件头 |
| `domain/ports/engine.ts` | ★ `Engine` 端口（本模块持契约）：`{ name, generate(EngineInput) → EngineResult }`；`EngineInput{ face, brief, references?, lookSpec? }` |
| `domain/validators/engine-output.validator.ts` | `validateEngineResult`：把关外部引擎产物（路径/类型存在、坐标 0..1、RGB 0..255、opacity 0..1、blur≥0，非法 → `INTERNAL_ERROR`） |
| `application/look-description.ts` | `describeLook`：`LookSpec` → 一句给用户看的人话（**唯一**一份说法，引擎的 `look.style` 也复用它） |
| `infrastructure/engine/mock-engine.ts` | `MockEngine`：occasion 基准风格 × skinTone 调深浅，产物 = 本人照片原样收编 + `zones/palette`。★ ✏️ 2026-09-29：`zones/palette` **今天没人读**（「供前端叠加」那个前端随 `jobs` 一起没了） |
| `infrastructure/engine/prompt-builder.ts` | ★★ `buildPrompt(spec, opts)`：`LookSpec` → 提示词。**纯函数**，只输出色/质地/浓度 |
| `infrastructure/engine/qwen-request.ts` | `buildGenerateRequest`：**请求组装的唯一来源**（纯函数，不碰网络、不读环境变量） |
| `infrastructure/engine/image-engine.ts` | `ImageEngine`：真实出图（`Engine` 的第二个实现，端口一字节没改） |
| `index.ts` | public barrel |
| `compose.ts` | `createMakeupModule({ kind, outputDir, model, qwen? })` → `{ engine }` |

## 两个引擎实现（`MAKEUP_ENGINE`）

| 取值 | 类 | 联网 | 计费 | 用途 |
| --- | --- | --- | --- | --- |
| `mock`（**缺省**） | `MockEngine` | 否 | 否 | 演示 / CI / 单测。永不因引擎崩掉 |
| `image` | `ImageEngine` | 是 | ★ **按次** | 真实出图 |

> ✏️ **2026-09-29：`replay` 取值连同 record/replay 夹具整条链删掉了。**
> 读到这里的人可能正想问"离线复现去哪了"——它从来没有兑现过：`__fixtures__/` 一直是空的，
> 一份夹具都没录（录一份要真花钱跑一次，那一步始终没做）。而一个空壳留在枚举和文档里，
> **读起来就像"离线验收这条路已经通了"**。所以是删掉，不是留着。
> ⚠️ 代价说实话：**「引擎离线可验」这条验收随之没有实现路径了**——见「现状与待办」第 1 条。
>
> ✏️ **2026-09-17：这个取值原来叫 `qwen`，现改名为 `image`。**
> 理由：`mock` 与 `image` 都是按**行为**命名的，`qwen` 是按**厂商**命名的，
> 一套枚举里混了两种命名法。（类名那边本来是对的：`MockEngine` / `ImageEngine`。）
> 改名后取值与类名逐一对齐，**再接第二家生图 API 不必动这个枚举**。
> ⚠️ **旧值 `qwen` 不再兼容**：它和任何拼错的取值一样，**启动即失败**并列出合法取值。
> 不留别名是有意的——留着等于同时存在两个"合法"取值，而其中一个在文档、`.env.example`、
> `MakeupEngineKind` 里都不存在。代价是**老的 `.env` 会让服务起不来**，
> 而这正是要的：它总比"起来了、但出图那一步悄悄返回原图"早一步暴露。

★ **没有 `off`**：没有引擎就出不了成品，给个 `off` 只会得到又一个假开关。

★ **缺省是 `mock`，与 `AGENT_LLM` 同一条规矩**：缺省值必须是「不会意外产生账单」的那个。

## ⚠️ `MAKEUP_ENGINE=image` 只有对话 agent 那条路能用

真实引擎**需要妆面单（`LookSpec`）**，而全项目只有 `propose_look` 产出它（见 `domain/ports/engine.ts` 里 `lookSpec` 的注释：它是「算出来的」，不是「用户填的」，也不该从 HTTP 边界进来）。

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
2. ★ 本文件重新渲染的这一版**尚未实测**（run 4 那份手写死的一套妆没法泛化到任意 `LookSpec`），验证路径只剩 §12.1 的实测打分（夹具已随 `replay` 一起删掉）；
3. `LookSpec.zones.brow.shape` **现在没有任何消费者**（刻意不渲染），是 §6 点名的欠债。

## 依赖 / 被依赖

- 依赖：`shared`（`EngineSourceImage` / `MakeupBrief` / `SceneDescriptor` 等）。**不依赖任何业务模块**。
- 被依赖：`agent`（经 `render_look` 调用，产物交 `validateEngineResult` 把关）。
- **`makeup` 不认识 `agent`**：出图能力是**被调用**的，依赖方向单向。引擎本身与消费者无关。

## 现状与待办

- **现状**（✏️ 2026-09-29 更正；此前这一行写的是「从未真跑过一次付费生成」）：
  - `mock` 可用 —— 骨架，产物**就是输入照本身**（`resultFilePath: input.face.filePath`，见 `src/session-artifacts.ts` 的 `putRender`）。
  - `image` 代码就位、单测绿，**而且真的跑过付费生成**：服务内至少一次（`data/results/4e2fe641-…/r1/result.png`，
    1.2 MB，而它的输入是 6.4 KB 的 webp），离线脚本另出过 6 张（`out/qwen-image-makeup/`，2026-09-15/16）。
  - ★ **分辨「真出图」与「mock 回原图」只看字节**：mock 的产物与输入**逐字节同大小**，
    真出图与输入**不同格式、不同量级**。上面那两条就是这么判的。
  - ✏️ 2026-09-29：`replay` 已删（连同夹具链）。它此前是"代码就位、单测绿，但 `__fixtures__/` 是空的"，
    也就是**从没在真实输入上命中过**。⚠️ 这与「没跑过付费生成」**不是一回事**，别并成一句：
    上面那些真实生成确实跑过，只是**没有一次是在 record 模式下跑的**。
- **待办**：
  1. ★ **「引擎离线可验」这条验收现在没有实现路径了。** 它原本的设计就是 record/replay 夹具，
     而那套已删（见上）。要兑现它得重新造一套；在那之前，唯一的验证手段是 §12.1 的实测打分
     ——真跑、真花钱、人工看图。
  2. ✏️ **`data/engine-out/` 的清理已经做了。**（2026-09-16 起；2026-09-29 起这是唯一一条出图路径）
     - **已解决的部分**：`agent` 收编一张成品图之后会把引擎那份中间产物**删掉**（见 `src/session-artifacts.ts` 的 `putRender`）。这一步是必须的——那张图**就是用户的脸上了妆**，不删的话 §10 `[I8]` 那句"照片与产物被真实删除"就是**假的**：会话那份删了，`engine-out/` 里的副本永远留着，而且**没有任何模块会去枚举它**。
     - ⚠️ **那道删除带边界：只删确实落在引擎输出目录里的文件。** 少了它就会删掉用户的照片——`MockEngine` 返回的"产物"**就是输入照片自己**（`resultFilePath: input.face.filePath`），而照片在 `inputs/` 下。这是落地时踩到的，不是假想。
  3. `brow.shape` 要么找到色/质地/浓度维度的替代表达并删字段，要么补实测证明眉形安全。
  4. 自研参数化渲染那条路（关键点 + 局部调色合成）**没有选**：本轮的实测表明第三方编辑模型只改妆是可行的，先把这条路走通。
  5. ✏️ **风格参考图不进引擎（2026-09-29 拍板）。** 用户上传的那张图只做**文本化分析**：读出的 `StyleRead`
     （`LookSpec` 的闭集子集）经 `styleReadNote` 进 `messages[]`，由模型填进 `LookSpec`。
     - **理由**：换来的是一张**没有实测过**的图不会成为身份漂移的新变量；而且读数只能落在既有闭集里，
       「给坏话开一个生成口」这件事结构性地不出现。
     - **代价**：`EngineInput.references` 仍然没有生产者（字段留着，见 `domain/ports/engine.ts`），
       于是 `qwen-request.ts` 的 refs 分支**永远走不到**，它那条 `[未验证]` 也就没法靠这条路兑现。
- **永远保留 mock 兜底**：`compose.ts` 按 kind 分发，mock 常驻可选，演示永不因引擎崩掉。
