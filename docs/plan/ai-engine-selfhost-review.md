# 自建上妆引擎 · 可行性复核

> 对应 roadmap §6 与 §14 待拍板第 1 条，是 `ai-engine-api-spike.md` §3.1「生成式候选复核」的展开：那一节只给定级，本文给论据。
>
> 本文回答一个问题：把 SDXL / Diffusers / ControlNet / IP-Adapter FaceID / InstantID / 人脸分割这条**自建链**做成主引擎，值不值。
>
> 日期 2026-09-11。硬件数据为本机实测，价格与许可为当日检索，来源见文末。
>
> **2026-09-11 二次检索后修订 §5.6 / §5.7 / §5.8**：Qwen-Image-Edit 经 Nunchaku 4-bit 由「排除」改判为「可行」；BiSeNet 由「须逐个核权重」改判为 MIT；新增 FLUX-Makeup 排除案例。

---

## 0. 一句话结论

**不值得，不进主链路。** 三条理由，按硬度从高到低：

1. **架构是反的**。「锁身份」这一步在「编辑用户自己的照片」的前提下，要么是空操作，要么是漂移的来源。它是为 text-to-image 从零生成一个人设计的，本项目有原图。
2. **许可证撞红线**。整条链有两条腿踩在 InsightFace 的 non-commercial / research-only 上，而主办条款点名「参赛…**算法模型**…必须确保原创性」。
3. **这台机器跑不动**。RTX 5060 Laptop 8 GB 显存 / 15.2 GB 内存，整条链同时驻留超过 13 GB。

但结论不是「什么都别做」。**§5 是本路线的完整实施方案，可以直接照做**；§6 给了更省的云 API 替代；§7 说明为什么不需要它也能兑现叙事。

**二次检索后的一个重要变化**：本地路线不再只有 SD 1.5 那条稳但弱的选择。**Qwen-Image-Edit-2509 是 Apache 2.0，配 Nunchaku 的 INT4 推理能在 8 GB 上跑**，两个条件同时满足。它是否真能用，取决于 4-bit 下唇部细节保不保得住，见 §5.6 与 §5.8 阶段 5。

本文不改变 `ai-engine-api-spike.md` §1 的主选结论。Perfect Corp 的参数化接口与本文的自研链解决同一个「prompt 驱动」需求，而前者零安装、零显存、可控可断言——两者不是竞争关系。

> **⚠️ 2026-09-12 补正（此句已过期）**：Perfect Corp **已因成本被放弃**（见 `ai-engine-api-spike.md` §0）。
> 上一段那个「两者不是竞争关系」的判断**建立在「云端有一条便宜好用的替代」之上**，这个前提没了。
>
> **本文的排除结论本身不受影响**——§0 那三条理由（架构是反的 / 许可撞红线 / 本机跑不动）
> **一条都不是价钱**，逐条仍然成立。**但「不选它」的机会成本变了**：原先的对照是「自建要 3–5 天
> vs 云 API 半天」，现在云 API 那一侧**没有具体候选**，对照消失。
>
> 因此重开选型时，本文 **§6 那张「自建 vs 云 API」对比表的右侧一列不要直接引用**——
> 它列的正是本轮被否掉的那类东西（$0.03/张、免费额度）。做法：**先把云侧候选重新填实，再重跑这张表**。

---

## 1. 硬件实测

```
nvidia-smi → NVIDIA GeForce RTX 5060 Laptop GPU · 8151 MiB · 驱动 573.22
Win32_Processor → AMD Ryzen 9 7845HX
Win32_ComputerSystem → TotalPhysicalMemory 15.2 GB
```

此前口头判断曾假设这台机器没有 CUDA GPU。**该假设错误，已作废**，下面所有估算都以 8 GB 显存为前提重算。

整条链的显存账单，量级估算：

| 组件 | 驻留（fp16 量级） |
| --- | --- |
| SDXL base / inpaint checkpoint | ~7 GB |
| ControlNet SDXL 版 | ~2.5 GB |
| IP-Adapter | ~1 GB |
| InstantID | ~2.5 GB |
| InsightFace 人脸检测/识别 | ~0.5 GB |
| **合计** | **>13 GB** vs **8 GB 可用** |

要靠 `enable_model_cpu_offload()` 硬塞，而 15.2 GB 系统内存本来就要分给系统和浏览器。现实吞吐量级是每张 30–90 秒，笔记本还会热降频。

**这不是「跑不了」，是「没法反复试参数」。** 而这个项目的 wow 恰恰靠反复试。

RTX 50 系是 Blackwell（sm_120），对 PyTorch / CUDA 版本有下限要求，本轮未核实具体门槛。装环境前先确认，别用锁死的旧依赖。

---

## 2. 架构反驳：「锁身份」那一步是反的

该方案的承重结构是：

```
自拍 → 人脸分割定区域 → InstantID / IP-Adapter FaceID 锁定身份 → SDXL Inpainting → 妆后图
                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                          「这样不会变成另一个人」
```

**但本项目的操作是「对用户自己的照片做 inpainting」，而 inpainting 的定义就是 mask 外像素原样保留。**

- **mask 外**：那些像素根本不是生成出来的，是原始像素。ID embedding 对它不起作用。
- **mask 内**：ID embedding 把脸往它自己的平均脸拉。**这正是漂移的成因。**

> **你装的那个「防漂移」组件，正是漂移的来源。**

ID adapter 解决的是「手上没有这个人的照片，但想生成一张他/她的脸」。本项目有原图，这个需求不存在。

**正确做法是约束 mask，不是加 ID adapter。** 这条结论与用哪家模型无关，是流程性质决定的。

### 就算硬用，也两头堵

| 方案 | 身份保真 | 许可 |
| --- | --- | --- |
| 普通 IP-Adapter（CLIP 图像 embedding） | **弱**，抓得住气质与发色，丢具体面部身份 | Apache-2.0 ✅ |
| IP-Adapter **FaceID**（改用 InsightFace 人脸 embedding） | **强** | ❌ 不能商用 |
| **InstantID**（ArcFace） | 强，但文字驱动编辑能力弱，公开评测 Correspondence 项偏低 | ❌ checkpoint / face model 均 research-only |

**保得越准的那个，许可越脏。** 这不是巧合：保脸靠的就是人脸识别模型，而人脸识别模型是这条链里唯一有商用门槛的部分。「保真」与「干净」在这里是同一个轴的两端。

---

## 3. 许可证：与红线 §13-2 的正面冲突

### 3.1 逐条核实

- **InsightFace Model Zoo 原文**：「**ALL models are available for non-commercial research purposes only**」。`buffalo_l` 与 `antelopev2` 都在内。商用需另购 Open-Source Model Commercial License。
- **IP-Adapter**：代码 Apache-2.0，但维护者在 issue #188 明确说 FaceID 版本不能商用，因为它是用 insightface 训的。被该方案标为「强烈建议」的组件，正好是不能用的那个。
- **InstantID**：代码 Apache-2.0，但官方许可表把 Commercial Applications 一行标成 **code ✅ / face models ❌ / checkpoints ❌**。

该方案给出的许可表把 IP-Adapter 标 ✅、InstantID 标 ⚠️，**方向标反了**。两者的问题同源，而 IP-Adapter 的问题恰好落在它推荐的那个变体上。

**整条链的四条腿，有两条踩在同一个 NC 源头上。**

### 3.2 为什么这对本项目比「商不商用」更严重

主办条款原文，引文见 roadmap §13-2：

> 所有参赛代码、**算法模型**及方案必须确保原创性，不得侵犯第三方知识产权

**「算法模型」四个字是点名的。**

而这条红线你们已经为 `references` 踩过一次：上次是「抓来的图没有授权」，这次是「用的模型不能商用」。同一个条款，第二次。且这次更显眼——图是输入，**模型是方案本身**。

### 3.3 一条通行规则，建议写进每次选型

> **代码开源 ≠ 权重开源。**
> 接任何一个模型前，逐个人工核对 `LICENSE` 与模型卡。仓库根目录的 Apache-2.0 不覆盖它下回来的 `.pth` / `.onnx` / `.safetensors`。

这条规则能一次拦住上面三个坑。

---

## 4. 两个技术事实错误

### 4.1 人脸分割给不出腮红和眼影区域

`zllrunning/face-parsing.PyTorch`（BiSeNet）用的是 CelebAMask-HQ 的 19 类：

```
background · skin · l_brow · r_brow · l_eye · r_eye · eye_g · l_ear · r_ear
ear_r · nose · mouth · u_lip · l_lip · neck · neck_l · cloth · hair · hat
```

**没有 blush，没有 eyeshadow。**

所以方案里那句「Face parsing → ControlNet mask → 只改变妆容区域」：

- 对**唇 / 眉**成立。
- 对**腮红 / 眼影**从设计上就不覆盖。它们不是解剖结构，是皮肤上的软渐变，得自己从关键点构造几何。
- 对**底妆 / 高光 / 修容**，mask 无意义，本来就是整脸。

> **对照**：Perfect Corp 参数化接口那 13 个 `category`——`blush` / `eye_shadow` / `highlighter` / `contour` / `foundation` 等——就是这个 mask 列表。
> 打算花两周搭的东西，在别人接口里是一个**枚举值**。

### 4.2 SDXL base 不擅长 inpainting

diffusers issue #4392 实测：SDXL base 的 inpaint 结果「像另一张图贴上来」、mask 边界可见，**因为它从来没为 inpainting 训过**。

要跑必须换专用 checkpoint `stable-diffusion-xl-1.0-inpainting-0.1`，而社区普遍认为它不如 SD 1.5 那版 inpaint 稳。

再叠加这个用例的特殊难度：唇部是高频细节——唇纹、光泽、高光点——而美妆改的恰恰就是这种细节，mask 覆盖不足就抹平。修法包括 multi-scale mask、mask weight 0.7–0.9、CFG 5–8、hires fix、ADetailer 设 denoise 0.4–0.5，**每一条都是一天的调参轴，而且互相耦合**。

**美妆是 diffusion inpainting 最不划算的战场之一。**

---

## 5. 实施方案：ComfyUI + SD Inpainting + Color Guide + 分区 denoise

> 路线已收敛。三份独立分析在同一架构上撞车：ComfyUI + SD1.5→SDXL + 关键点构造 mask + color guide + prompt 只管质地。
> **不再继续找 Makeup 专用模型**，MAD / MagicMakeup / Stable-Makeup 等留作论文参考，不进代码路径。
>
> **⚠️ 2026-09-12 补正：MagicMakeup 的定级要改硬。** 它现在被写成「留作论文参考」，措辞不够——
> 它**不能进代码路径，理由不是「性能存疑」而是「许可不能用」**：MagicMakeup（ECCV 2026, arXiv 2607.20924）
> 的骨干是 **FLUX.1-Kontext-dev**，与 **FLUX-Makeup 同一个坑**。见 §5.6 排除表的同名行。
>
> **但它的论证要留下**：MagicMakeup 证明了「**像素级 mask 不足以约束注意力信息流**，
> 妆容线索会泄漏到 ROI 之外」。这条**打在本文 §5.3 的 mask 分工方案的前提上**——
> 「mask 画对了就只改妆容区」在扩散模型上比在传统 CV 上弱。若走 §5 路线，
> **验收必须加一格「mask 外的像素色相有没有漂」，不能只测 mask 内**。

### 5.1 核心分工：颜色归程序，质地归模型

```
LLM 决定「画什么」          → 部位 · 颜色 · 浓度 · 质地
   ↓
程序画出 mask + color guide → 颜色可视化、可断言
   ↓
扩散模型只负责「怎么画」     → 纹理 · 高光 · 边缘融合 · 光影
```

**不让 prompt 说颜色。** 这是整条路线的承重点：`prompt` 是自由文字，没有任何机制保证 deep 肤色的唇色不被漂白（红线 §13-3）。把颜色挪进 color guide 之后它是你指定的，于是可以断言——「mask 区域内平均色相与目标色的偏差 ≤ 阈值」能写成测试，而不是靠肉眼看。

### 5.2 数据契约：「画什么」

`Look` 需要长一个字段：

```json
{
  "style": "professional interview makeup",
  "skin":  { "finish": "natural matte" },
  "lip":   { "color": "#B76E79", "intensity": 0.7, "finish": "satin" },
  "eye":   { "shadow": "#8B6F47", "intensity": 0.3, "finish": "soft matte" },
  "blush": { "color": "#E8A0A0", "intensity": 0.2, "finish": "sheer" }
}
```

**`finish` 是现有 `Look{ style, palette, zones }` 里没有的东西**，而它恰恰是「像涂的 vs 像染的」的分水岭。这是本方案对现有领域类型的唯一必要扩展：加一个逐部位的质地枚举。

改动面按 roadmap §2「枚举只定义一处」的规矩走：`shared` 枚举 → zod schema → `MockEngine` → `narration` → 前端 chips → 测试。

### 5.3 mask：三个来源，缺一不可

| 部位 | 来源 | 说明 |
| --- | --- | --- |
| **唇 / 眉 / 眼** | 分割模型：BiSeNet，或 Segformer 版 `face-segmenter`，18 类含 `u_lip`/`l_lip`/`l_brow`/`l_eye` | 边界精确，关键点多边形做不到 |
| **腮红 / 眼影** | 关键点几何构造：mediapipe FaceLandmarker，468 点 | 没有任何分割模型有这两类，见 §4.1 |
| **底妆 / 高光** | 整脸 `face-skin` | mask 无意义，整脸低 denoise 过一遍 |

注意 mediapipe 的多类分割模型 `selfie_multiclass_256x256` 只有 6 类——`background` / `hair` / `body-skin` / `face-skin` / `clothes` / `others`，**不含眉毛、眼睛、嘴唇**。所以「用 mediapipe 出 mask」是错的：**mediapipe 给关键点，分割模型给唇/眉/眼，腮红眼影自己画，三个都要。**

### 5.4 分区 denoise：本方案最容易做错的一格

**低 denoise 保得住颜色，但看起来像染色；高 denoise 妆感真实，但色相会漂。** 这不是可以两全的取舍，是逐部位各取所需：

| 部位 | denoise | 为什么 |
| --- | --- | --- |
| **唇** | **0.55–0.70** | 结构性：唇纹、高光点、唇线边缘都要重画，这三样是「像涂的」的全部来源 |
| 眼影 | 0.45–0.60 | 介于两者之间 |
| 皮肤质感（底妆） | 0.40–0.55 | 要的是肤质，不是颜色 |
| 腮红 | 0.30–0.50 | 弥散性软渐变，重画反而假，保留原皮肤纹理 |
| 眉 | 0.30–0.45 | 主要是形状，颜色为辅 |

**让口红「像真的涂了」的是那个高光点，不是颜色本身。** 所以质地词比颜色词重要：

```
glossy · satin sheen · matte with soft highlight · dewy finish · sheer
```

更稳的做法是**两遍**：第一遍低 denoise 定色，第二遍只对唇部中 denoise 补高光与唇纹。慢一点，但比单遍调参可控得多。这也是 §5.1「颜色归程序」能成立的前提——第二遍若还靠 prompt 说颜色，前面就白做了。

### 5.5 接 ComfyUI

形状与 `Engine` 端口同构：

```
makeup/infrastructure/engine/
├── mock-engine.ts      # 现状，不动（红线：常驻可切）
├── copy-engine.ts      # Perfect Corp（云）
└── comfy-engine.ts     # 新增：打本地 ComfyUI，同一个端口
```

接线仍只在 `makeup/compose.ts`：`config.makeupEngine === 'comfy'` 返回本地实例，**业务层零改动**。

ComfyUI 侧：

```bash
python main.py --disable-auto-launch --lowvram      # 默认 8188
```

| 动作 | 端点 | 坑 |
| --- | --- | --- |
| 提交 | `POST /prompt`，body 为 `{prompt: <API格式图>, client_id: <uuid>}` | 必须是 API 格式，GUI 里 Save (API Format) 导出；GUI 图格式会被拒 |
| 轮询 | `GET /history/{prompt_id}` | 任务还在跑时返回 `{}`，不是报错，要按超时轮询，别当成失败 |
| 取图 | `GET /view?filename=&subfolder=&type=` | — |

三条要点：

- **workflow JSON 进版本库**：`makeup/infrastructure/engine/__workflows__/inpaint-makeup.api.json`。它是可 diff、可 review、可回滚的产物，配合 `ai-engine-api-spike.md` §4.5 的 record/replay，整条链可离线回归。这是本地路线比云 API 强的地方。
- **只绑 `127.0.0.1`**：ComfyUI 没有鉴权，绝不 `--listen 0.0.0.0`。
- **`--lowvram` 是 8 GB 上的关键开关**，显存宽裕再升 `--medvram`。

> **这会让 `docs/环境搭建-Windows版.md` 的「没有 Python，统统不用装」变成过期描述。**
> 该文档必须同步改，新增 Python + ComfyUI 一节，否则下一个照它装环境的人会卡住。这是采纳本方案唯一一处影响现有文档的代价，要一并认。

### 5.6 模型选型

**「许可干净」与「8 GB 跑得动」两个条件同时满足的，只有三个：**

| 模型 | 许可 | 8 GB | 编辑能力 | 定位 |
| --- | --- | --- | --- | --- |
| **SD 1.5 inpaint** | CreativeML Open RAIL-M，可商用，带使用限制 | **宽裕**，~4 GB | 弱，但真为 inpaint 训过 | **阶段一，先跑通** |
| **Qwen-Image-Edit-2509 + Nunchaku INT4** | **Apache 2.0** | **可行**，见 §5.7 | **最强** | **阶段二，本地 wow** |
| **SDXL inpaint** | CreativeML Open RAIL++-M，**可商用、无收入门槛** | 紧张，见 §5.7 | 中 | 备选 |

Qwen-Image-Edit 这一行是**本轮复核的修正**。前一轮把它判成「20B，只能离线批量」，漏掉了 Nunchaku 这条路：MIT HAN Lab 的 SVDQuant 把 4-bit 推理做到可用，权重压到 FP16 的约 25%，Qwen-Image-Edit-2509 的 transformer 从约 24 GB 降到约 6 GB，配合异步 offload 在 8 GB 上能跑。**Nunchaku 本身也是 Apache 2.0**，不引入新的许可负担。

代价是速度与细节。8 GB 上 offload 掉约 40% 速度，官方说法是相对 FP16 质量损失小于 5%。**但 4-bit 最容易丢的恰恰是高频细节**，而唇纹、高光点、唇线边缘正是「像涂的」的全部来源。这一格必须自己实测，官方指标替代不了。

**排除项及理由：**

| 对象 | 许可 | 排除原因 |
| --- | --- | --- |
| FLUX.1 **Kontext [dev]** | ❌ 非商用 | 量化不改变许可 |
| **FLUX-Makeup** | ❌ 骨干是 Kontext dev | 见下 |
| **MagicMakeup**（ECCV 2026） | ❌ **骨干同为 Kontext dev** | 2026-09-12 新增。中文报道称「开源全套推理代码」，但**骨干与 FLUX-Makeup 同一个坑**。SOTA 也不能改变骨干的许可 |
| FLUX.1 **schnell** | Apache 2.0 | 纯文生图，不做编辑 |
| **FireRed-Image-Edit-1.1** | Apache 2.0 | 28.8B，4-bit 也要 15 GB 以上，本地跑不动 |
| **MAD** | 未能核实 | 26 star，一年未更新，权重存疑 |
| **Civitai 妆容 LoRA** | 逐个可被创作者撤销 | 训练数据来源不可追溯 |
| ~~insightface~~ | ❌ NC | 全线禁用 |

**FLUX-Makeup 是本轮最值得记的案例。** 它是最对症的开源妆容迁移模型：SoTA、production-ready、自带 5 万样本的 HQMT 数据集、纯靠「源图 + 参考图」而不需要额外人脸控制模块。看起来是这条路的完美答案。

**但它的骨干是 Flux-Kontext.dev**，与 InsightFace 是同一个模式——效果最好的那个，许可最脏。FLUX 的 NC 条款对「输出」是否可商用本身还有争议：v1.1 删掉了允许商用输出的表述，BFL 事后称「不打算改变许可精神」并回退了争议条款，社区结论仍是不买商业授权就不能靠输出获利。

**判断一个自建方案能不能用，看骨干，不看包装。**

外部建议表曾把 SDXL 标成「可研究许可证」，**方向标反了**——它明确允许商用，比「只能研究」宽松。

辅助件：

| 组件 | 许可 | 作用 |
| --- | --- | --- |
| ComfyUI | GPL-3.0，自用不对外分发，无碍 | 推理运行时 |
| **Nunchaku / SVDQuant** | **Apache 2.0** | 4-bit 推理引擎，8 GB 上跑大模型的关键 |
| mediapipe FaceLandmarker | Apache-2.0 | 468 点，构造腮红/眼影 mask |
| BiSeNet / `face-parsing` | **MIT** | 唇/眉/眼精确边界 |
| ~~insightface~~ | ❌ **NC** | **全线禁用** |

BiSeNet 这一行也是修正：前一轮写「须逐个核权重」，实际查下来 `yakhyo/face-parsing`、`Mrkomiljon/face-parsing`、`zllrunning/face-parsing.PyTorch` 三家**都是 MIT**，比原先估计的干净。唯一保留意见是训练集 CelebAMask-HQ 本身带 NC 条款，但代码与权重均以 MIT 发布，这一格不再是障碍。

### 5.7 8 GB 的真实边界

SDXL q8_0 权重只占 ~4 GB，**但 VAE 解码还要 ~4.3 GB compute buffer**，实际要留 ~9 GB 空闲显存。8 GB 卡上这意味着必然 offload，速度掉一档。所以：

- SDXL 用 `--medvram --force-fp16`，Q8_0 近无损，**VAE 保持 f16 不要量化**，SDXL 的 VAE 对量化敏感。
- 1024×1024 是 SDXL 舒适区，别降到 512，脸会崩。爆显存上 `--lowvram`，或 `--cpu-vae`。
- **SD 1.5 毫无压力**，这正是从它起步的理由：先跑通管线，再换模型。

**Qwen-Image-Edit 走 Nunchaku 时的边界：**

- 用 `ComfyUI-nunchaku` 的 **INT4** 权重，配 `auto` offload。8 GB 卡会落到 offload 分支，官方给的阈值是 FLUX 14 GB、Qwen-Image 15 GB，低于这个数一律 offload。
- offload 打开后，8 GB 上拿到的不是「跑不动」，是「慢一档」。配合 4-step Lightning LoRA 把步数压下来，比堆分辨率划算得多。
- 分辨率压到 768 一级，别追 2048。要出高分辨率就先低分辨率生成再单独放大。
- VAE 解码用切片模式，这一格和 SDXL 一样是显存尖峰的来源。

**这条路唯一的真风险不是 OOM，是细节。** 4-bit 下唇部的高光点与唇纹保不保得住，决定了它能不能替代 SD 1.5 那条慢但稳的路线。先拿一张唇部特写验，别拿全身照验。

### 5.8 分阶段与止损线

| 阶段 | 产出 | 时间 |
| --- | --- | --- |
| 0 | ComfyUI 起得来，`curl /system_stats` 通，GUI 里手工跑通一张 inpaint | 半天 |
| 1 | `comfy-engine.ts` 打通 `POST /prompt → 轮询 → /view`，先喂硬编码 mask | 1 天 |
| 2 | mediapipe 关键点走 Node/WASM，构造腮红/眼影 mask；接分割模型出唇/眉/眼 | 1 天 |
| 3 | color guide + 分区 denoise 调参，5 档肤色各出一张 | 1–2 天 |
| 4 | 可选：换 SDXL | 半天 |
| 5 | 可选：换 Qwen-Image-Edit-2509 + Nunchaku INT4，先拿唇部特写验细节 | 半天 |
| 6 | 可选，默认关：视觉大模型读图 | 后置 |

阶段 5 是**验证性的一格，不是升级**：它要回答的唯一问题是「4-bit 下唇部高光点还在不在」。在就换，不在就退回阶段 3 的 SD 1.5，不必纠缠。

**止损线**：阶段 3 是调参无底洞，也是这条路唯一真会失控的地方。**定死：阶段 3 超过 2 天，或 5 档肤色里仍有 2 档不过，就停。** 停下来不是失败——`copy-engine` 那条云路线并行不受影响，两者在同一个端口后面，谁都还没绑死。

### 5.9 红线怎么守

1. **不用非商用权重**：避开 insightface 全线，FLUX Kontext dev 与挂在它上面的 FLUX-Makeup 一并排除。**看骨干，不看包装。**
2. **不引入 ID adapter**：mask 外保留原像素，身份天然保持。加它既不治纹理、又断商用路。
3. **`mock` 常驻可切**：ComfyUI 崩了 demo 不能崩。
4. **5 档肤色逐档验**，不过就是不过，别挑图。
5. **ComfyUI 只绑 `127.0.0.1`**，它没有鉴权。
6. **workflow JSON 进版本库**，别让「能跑的那版」只活在某个人的机器上。
7. **颜色必须可断言**：mask 区域平均色相与目标色的偏差要能量、能进测试。

---

## 6. 更省的替代：云生成式 API

如果目的只是预录镜头里的那一下「生成式 wow」：

| | 自建（§5） | 云 API |
| --- | --- | --- |
| 工期 | 3–5 天，见 §5.8 分阶段 | **半天** |
| 安装 | Python + PyTorch + CUDA + 权重 | **零** |
| 显存 | 4 GB 起，上 Qwen 要 8 GB 全占 | **0** |
| 单张成本 | 电费 | **≈$0.03–0.04**，或免费额度内为 0 |
| 现场风险 | 装环境失败 / 显存溢出 / 热降频 | 网络 |
| 可离线 | ✅ | ❌ |

- **Qwen-Image-Edit-2511**，20B，专为「保持这人、只改一处」设计，≈$0.03/张。
- **FLUX.1 Kontext [pro]**，flat $0.04/张。
- 走**阿里云百炼**的 `qwen-image-edit-plus`，国内直连，个人实名即可。**注册送 100 次免费调用**，90 天有效，且**只对输出计费**，生成失败不扣费。这个额度对一场 hackathon 演示是够的。
- ModelScope 另有一条更宽的路：每天 2000 次免费推理调用，单模型上限 500 次，需绑阿里云完成实名。**但它的商业使用条款未明确**，比赛中用要谨慎。

与主链路完全解耦：它只产出预录素材，不进 `Engine` 端口。若真要进，就按 `ai-engine-api-spike.md` §4.5 的 record/replay 把它固化成夹具。

百炼对**人脸输入**的合规审核策略本轮未核实，现场真人自拍可能被拦。接之前必须先测这一格——同该文 §4.7 的精神：可达性是第 0 步。

---

## 7. 不需要它来兑现叙事

该方案建议的展示话术已采纳：**「AI 理解用户身份 → 理解场景 → 控制妆容区域 → 生成个性化试妆效果」**。

更好的一句是下面这个，职责切得更干净，直接点题「美妆科技」而不是「我们调了个 API」：

> **AI 负责理解人和场景，扩散模型负责把专业化妆方案「无损」应用到用户脸上。**

「**无损**」两个字是关键，它同时解释了为什么要 mask：不损伤原图。对应到 §5 的分工，就是 **LLM 决定画什么（可断言），扩散模型决定怎么画（质感）**。

**本项目现在的架构已经在讲这句话，而且是真的：**

```
brief（场合 + 肤质 + 肤色 + 自由文字 + 天气）
   → describeScene(brief)          ← shared/domain/scene-rules.ts，前后端同一份
   → Look{ style, palette, zones } ← zones 就是「控制妆容区域」
   → Engine.generate()
```

**`zones` 那一步不需要 SDXL 来兑现。**

而且生成式路线会**削弱**这句话最硬的那部分：prompt 是自由文字，没人能保证 deep 肤色的唇色不被漂白，而红线 §13-3 要求「5 档肤色必须全绿，不默认浅肤色审美」。**等于把红线过不过交给一个无法断言的东西。**

参数化那边是 `color: "#8B4513", colorIntensity: 72`——可断言、可写测试、可进 CI。

### 三条路的横向对比

| | 自建 SD1.5 inpaint | 云生成式 API | 参数化接口 |
| --- | --- | --- | --- |
| 出处 | §5 | §6 | `api-spike` §1.2 |
| 工期 | ~1 天起，调参无底 | 半天 | 半天，同一个账号 |
| 显存 / 安装 | 4 GB · 重 | 0 · 零 | 0 · 零 |
| 输出可控性 | 中：mask 可控、颜色不可控 | 低 | **高：hex + 0–100** |
| 红线 §13-3 风险 | **高** | **高** | **低，可断言** |
| 保脸 | 天然，mask 外保留 | 取决于模型 | 天然 |
| 许可 | 干净，但须避开 InsightFace | 厂商条款 | 厂商条款 |
| 单张 | 秒级 | $0.03–0.04 | **1 unit** |

> **⚠️ 2026-09-12：上表第三列已作废。** 「参数化接口」= Perfect Corp，该厂商已因成本被放弃。
> 第二列「云生成式 API」的价格是同类云端的一般量级，**不是某个已选定候选的报价**，不要当报价引用。
>
> **上表里唯一经得起本轮变更的一列是第一列（自建 SD1.5 inpaint）**——它的每一格（工期、显存、
> 可控性、许可）都是自己算出来的，不依赖任何厂商。**这一点在重开选型时反而是它的加分项**：
> 当云侧候选不明时，「不依赖第三方」第一次成了真实的优点，而非只是叙事。
> 但**别因此翻案**——§0 那三条排除理由仍然成立，见文首补正。

---

## 8. 若仍要走自建：不可让步的红线

1. **不用任何非商用许可的权重**。凡「代码开源」就当「权重未必开源」处理，逐个人工核对；**顺手往上追一层骨干**，FLUX-Makeup 就栽在这里。
2. **不引入 ID adapter**。凡出现 FaceID / InstantID / 类似组件，先问「这个需求在本流程里存在吗」。
3. **自建链不进 `Engine` 端口的默认分支**。它至多是预录素材的生产工具，`MockEngine` 常驻可切不动。
4. **5 档肤色逐档验**。任何生成式路线在深肤色上不过关就是不过关，别挑图。
5. **别让它拖垮主链路工期**。本项目的 wow 只需要一个镜头，而 `api-spike` §4.7 已经把网络可达性列为唯一硬风险——**不要同时开两个硬风险**。

---

## 参考来源（2026-09-11 检索）

**第一轮**

- InsightFace Model Zoo 非商用原文：https://github.com/deepinsight/insightface/blob/master/model_zoo/README.md
- InsightFace 商用授权：https://www.insightface.ai/solutions/face-recognition-licensing
- IP-Adapter 许可与 FaceID 商用问题，issue #188：https://github.com/tencent-ailab/IP-Adapter/issues/188
- InstantID 许可分层 code / face models / checkpoints：https://deepwiki.com/instantX-research/InstantID/1.3-license
- IP-Adapter-FaceID 身份保真评测 F-Bench：https://arxiv-org.ezproxy.obspm.fr/html/2412.13155v2
- CLIP vs ArcFace 编码器导致的保脸差异：https://eastondev.com/blog/zh/posts/ai/20260821-comfyui-face-identity-consistency/
- CelebAMask-HQ 19 类，无 blush / eyeshadow：https://huggingface.co/litert-community/BiSeNet-Face-Parsing-LiteRT
- SDXL base 的 inpainting 质量问题，diffusers issue #4392：https://github.com/huggingface/diffusers/issues/4392
- SDXL 许可 CreativeML Open RAIL++-M：https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md

**第二轮（2026-09-11 二次检索）**

- FLUX-Makeup，骨干为 Flux-Kontext.dev：https://github.com/360CVGroup/FLUX-Makeup
- FLUX.1 Kontext [dev] 许可争议与 BFL 澄清：https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev/discussions/6
- BFL 非商用许可条款：https://bfl.ai/legal/non-commercial-license-terms
- Nunchaku / SVDQuant，Apache-2.0：https://huggingface.co/mit-han-lab/nunchaku/blob/main/README.md
- ComfyUI-nunchaku 关键特性与 8 GB offload 阈值：https://deepwiki.com/nunchaku-ai/ComfyUI-nunchaku/1.4-key-features
- Qwen-Image-Edit-2509 在 8 GB 上的量化实践：https://www.aitierlist.com/t/image-editing-with-qwen-image-edit-on-8gb-vram/15
- yakhyo/face-parsing，MIT：https://github.com/yakhyo/face-parsing
- Mrkomiljon/face-parsing，MIT，多骨干：https://github.com/Mrkomiljon/face-parsing
- Civitai 授权选项说明：https://education.civitai.com/guide-to-licensing-options-on-civitai/
- FireRed-Image-Edit-1.1，Apache 2.0，28.8B：https://quasa.io/media/firered-image-edit-1-1-revolutionizing-open-source-image-editing-with-unmatched-character-preservation
- 阿里云百炼模型定价：https://help.aliyun.com/zh/model-studio/model-pricing
- YouCam API 服务条款：https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api
- YouCam API 定价与 units：https://yce.perfectcorp.com/ja/ai-api/api-pricing
- ModelScope 免费图像 API 额度：https://www.80aj.com/2026/01/24/modelscope-free-image-api/

**本轮未能核实，不得当作已知**：

1. **Qwen-Image-Edit 4-bit 对上妆细节的影响**——唇纹、高光点、唇线边缘能否保住。这是阶段 5 唯一的验证目标，也是这条路能否成立的关键。
2. **FLUX-Makeup 仓库自身的 LICENSE 文件内容**——检索环境里 github.com 被网络策略拦下，只确认了它的骨干是 Kontext dev，未直接读到仓库许可原文。
3. **SegFace（AAAI 25）的许可**——论文与代码均未标注，暂不当作可用。
4. **阿里云百炼对「人脸输入」的合规审核策略**，现场真人自拍可能被拦。
5. §1 的显存账单是量级估算，非本机实测。真要动手，第一步就是实测峰值显存。
