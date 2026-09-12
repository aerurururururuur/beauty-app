# AI 上妆引擎 · 选型分析与 API 实测规范（学生预算版）

> **⚠️ 2026-09-12：主选已作废，本单当前不可派单。** 见 §0。以下内容是调研记录，不是行动依据。

> 对应 roadmap §6（上妆引擎拍板）与 §13 待拍板第 1 条。
> 目的：在一周内用**真实厂商调用**验证一条「上妆像本人、且自然」的引擎路线，
> 产出可复用的离线回归夹具，然后把这单「真实 API 的 dirty 测试」干净地交给别人。
>
> 日期：2026-09-09 · 预算是学生档（≈¥0，且**没有企业主体**）；价格/额度/接入形态以注册当日厂商文档为准，本文只给量级与判断口径。
>
> **补充：2026-09-11** —— 有人提出「改走 prompt 驱动的生成式上妆」并给了四个候选。复核后**主线不变**，
> 但查出主选厂商另有一条**参数化腿**（§1.2，连带收益是可让 `references` 退役、消掉红线 §13-2 的悬空项），
> 以及对四个生成式候选的逐条判断（§3.1）。**§1 的原文一字未改**，只加指引。

---

## 0. ⚠️ 主选作废（2026-09-12 · owner 拍板）

**Perfect Corp 全线放弃，理由 = 成本（「太贵了用不起」）。**

**本方案至此没有主选，选型重新打开。** 下面的分析**原文一字未改**，作为调研记录保留——
它们仍有引用价值，且其中两条结论**不受本次变更影响**：

- §3.1 对四个生成式候选的排除（MAD / SD+FaceID / FLUX+LoRA / Picsart）——那些结论与价钱无关；
- `ai-engine-selfhost-review.md` 对整条自建链的排除——同样与价钱无关。

**按作废读的部分**：凡以「Perfect Corp 是主选」为前提写下的段落——§1、§1.1、§1.2 的收益推导、
§2 接法、§3 厂商对比表、**§4 整段 dirty 测试规范**、§5 决策树。其中 **§4 的作废代价最大**：
它是一份完整的、可派单的实测规范，作废后**没有替代品**，重开选型等于把这单的工期退回起点。

### 0.1 矛盾已查明：§1 的免费额度数字是错的（注册只送 **40 units**，不是 500~1000）

§1 第 1 条写「个人注册 → 直接送免费单元（**常见推广码 500~1000 单元**）」，
§3 对比表也把「学生成本」标成「¥0 免费单元够 hackathon」。

**2026-09-12 调研：基准数字错了，而且错在关键处。** 三个独立来源一致给出 **40 units**：
Perfect Corp 官方博客（2026-07，"40 free credits"）与两位 Zenn 作者的注册实测
（均记录控制台显示 `Free Tries for API: +40 units`）。500~1000 那两个数字是
**促销码 / 黑客松专属**，不是注册基准。

按本文件自己的单价换算：

| | §1 原文假设 | 实际 |
| --- | --- | --- |
| 注册免费额度 | 500~1000 units | **40 units** |
| Copy Makeup（2 units/张） | 250~500 张 | **20 张** |
| 参数化 VTO（1 unit/张） | 500~1000 张 | **40 张** |

**这很可能就是「太贵用不起」的来源**：40 units 只够录一段 demo 素材，
**跑不完 §4.3 那个调用矩阵**（光 happy path 一行 = 5 档肤色 × 2 类参考 = 10 张 = 20 units，
矩阵跑不到 1/3 就归零）。要跑完就得买 500 units（$27.50）或订阅 $24/月。

> ✅ **2026-09-12 owner 已确认**：原因**正是费用**（原话「不要了，用不起」）。
> 这条挂了两轮的 `【待 owner 确认】` 到此关闭，**推测成立**，§0 的作废结论无需修正。
> 也即：**候选四（商业 API）整类按「用不起」关闭**，见 `ai-engine-makeup-models.md` §5。
（注：Devpost 那场给 1000 units 的 YouCam 黑客松**报名已于 2026-08-16 截止**，对本队已过期。）

> **推论**：§1 那句「hackathon 量级不用真花钱」**结果是对的，但理由是反的**——
> 不是「额度大到可以随便跑」，是「额度小到只够预录」。**这两个理由指向完全不同的决策**，
> 前者支持把它当主选，后者不支持。

**另一条待试的低成本翻盘路径（已随 owner 表态作废，保留仅作记录）**：促销码 `ytmakerthrive`
可换 **500 units**（二手来源，未核）。**⚠️ 2026-09-12：owner 已明确表态「用不起」，
这条路不必再试**——即便促销码有效，翻盘后仍是「额度用完就要付费」的商业 API，
不解决 owner 的顾虑。原文保留，是为了记住**当时差点把决策押在一个没核实的促销码上**。

### 0.1b 一个更隐蔽的死法（比网络不通更该先测）

有实测称：**40-unit 免费档下 `makeup-transfer` 返回 404**。但官方文档 v1.9 的真实 slug 是
`mu-transfer`，**所以那个 404 很可能是 slug 写错，不能当证据**——此格**悬而未决**。

**但它揭示了 §4.7 第 0 步的漏洞**：原文只测「网络可达性」。**网络通但接口不在当前额度档里，
比网络不通更难发现。** 若将来复用该文，第 0 步应扩成三格：① 网络通不通 ② `mu-transfer`
在当前档能否建 task ③ `makeup-vto` 能否跑（后者已被实测确认免费档可用）。

> ⚠️ **本节全部数字来自 WebSearch 摘要，未读到厂商原文**（本环境 WebFetch 被全域拦截）。
> 「调研环境打不开」**不等于「大陆网络连不上」**——这是工具侧策略，与 venue 网络无关。

### 0.3 重开选型的结果记在别处

主选作废后的四路平行调研，结果汇总在 **`docs/plan/ai-engine-makeup-models.md`**（2026-09-12 新建）。
**那份文档没有拍板，只是记录**，且**调研中途被主动中止**（四路回了三路），它的 §7 列了没做完的事。
本文件不再追加新的候选分析——**新东西往那边写**，本文只留作第一轮（厂商路线）的调研记录。

### 0.2 本次作废**没有**解决的事

主选下线**不改变**任何一条红线，也不消解任何一项悬空风险：

- 红线 §13-2「`references` 没有合规素材来源」**仍然悬空**——§1.2 那条「参数化接口可让参考图退役」
  的出路是**挂在 Perfect Corp 上的**，厂商一走，这条出路一并作废；
- 红线 §13-4 的隐私面**没有变**：换任何云端引擎，用户自拍仍是上传到第三方；
- 「mock 常驻可切」「5 档肤色必须全绿」「`engine-output.validator` 把关外部产物」三条**不变**。

---

## 1. 一句话结论（先测哪个）

> **⚠️ 本节以下作废（2026-09-12）**：见 §0。保留原文仅为记录调研过程，不得作为行动依据。

**主选 = Perfect Corp YouCam「AI Copy Makeup / Makeup Transfer」REST API。**

它是「把一张参考妆**整体复刻**到另一张本人脸上」的语义最贴 API，而且**个人邮箱注册即开、不需要公司/营业执照**——对学生是硬门槛的胜负手：

1. **不要企业认证**：国际开发者平台，个人注册 → 直接送免费单元（Copy Makeup ≈2 单元/张，常见推广码 500~1000 单元）。hackathon 量级**不用真花钱**，只有要超量才 $24/月。
2. **语义最贴**：输入本人照 + 一张参考妆照 → 输出「妆在本人脸上」——正好是我们的 references → makeup 两段。
3. **保留本人脸**：渲染在用户自己的面部特征上进行，不是重画一张脸 → 贴合 §6 wow = 像本人且自然。
4. **async task 模型**：`POST task → 轮询 → 取图`，跟我们 jobs 流水线同构；`Engine` 端口 2 个成员即可接住。
5. **大陆直连需实测**（§4.7 第 0 步）——这是本方案唯一要赌的点；不通就预录 + 切本地兜底，别让它卡死 demo。

> **补齐（2026-09-11）**：上面说 Copy Makeup「参考照语义最贴」——**这不等于「Perfect Corp 只吃参考图」**。
> 同一账号、同一份免费单元下还有一条**参数化上妆**的腿（`category` / `palettes` / `colorIntensity`…），
> **LLM 可直接输出那份 JSON，无需参考图、无需换供应商、无需 GPU**。见 **§1.2**。
> 对「生成式 prompt 驱动」四个候选的复核见 **§3.1**。

**曾想主选、现已降级 = 美图 mtlab「美妆」Web API**：全妆部位可控、国内快、免费试用（1000 次/1QPS），但**注册要求企业认证（实测确认）**，学生没有 → 只在「你有企业主体 / 找到可靠中转」时才用。详见 §1.1 中转站核查结论。

**常驻兜底（红线 1，永不拆）= MockEngine 保持可切换。** demo 任何时刻不因云端挂掉翻车。
cloud 引擎只在「受控测试 + 预设授权图」下走真实；现场真人即拍默认落 mock / 本地，隐私红线见 §4.6。

### 1.1 中转站核查结论（美图卡企业后查过）

- **幂简集成（explinks）挂着「美图奇想·美妆」**，标注个人&企业——但细看接入流程是**引导你回美图官网注册**，并非「免企业中转」；且标价「商务咨询」。**不能解企业门槛**。
- **阿里云云市场**有美图官方店（厦门美图之家），上架的是智能抠图/局部重绘/无痕消除/换脸/证件照等，**没有「美妆上妆」接口**。
- **未找到**「个人即可直接调用美图美妆、免企业」的可靠中转。**别为它烧时间**——要么借企业主体，要么就用 Perfect Corp。

**本轮不选**：
- **腾讯云人脸试妆**：只有试唇色上线，腮红/眉/眼影/眼线仍「开发中」——全妆不够（若 demo 只讲唇色可单挂：个人实名即可，每月 1000 次免费 + 0.01 元/次）。
- **ModiFace（欧莱雅自家）**：商务 license、无自助试用，6 周拿不到，不赌。
- **自研参数化 / 开源模型自托（PSGAN/EleGANt/DTMT）**：¥0 但要自己搭推理服务 + GPU + 权重，演示稳风险高；DTMT 还是 CC BY-NC-SA 非商用。留作远期 B。
- **Banuba / Revieve / 腾讯 Beauty AR SDK**：形状不搭（on-device SDK / 托管完整体验），进不了服务端 `Engine` 端口。

### 1.2 补齐（2026-09-11 调研）：主选厂商还有一条「参数化」腿

上文说 Copy Makeup「参考照语义最贴」，**这不等于 Perfect Corp 只吃参考图**。
同一账号、同一份免费单元下，官方价目表并列三个妆效接口：

| 接口 | 输入形态 | 单元/张 |
| --- | --- | --- |
| AI Virtual Makeup **Try-On** | **结构化参数**，无参考图、无自然语言 | **1** |
| AI Virtual Makeup **Look** Try-On | 预设整妆 | 2 |
| AI **Copy Makeup** | 参考妆照 | 2 |

参数化 VTO 的请求体是 `effects[]`，每条必须给 `category`，并配 `palettes[]`：

- `category` 共 13 种：`skin_smooth` / `foundation` / `concealer` / `contour` / `bronzer` / `blush` /
  `highlighter` / `eyebrows` / `eye_shadow` / `eye_liner` / `eyelashes` / `lip_color` / `lip_liner`
- `palettes[]` 含 `color`（`#RRGGBB`）、`texture`、`colorIntensity`（0–100）
- `texture` 按部位给枚举，例：`lip_color` = `matte|gloss|holographic|metallic|satin|sheer|shimmer`，
  `blush` = `matte|satin|shimmer`。部分 texture 触发条件必填字段，如 `gloss` / `shimmerColor` /
  `shimmerIntensity` / `transparencyIntensity`。

**这对本项目意味着什么**：LLM 不必输出「`sun-kissed makeup, peach blush...`」这类散文 prompt，
而是直接输出这份 JSON。`palettes[{color, texture, colorIntensity}]` 与现有领域类型
`Look{ style, palette, zones }` 几乎是同一个形状。于是「文字控制妆容」不需要换供应商、不需要 GPU、
不需要新账号——在同一个 `Engine` 端口下再加一个实现即可，即 `makeup/infrastructure/engine/` 的第三个实现，
接线仍在 `makeup/compose.ts`，业务层零改动。且它比 Copy Makeup 更便宜，1 unit/张 vs 2 unit/张。

**连带收益，与审美无关**：`references` 模块存在的唯一理由是给 Copy Makeup 供参考妆照。
一旦引擎能收参数，参考图不再是必需输入，`references` 就可从主链路降为可选，
红线 §13-2 那个「授权问题一点没解决，只是换了对象」的悬空风险顺手消掉。
单凭这条合规收益就值得补这条腿。

**条款核实（2026-09-11 二次检索）**：这一条以前是推断，现在有原文支撑。

- **商用**：YouCam API 服务条款**未限制** AI 生成内容的商业使用。条款同时提示生成内容无法完全规避第三方 IP 风险，需自行评估，这与本项目「只用已授权人物照片」的做法不冲突。
- **隐私**：用户提交的素材在 Perfect Corp 服务器**存 1 天后自动删除**。这一条直接对上红线 §13-4。
- **额度**：免费账号 $0、**无需信用卡**；订阅 $24/月（$0.048/unit，60 天有效）；按量付费 $27.50 买 500 units（$0.055/unit，1 年有效）。注意 **units 与 credits 是两套东西**——credits 只在 YouCam 在线编辑器 UI 里用，调 API 只认 units。
- **黑客松**：2026 年 7 月那场 YouCam API 黑客松给参赛者 1000 免费 units，线下活动另发 500。厂商对 hackathon 用量的态度是松的。

**仍未核实**：Perfect Corp 2026-05 起另有官方 MCP server `@perfectcorp/youcam-mcp`，
是否覆盖 VTO 参数化接口未核。若覆盖，「AI Agent 架构」这条叙事可以更硬。

---

## 2. 怎么接（Engine 端口，业务层零改动）

`EngineInput` 已带 `face` / `references` / `brief` / `sceneAnalysis`，Copy Makeup 正好用得上：

```text
makeup/infrastructure/engine/
├── mock-engine.ts          # 现状(常驻,离线兜底)
├── copy-engine.ts          # 新增(主):按 Perfect Corp Copy Makeup 实现 Engine.generate
└── meitu-engine.ts         # (可选,备)若有企业主体/中转:按美图美妆实现,同一端口
```

- 入参：`input.face`（本机已落盘原图）+ 从 `input.references` 挑主参考妆照（我们的 references 自绘样本）→ 上传两张 → 建 Copy Makeup task → 轮询 → **下载成品回本机路径** → 填 `EngineResult{ resultFilePath, mimeType, look }`；`look` 由本次所用妆容的 `Look{ style, palette, zones }` 直接带上。
- 接线只在 `makeup/compose.ts`：`config.makeupEngine === 'copy'` 返回 copy 实例，`'meitu'` 返回美图实例，其余返回 mock；controller/流水线不感知。
- 产物照旧过 `engine-output.validator`（路径/类型存在、坐标比例 0..1、RGB 0..255…）——对外部引擎的**第一道通用守门**。
- 若 Copy Makeup 质量/网络不达标：同一端口换 meitu 或退回 mock，只改 `compose.ts`——这就是端口存在的意义。

---

## 3. 厂商对比（学生预算 + 无企业主体视角）

| 维度 | **Perfect Corp Copy Makeup（主）** | 美图 mtlab 美妆（备·需企业） | 腾讯人脸试妆 | 腾讯 Beauty AR SDK | 开源模型自托 |
| --- | --- | --- | --- | --- | --- |
| 全妆部位 | ✅ 参考妆整体复刻 | ✅ 唇/腮/眉/眼影/眼线… | ⚠️ 只唇色 | ✅ 全品类 | 视模型 |
| **要企业认证?** | **❌ 不要（个人即开）** | ✅ 要（实测确认） | ❌ 个人实名即可 | 需 License | ❌ 不要 |
| 形态 | REST async task（服务端） | REST（服务端） | REST（服务端） | on-device SDK | 自建服务 |
| 学生成本 | **¥0 免费单元够 hackathon** | ¥0 试用但够不着 | ¥0（1000 次/月）能力不全 | 14+14 天试用 | ¥0 但要 GPU/工期 |
| 大陆直连 | ⚠️ 需实测 | ✅ 快 | ✅ 快 | ✅ | — |
| 适配我们 | **参考照语义最贴** | zones 参数驱动 | 不够 | 进不了服务端端口 | 演示稳风险高 |
| 上手速度 | 注册送码即测 | 卡企业 | 注册即测 | 申请 License | 数天起 |

### 参考算法底层是谁（2026-09 核实；影响质量预期与叙事）

美图秀秀的美颜/美妆 ≠ 生成式大模型，是 **MT Lab（美图影像研究院，2010 成立）自研 CV**：
高精度人脸关键点（对外 **118 点**）+ 3D 人脸重建 + 局部图像处理，妆「贴/融」到检测部位；
MTIR-GAN 只做发丝/肤质细节修复、**保留身份**。AIGC 图生图才走 MiracleVision（扩散模型，2024-01 备案、2026 V6/MoE）。
这类「关键点锚定、保脸不变」是美妆算法的通行路线——Perfect Corp 的 Copy Makeup 也强调保留本人面部特征。
叙事上可诚实写「消费级/商用上妆算法的开放能力」，不吹自研。

### 3.1 生成式候选复核（2026-09-11）——「prompt 驱动」四条路的实测前评估

背景：有人提出「换掉 Copy Makeup，改走 prompt 驱动的生成式上妆」，并给了四个候选。
§1.2 已说明 prompt 这条路在主选厂商内部就有，所以本节要回答的是「哪条值得留作 wow，哪条只是看起来像」。
**四条都不建议作为主线**，理由逐条如下。它们本质上是 §1「本轮不选」里
「自研参数化 / 开源模型自托……留作远期 B」那一条的展开。

| 候选 | 主张 | 复核结论 | 定级 |
| --- | --- | --- | --- |
| **MAD** Makeup All-in-One | 一个模型做迁移 / 卸妆 / 文字编辑 | 学界最贴本项目概念，但工程上不可押 | ⭐⭐ |
| **SD + Inpainting + FaceID / InstantID** | 锁身份 + 局部重绘 | 「保脸」是假的，且绕一圈回到参数化 | ⭐⭐⭐ |
| **FLUX.1 + LoRA / Inpainting** | prompt 生成自然妆 | **框架已过时**：LoRA 与「每次换描述」不匹配 | ⭐⭐ |
| **Picsart Qwen Makeup API** | 图 + prompt 直接出 | **命名有误**：平台上没有这个单一接口 | ⭐⭐ |

**MAD —— 当论文读，不当依赖**

- **真实存在**：arXiv **2504.02545**，Bo-Kai Ruan & Hong-Han Shuai，阳明交大 BASIC Lab。
  用 domain embedding 单模型做多任务：美颜滤镜 / 卸妆 / **文字修改** / 单妆迁移 / 尺度迁移 / 部件迁移 / 多妆迁移。
  另发 **MT-Text** 数据集，由 MT 数据集加 GPT-4V 标注再人工校验。
  **它是唯一正面回答「一个模型同时做迁移 / 卸妆 / 文字编辑」的工作**，「多任务单模型」这个概念是它先做的，
  叙事上值得引用。
- **但作为主线风险信号密集**：仓库约 **26 stars / 2 forks**，最后活动停在 **2025-06**，此后一年多未动；
  **权重是否放出、仓库 license 是什么，均未能核实**——调研环境里 github.com 与 arxiv.org 被网络策略拦下，
  只见论文页标 **CC BY 4.0**，那是论文的许可，不等于代码与权重的许可；底座是 SD 一系扩散模型，**需要 GPU**；
  训练数据是 MT / MT-Text，即专业妆容人脸照，对普通自拍的泛化未知，尤其亚洲真实自拍——
  这个未知量正好落在 §4.4 评分表的核心格上。
- **结论**：**不进代码路径**。26 star + 一年未更新 + 权重存疑，不该押 10/20 的 demo。

**SD + Inpainting + FaceID / InstantID —— 真正的坑是「保脸是假的」**

- IP-Adapter-**FaceID** 用 CLIP 视觉编码器，特征语义弱：能抓到大概气质与发色，**丢掉具体面部身份**。
- **InstantID** 换用 ArcFace 做人脸 embedding，保身份显著更强，代价是**文字驱动编辑能力弱**，
  公开评测里 Correspondence 一项偏低；且 ID embedding 中性别 / 年龄耦合、难以解耦，
  结果会被参考照外观污染，姿态与表情会漂。
- 若非走生成式不可，唯一站得住的变体是**只重绘妆区**——唇、眼睑、颊——保留底图原像素。
  但那等于重新搭一个参数化引擎，**绕一圈回到 §1.2 那条腿**。
- 红线相关性：这类模型对**深肤色**的偏置是已知高危区，见 §4.2 的 5 档肤色要求。

**FLUX.1 + LoRA —— 框架已过时，该看指令编辑模型**

- LoRA 解决的是「训练一个**固定风格**」，本项目要的是「**每次换一段描述**」，两者不匹配。
- 2026 年该看的是**指令编辑模型**：

  | 模型 | 保身份 | 参考价 |
  | --- | --- | --- |
  | **Qwen-Image-Edit-2511**，20B | 最强，专为「保持这人、只改一处」设计 | ≈$0.03/张 |
  | FLUX.1 Kontext [pro] | 好 | $0.04/张，flat |
  | FLUX.1 Kontext [max] | 好 | $0.08/张 |

- Qwen-Image-Edit 系另有人像 / 妆容方向 LoRA，如 `Qwen-Image-Edit-2511-Ultra-Realistic-Portrait`。
- **若一定要赌一条生成式 wow，只留这一个名额**，且走**阿里云百炼**的 `qwen-image-edit-plus`，≈$0.03/张，
  **国内直连**、个人实名即可，比 Replicate / fal 实际。
  **未核实**：百炼对**人脸输入**的合规审核策略。这类平台通常有内容审核，**现场真人自拍可能被拦**，
  接之前必须先测这一格。同 §4.7 的精神：可达性是第 0 步。

**Picsart —— 命名要修正**

- 「Picsart Qwen Makeup API」**不是一个东西**，是平台上**两个分开的条目**：Picsart 自家的 **Makeup 模型**，
  做虚拟上妆，覆盖唇 / 眼 / 腮 / 整妆；加上它**托管的 Qwen 图像编辑**。
  没找到任何把两者合起来的「用 Qwen 做美妆」的公开接口与 schema——GenAI API 有
  `genai-image-edit` / `genai-image-inpainting` 等，但没有美妆专用 shape。
- 免费额度 **100 次/月**，图像编辑约 **$0.01 起**，长期成本高于 Perfect Corp 的免费单元档。
- 结论：当 demo 快速通道可以，当长期方案不行。

**共同结论**：四条里三条——MAD、SD+FaceID、FLUX+LoRA——都指向「**租 GPU + 调参**」，
而 §1 已说明 `wow = 上妆像本人、且自然` 这个目标在主选厂商内部就能拿到。
**不建议为它推翻主线**；生成式最多留 Qwen-Image-Edit 一个名额做**对照实验**，
且必须与主选**共用同一套夹具与同一张评分表**，见 §4.2 与 §4.4，否则不可比。

**二次检索补充（2026-09-11）：FLUX-Makeup**

`360CVGroup/FLUX-Makeup` 是最对症的开源妆容迁移模型：SoTA、production-ready、
自带 5 万样本的 HQMT 数据集、只需「源图 + 参考图」而不需要额外人脸控制模块。
看起来正是这四条之外的第五个答案。

**但它的骨干是 Flux-Kontext.dev，非商用许可。** 与 InsightFace 是同一个模式：
效果最好的那个，许可最脏。FLUX 的 NC 条款对「输出」是否可商用本身还有争议，
v1.1 删掉了允许商用输出的表述，BFL 事后称「不打算改变许可精神」并回退了争议条款，
社区结论仍是不买商业授权就不能靠输出获利。

**判据**：判断一个自建方案能不能用，**看骨干，不看包装**。上层再怎么开源，骨干的许可会一路传下来。

同批检索还确认了本地路线的一条新出口：**Qwen-Image-Edit-2509 是 Apache 2.0，
配 Nunchaku 的 INT4 推理能在 8 GB 显存上跑**。展开见 `ai-engine-selfhost-review.md` §5.6 与 §5.7。

> **展开见 `ai-engine-selfhost-review.md`。** 该文是本节后半——SDXL / ControlNet / IP-Adapter FaceID /
> InstantID / 人脸分割这条**自建链**——的完整论据：本机硬件实测 RTX 5060 Laptop **8 GB** 而整条链需 >13 GB、
> 「锁身份那一步在编辑自己照片的流程里是反的」的架构反驳、InsightFace **NC** 链条与红线 §13-2 的正面冲突、
> 人脸分割**没有腮红/眼影类**，以及一份**在这台机器上真跑得起来**的实施方案。
> 本节只给「不建议作主线」的定级，理由是那一份。

---

## 4. 交给别人的 dirty 测试规范

> **⚠️ 本节整段作废（2026-09-12）**：它是**为 Perfect Corp 专门写**的实测规范，厂商下线即失效（§0）。
> 但**它的方法论没有失效**——夹具集（§4.2 的 5 档肤色）、评分表（§4.4）、
> record/replay 离线回归（§4.5）、隐私与预算红线（§4.6）、可达性第 0 步（§4.7）**这五件是通用的**，
> 重开选型时**原样复用，不要重写**，只把「Perfect Corp」替换成新候选。
> 真正作废的只有：§4.1 的注册对象与脚本目标、§4.3 矩阵里的厂商特有行。
> **重开选型时最该庆幸的一点**：这套夹具与评分表当初就是按「厂商无关」写的，所以它还值钱。

> 下面整段可以原样转给接手的人。目标是在**¥0 预算 + 无企业主体 + 不触红线**内，把 Perfect Corp Copy Makeup 真实跑通，
> 交付：① 质量评分表 ② 免费单元够不够 / 每张延迟 ③ 边界用例行为 ④ record/replay 夹具（把真实调用变成离线回归）。

### 4.1 任务边界（接手人职责）

1. 注册 Perfect Corp（yce.perfectcorp.com/ai-api）→ 拿 key + 免费单元。**同时试注册美图**（ai.meitu.com）：若卡企业认证，记一行「卡企业」就停，**不去找中转**（§1.1 已核查无可靠免企业中转）。
   - 产物：key 写进本地 `.env`（**不要提交**），登记各自剩余免费额度。
2. 搭**一次性脚本**（放 `server/scripts/engine-spike/`，跑完即用）：
   - 输入：一张夹具人脸 + 一张夹具参考妆照 → 输出：成品图到 `tmp/` + 一行结构化日志（接口名、耗时 ms、单元消耗、成功/错误）。
   - 先单测「鉴权 + 上传 + 建 task + 轮询 + 下载」链路通，再上循环。**精确入参以厂商文档为准**（Copy Makeup 怎么传 source look + target face）。
   - **★ 同脚本里一并打通参数化 VTO**（§1.2；1 unit/张、无参考图）：手写一份 `effects[]` 直接喂，先验证「不传参考图也能出妆」。
     这是本单**新增的第 0 号对照**——它若通了，「参考图是不是必需」这个前提就被推翻了，后面整条 `references` 链路的取舍都要重估。
3. 按 §4.2 夹具集、§4.3 矩阵跑，逐张填 §4.4 评分表（**参数化 VTO 用同一套夹具**，见 §4.3 末行）。
4. 对每张结果：跑现有 `engine-output.validator`，记下外部产物是否被守门拦下（拦下 = 厂商返回怪形状 or 我们 validator 过严，要排查）。
5. 把表现最好的一批真实请求存为夹具（§4.5），做成 `record-replay` 离线回归。
6. 交回：评分表 + 单元/延迟记录 + 结论一句话（「Copy Makeup 达标 / 不达标，建议退到 X」）+
   **参数化 VTO 那一格的结论**（「参考图是否必需」这个问题必须有明确回答，见 §4.8）。

### 4.2 夹具集（红线：只用已授权照片；隐私规则见 4.6）

- 从 `vue/public/demo/` 的授权演示图起步；按红线 3，**必须覆盖 5 档肤色**（light / light_medium / medium / tan / deep，每档至少 1 张正面）——肤色覆盖不全，评分不算数。
- 至少另加：男女各 1、戴眼镜 1、侧光/弱光 1、抬头仰角 1（测对人脸宽容度）。
- 单张 ≥800px 宽、jpg/png。**参考妆照**用现有自绘样本（不引第三方参考图），每人脸 × 2 类参考（如 interview 通勤妆 / date 柔光妆）。

### 4.3 调用矩阵

| 用例 | 夹具 | 期望 |
| --- | --- | --- |
| happy path | 正脸×5 档肤色 × 参考妆 | 成功、像本人、自然、参考味对 |
| 妆色真实性 | deep/tan 两张 | 深肤色显色正确，不抹灰/不发灰（红线 3） |
| 无脸/脸太小/闭眼 | 造 3 张 | 报明确错误（不是乱画一张） |
| 参考妆脸型差异大 | 圆脸照 × 参考（深眼窝等） | 移植合理、不崩 |
| 遮挡 | 眼镜、口罩 | 不崩、不把遮挡当皮肤画 |
| 姿态 | 侧光/仰角 | 不崩，可接受降级 |
| 参考妆缺省 | 只传 face 不传参考 | 行为有定义（默认妆 or 明确报错） |
| 幂等/超时 | 同图 ×2 | 两次可复现程度、task 超时怎么收尾 |
| **参数化 VTO 对照**（§1.2 新增） | 正脸 × 5 档肤色 × **LLM 生成的 `effects[]`**，**不传参考图** | 与 Copy Makeup 同表评分；**归因更干净**——出问题不再分不清是「参考图没抓到妆」还是「引擎画得差」 |

### 4.4 质量评分表（每格 1–5，5=完美）

| 夹具 | 像本人(未换脸) | 妆自然(非糊层) | 部位贴合(唇/眼不错位) | 肤色正确 | 无伪影/水印 | 是否被 validator 拦 |
| --- | --- | --- | --- | --- | --- | --- |

> 同夹具至少评两次、隔天抽一张复评，减少主观漂移。

### 4.5 record/replay → 离线回归（让「dirty」只做一次）

- 挑 ~10 组真实请求，把「请求入参 → 厂商响应/成品图」原样存成 fixtures（如 `makeup/infrastructure/engine/__fixtures__/copy/`）。
- 写 **replay provider**（同一 `Engine` 端口），命中 fixture 就回放、不命中透出「未录」。
- CI 里跑 `vitest` = 零成本、零网络、零烧单元，回归「我们接法对不对」；厂商端变化留给每季度一次真实抽查。
- 实现顺序：先 `copy-engine`（真）→ 再 `replay-engine`（假）→ `compose.ts` 按 `config.makeupEngine` 分发；MockEngine 不动。

### 4.6 隐私与预算红线（接手人必须遵守，违例即停）

1. 只上传 4.2 的**授权夹具**，绝不拿测试者/路人/同事的脸去试（红线 4）。厂商侧跑完即删上传文件。
2. 真实在线 demo：现场即拍**不默认走云**（默认 mock/本地）；云的「wow 镜头」用授权图预录（红线 1 录播兜底）。
3. 免费单元用完就停，不擅自开通付费订阅；要加先问 owner。单元消耗在日志留痕。
4. key 只进本地 `.env`，`.gitignore` 兜住，不入库。

### 4.7 第 0 步（先做！）—— 网络可达性

在**预期 demo venue** 网络里先试通 Perfect Corp 端点。**这是本方案唯一硬风险**：
- 通 → 正常全矩阵测；
- 不通 → 两件事并行：① 结果照测，但 demo 用**预录 + mock**，不赌现场直连；② 若一定想要大陆云渲染，再去解决企业主体办美图，**别在本单内解决**。

### 4.8 验收口径（这单什么算过）

- Perfect Corp Copy Makeup 在 **5 档肤色 happy path 均分 ≥4**、像本人项 ≥4；全矩阵跑完、单元/延迟记录齐全、record/replay 回归绿。
- **参数化 VTO（§4.3 末行）不设达标线**——它是**对照实验**，要的只是一个明确结论：
  「不传参考图能否出可用的妆」（能 / 不能 / 能但明显更差）。**这个结论决定 `references` 的去留，比分数重要。**
- 不达标就如实写「不达标 + 建议」——**别为了好看挑图**，那是给 demo 埋雷。

---

## 5. 决策树（拍板时用）

> **⚠️ 本节作废（2026-09-12）**：整棵树的第一层入口就是「网络可达性(venue)实测通 且 参数化 VTO / Copy
> Makeup 5 档肤色达标」，厂商下线后这个入口不存在了。**保留结构供重开选型时改**——
> 形状（可达性 → 质量 → 兜底 → 自建分支）是对的，只需换掉树上的厂商名。

```
网络可达性(venue)实测通 且 参数化 VTO / Copy Makeup 5档肤色达标 ──► 定版(预录 demo + mock 兜底)
├─ ★ 参数化 VTO 也达标 ────────────────────────► 与 copy 同端口共存; 参考图退役
│                                               → references 降为可选(顺手消掉 §13-2 悬空项,§1.2)
├─ 质量达标但网络不稳 ───────────────────────────► 预录作 wow, mock 现场兜底
├─ 质量不达标 ─────────────────────────────────► 有企业主体? 是→美图复测; 否→自研分支① 或 简化 demo
├─ 想要生成式 wow(可选,**非必需**) ────────────► 只留 Qwen-Image-Edit(阿里云百炼)一个名额;
│                                              共用 §4.2 夹具 + §4.4 评分表; **不自建 GPU**(§3.1)
└─ 一切云都不可用 ──────────────────────────────► mock 为主 + 自研分支① 按剩余工期定
```

无论哪支：**mock 常驻可切、engine-output.validator 把关外部产物、5 档肤色必须全绿**——这三条是红线，任何厂商结论都不能绕过。

---

## 参考来源（2026-09 检索）

- Perfect Corp YouCam API 定价（¥0 免费档起步、个人可注册）：https://yce.perfectcorp.com/ai-api/api-pricing
- Perfect Corp Quick Start（async task、Bearer key、poll）：https://docs.perfectcorp.com/develop/quick_start_guide
- 开发者上手文（免费单元、Copy Makeup ≈2 单元、SD/HD 不混用）：https://zenn.dev/long910/articles/2026-05-30-youcam-api-investigation
- 幂简·美图奇想美妆 API（实为引导回官网注册，不能解企业门槛）：https://www.explinks.com/api/scd202406261370240e7153
- 阿里云云市场·美图官方店（无「美妆上妆」接口）：https://market4service.aliyun.com/store/1009501/list.html
- 美图 AI 开放平台·美妆技术（企业认证门槛实测）：http://ai.meitu.com/algorithm/faceTechnology/facecharacter
- 腾讯云人脸试妆（每月 1000 次免费、只唇色）：https://cloud.tencent.cn/document/product/1172/45850 · https://buy.cloud.tencent.com/price/fmu/overview
- 开源参考妆移植（PSGAN/EleGANt/DTMT）：https://github.com/Snowfallingplum/DTMT · https://github.com/PaddlePaddle/PaddleGAN
- ModiFace（欧莱雅旗下,license 形态）：https://modiface.com/products-makeup.html

### 2026-09-11 补充轮次的来源

- YouCam API 文档 v1.9（AI Makeup VTO 的 `category` / `palettes` / `texture` / `colorIntensity` schema）：https://yce.perfectcorp.com/document/index.html
- YouCam API 定价（三个妆效接口并列 + 单元数 / 张）：https://yce.perfectcorp.com/ja/ai-api/api-pricing
- YouCam API 实测文（自由单元、异步 task、MCP 集成 `@perfectcorp/youcam-mcp`）：https://zenn.dev/long910/articles/2026-05-30-youcam-api-investigation
- MAD 论文：https://arxiv.org/html/2504.02545 · 项目页：https://basiclab.github.io/MAD/
- Qwen-Image-Edit 2511 定价与供应商：https://lumenfall.ai/models/alibaba/qwen-image-edit-2511/providers
- 阿里云百炼模型定价（`qwen-image-edit-plus/-max`）：https://www.alibabacloud.com/help/en/model-studio/model-pricing
- 图像模型价目归一化对比（含 FLUX.1 Kontext pro/max）：https://invideo.io/blog/ai-image-model-pricing/
- Picsart 托管 Qwen 模型：https://docs.picsart.io/docs/ai-model-provider-qwen · 平台：https://picsart.com/api-platform
- Picsart API 计费（100 次/月免费档）：https://help.picsart.io/hc/en-us/articles/4411329452049-How-much-do-Picsart-Programmatic-Creative-APIs-cost
- InstantID 保身份 / 文字编辑能力的评测（F-Bench，Correspondence 偏低）：https://arxiv-org.ezproxy.obspm.fr/html/2412.13155v2
- CLIP vs ArcFace 编码器导致的 FaceID 保脸差异：https://eastondev.com/blog/zh/posts/ai/20260821-comfyui-face-identity-consistency/

### 2026-09-11 二次检索轮次的来源

- YouCam API 服务条款（不限制商用、素材存 1 天后删除）：https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api
- YouCam API 定价与 units / credits 的区别：https://yce.perfectcorp.com/ja/ai-api/api-pricing
- YouCam API 黑客松（1000 免费 units）：https://youcam-api.devpost.com/
- FLUX-Makeup（骨干为 Flux-Kontext.dev）：https://github.com/360CVGroup/FLUX-Makeup
- FLUX.1 Kontext [dev] 许可争议与 BFL 澄清：https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev/discussions/6
- BFL 非商用许可条款：https://bfl.ai/legal/non-commercial-license-terms
- Nunchaku / SVDQuant，Apache-2.0：https://huggingface.co/mit-han-lab/nunchaku/blob/main/README.md
- FireRed-Image-Edit-1.1，Apache 2.0，28.8B：https://quasa.io/media/firered-image-edit-1-1-revolutionizing-open-source-image-editing-with-unmatched-character-preservation
- 阿里云百炼免费额度与实名要求：https://help.aliyun.com/zh/model-studio/model-pricing
- ModelScope 免费推理额度：https://www.80aj.com/2026/01/24/modelscope-free-image-api/

**本轮未能核实（不得当作已知）**：

1. **MAD 的权重是否放出、仓库 license 是什么** —— 调研环境里 github.com / arxiv.org 被网络策略拦下，
   只见到论文页标 CC BY 4.0（那是**论文**的许可）。这一格没填上之前，MAD 只能是 ⭐⭐。
   **FLUX-Makeup 的仓库 LICENSE 原文同样没读到**，只确认了骨干是 Kontext dev。
2. 阿里云百炼对**人脸输入**的合规审核策略（现场真人自拍可能被拦）。
3. `@perfectcorp/youcam-mcp` 是否覆盖参数化 VTO 接口。
4. **ModelScope 免费额度的商业使用条款**——额度本身很宽（2000 次/天），但商用授权未明确，比赛中用要谨慎。
5. **Qwen-Image-Edit 的 4-bit 量化对上妆细节的影响**——见 `ai-engine-selfhost-review.md` §5.6。
