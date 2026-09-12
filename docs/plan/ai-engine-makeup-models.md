# 上妆引擎 · 重开选型调研记录（2026-09-12）

> 起因：`ai-engine-api-spike.md` 的主选 Perfect Corp 于 2026-09-12 被 owner 以**成本**为由放弃，
> 选型重新打开。本文汇总那次重开后的四路平行调研**目前已知的一切**。
>
> **本文是记录，不是拍板。** 没有主选，没有推荐，只有「现在知道什么」与「还不知道什么」。
>
> **状态：调研被主动中止（2026-09-12）。** 四路里三路回了，第四路（GitHub 开源项目全盘点）
> 中途停止，见 §7 未完成项。**本文不能当作调研已完成来读。**
>
> **2026-09-12 补充：中止之后做了一次「打捞」**——第四路及其下级的对话转写还在磁盘上，
> 派代理把里面的结论回收了一遍。**回收结果写进 §2.4、§3.6、§6.1、§6.4**，
> 证据原件曾留在 `_evidence/`，**2026-09-12 已从版本库移除**——本节的结论不依赖那些文件，
> 原件均可从各自仓库重新取得。
> 这次打捞**显著改变了本轮的结论**：许可那一格从「一条原文都没读到」变成
> **8 个项目的 LICENSE 正文 + 几个模型卡**，并且捞出了**两个此前完全没出现的候选项**。

---

## 0. 先读这一节：本文的证据强度比前几份文档弱

**这是本文最重要的免责声明，不是客套。**

本轮调研环境里 **WebFetch 被全域拦截**——不只是 github.com，CSDN、HuggingFace、Civitai、
fal.ai、zenn.dev、yce.perfectcorp.com、连 en.wikipedia.org 都返回
「Unable to verify if domain is safe to fetch」。**这是工具侧的安全策略，与大陆网络可达性无关**，
别把它读成「这些站点在国内连不上」。

后果是**四路里有两路的所有结论都来自搜索摘要的二次转述**，没有一条读到原文。
第三路（学术）环境里 arxiv.org 与 CVF 可达，**它的许可是从 PDF 原文读到的**，证据等级高一档。

本文用三个标记，请务必按标记读：

| 标记 | 含义 |
| --- | --- |
| `[一手]` | 调研员直接读了原文（论文 PDF / 仓库文件 / 许可证文本） |
| `[检索级]` | 只在 WebSearch 摘要里见过，**摘要本身还是搜索侧模型对页面的再转述** |
| `[未核实]` | 关键格没填上，**不得当作已知** |

> **`[检索级]` 在这次里出过一次实锤事故**：首轮检索摘要声称 arXiv 2607.21118 是妆容迁移论文，
> 还引了一段像模像样的摘要。抓原文后发现那是
> **《The Second LoViF 2026 Challenge on Real-World All-in-One Image Restoration》**，
> 跟妆容迁移毫无关系。**摘要会编。** 别把任何 `[检索级]` 的结论写进方案。

---

## 1. 一句话现状

**要「hex + 强度 → 妆后脸」这个形状的方案，目前能找到的只有两类半：**

1. **参数化渲染**（关键点 + 局部色彩变换）——真的存在、许可干净、不需要 GPU，但成品质量天花板低，
   且仓库普遍老旧；
   > 🆕 **打捞后这一类有了具体落点**：**`OpenMakeupSDK`（§2.4a）已经在本仓库的 `tespro/` 里**，
   > MIT、零显存、API 形状与 `Look{palette, finish}` 同构。**它是这一类的第一个可执行样本。**
   > 另有 **PSGAN（§2.4b）**——唯一「代码+权重双干净」的参考妆迁移，但有 dlib 的 Windows 编译门槛。
2. **商业 API**——唯一被实测确认能在免费额度内出妆的是 Perfect Corp 的参数化 VTO，而该厂商刚被放弃；
3. **半类**：学术侧的 DreamMakeup 形状完全对得上，**但没放代码**。

**而 2026 年的学术界 SOTA 清一色是「给一张参考妆照 → 妆后脸」**——这个形状对本项目是**错的**，
因为参考图驱动意味着**妆色不可断言**，撞红线 §13-3。

---

## 2. 候选一：参数化渲染（非扩散）

**这是本轮唯一「许可干净 + 不需要 GPU + 参数可断言」三者同时满足的一类。**
来源见 `ai-engine-selfhost-review.md` §7 第三列——那一列原先指的是 Perfect Corp，现在厂商没了，
**这一类是那个位置的真正替补**。

### 2.1 开源实现 `[检索级]`

| 项目 | 方法 | 许可 | 状态 |
| --- | --- | --- | --- |
| `srivatsan-ramesh/Virtual-Makeup` | Dlib 68 点 + OpenCV，唇/腮红/指甲 | **MIT** | ~136 star，**6–7 年未更新** |
| `badarsh2/Virtual-Makeup` | **LAB 色彩空间**；眼影用眼睑+眉轮廓点构造区域；粉底用椭圆+肤色 mask 避开头发 | `[未核实]` | 前者续作，19 forks |
| `Jayanths9/Virtual_Makeup` | MediaPipe **478 点**，唇/眉/眼线/眼影，alpha 混合，支持视频 | `[未核实]` | ~50 star |
| **`carlmagumpara/Virtual-Makeup`** | MediaPipe 468 点 + **FastAPI**（`/apply-makeup`），**含腮红** | `[未核实]` | **形态最贴 `Engine` 端口** |
| `ToneMatch`（maham-creates） | MediaPipe Face Mesh + Canvas，**纯前端**，含唇/腮红/眼影 + 肤色检测 | `[未核实]` | 2026-02 有提交 |
| `@glamario/core-web` | Web SDK，`applyBySku()` 实时试妆 | **MIT** | 本轮唯一明确读到 MIT 的实时 SDK |
| `puhach/virtual-makeup` | C++17 + OpenCV + Dlib 68 点，口红 + 瞳色 | `[未核实]` | — |
| `vipstone/faceai` | 综合库，Dlib + 色彩空间转换 + alpha 混合 | `[未核实]` | — |

> ⚠️ **上面所有许可都是 `[检索级]`**，包括标 MIT 的——**没有一个 LICENSE 文件被读到过**。
> 按本项目「看骨干不看包装」的规矩，**这些要先人工核 LICENSE 原文才能进代码路径**。

**风险如实说**：这些仓库普遍老旧（6–7 年未更新）、star 数不高、**没有质量评测、没有 5 档肤色验证**。
**抄它的方法和参数，别指望抄它的成品质量。**

### 2.2 学术侧的参数化（比上面那批更成熟）`[一手]`

| 工作 | 出处 | 关键点 |
| --- | --- | --- |
| **Deep Graphics Encoder for Real-Time Video Makeup Synthesis from Example** | arXiv 2105.06407 | **逆图形学**：把参考妆映射到渲染引擎参数空间——不透明度、RGB、**gloss、gloss roughness、反射强度**。基于 3D 唇网格。**移动端实时**（Pixel 4 / Galaxy S7 实测）。论文称在极端妆容上优于 BeautyGAN / CA-GAN，且无时序不一致 |
| **LipAT** | WACV 2024 | PBR 物理渲染 + 神经风格迁移，按口红的 **color + finish type** 做可控模拟 |
| **Makeup Interpolation Based on Color and Shape Parametrization** | MDPI | B 样条参数化形状 + 前景颜色查找表参数化颜色，可连续插值 |
| **专利 CN113344836A** | 中国专利 | **YUV 空间分离亮度与色彩**；**针对雾面/哑光/缎面/润泽/亮泽不同质地，用「亮泽质地效果强度系数」计算亮度调整量** |

> **这几条对本项目的意义**：`ai-engine-selfhost-review.md` §5.2 提出要给 `Look` 加一个逐部位
> **`finish` 质地字段**，理由是「finish 是『像涂的 vs 像染的』的分水岭」。
> **上面四份工作都是把 `finish` 显式建模的**——尤其那份专利：雾面/缎面/亮泽的处理
> **是「调亮度」，不是重绘**。这为 `finish` 字段提供了一个不依赖扩散模型的实现路径。

### 2.3 可直接抄的工程参数 `[检索级]`

- **腮红关键点索引**（MediaPipe 468 点）：
  `right_cheek = [330,350,411,376,352,345,264]`、`left_cheek = [101,129,187,147,123,116,34]`，
  然后 `cv2.GaussianBlur(mask,(51,15),0)*0.8` + `erode` 收边。
- **眼影**：左眼轮廓点集 `[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]` 及镜像。
- **唇色传统先验**：YIQ 空间 Y∈[80,220] / I∈[12,78] / Q∈[7,25]；RGB 判据
  `logG(B^0.391·R^0.609) < −0.15`；上色在 **YUV** 里做（先算 Y 再套口红的 UV）。
- **口红 mask 要往内收**：正 padding 会糊到人中/下巴。

### 2.4 🆕 打捞捞到的两个真候选（2026-09-12）

> 这两个**在四路调研里一次都没出现过**，是事后从被中断的代理转写里回收的。
> 它们是本轮**唯二「许可干净且现在就能跑」**的东西。

#### (a) OpenMakeupSDK —— 零显存，而且**你们已经在跑了**

**先说一件事实**：这份代码**已经在本仓库里** —— `D:\olyhks\tespro\`（已被 `.gitignore` 覆盖）。
`node_modules` 装好了，创建于 2026-09-12 上午。**所以下面说的不是「可以试试」，是「已经在那儿了」。**

| 项 | 值 |
| --- | --- |
| 仓库 / 包名 | `ehsanwwe/OpenMakeupSDK`，npm `open-makeup-sdk` |
| 许可 | **MIT**（`Copyright (c) 2026 Ehsan Moradi`）`[读到原文·本地文件]` |
| 依赖链 | Three.js（**MIT**）+ `@mediapipe/face_mesh`（**Apache-2.0，模型卡正文已核**） |
| 显存 | **零** —— 纯浏览器 WebGL |
| 成熟度 | v0.1.0，建仓 2026-06-02，**0 star** |

**为什么它是本轮最重要的发现——它的 API 形状与你们的领域类型同构：**

```js
mk.apply('lipstick', { color: '#b4002e', finish: 'glossy' })
```

`src/categories.js` 里 **6 大类**（`foundation` / `blush` / `lipstick` / `eyeliner` / `mascara` / `eyeshadow`）、
**4 种 finish**（`matte` / `shimmer` / `glossy` / `glitter`）。

对照 `ai-engine-selfhost-review.md` §5.2 那条「`Look` 需要长一个逐部位 **`finish`** 字段」——
**这个东西已经有 `finish` 了，而且已经分了四种。**

**更关键的是它内置了 AI 钩子**：`src/categories.js` 里有个常量 **`AI_SENTINEL = 'ai'`**，
注释原文：

> *"Sentinel meaning resolve this color from the AI color provider at apply time"*

**即官方预留了外挂 AI 配色器的位置。** 你们的 `brief → describeScene → Look{palette}` 那条链
可以直接接进这个钩子——**LLM 出颜色方案，SDK 负责渲染，中间零转换。**

**它同时绕开了三道红线**：不依赖任何非商用权重（§6.1）、**用户自拍不上传**（红线 §13-4）、
零 API 费用。**这是本轮唯一一个能同时说这三句话的方案。**

> ⚠️ **三个保留意见，都不小：**
> 1. **只支持 `<video>`(webcam) 与 `<canvas>`，没有静态照片输入。** 而你们的产品语义是
>    「上传本人正面照」——**这是形状上的硬缺口，需要自己补一层「照片 → canvas」**。
> 2. **画质是 AR 滤镜级，不是生成式真实感。** 它达不到 `api-spike.md` §1 说的
>    「wow = 上妆像本人、且自然」里「自然」那个标准。
> 3. **`assets/patterns/` 下 73 张 pattern PNG（文件名形如 `6413.png` / `10246.png`）与
>    `assets/models/face.glb` 及两个 Blender 绑定文件的来源未声明**——
>    代理判断「看起来来自商业图案库」。**撞红线 §13-2（不得侵犯第三方知识产权），必须问作者或自行替换。**

#### (b) PSGAN —— 唯一「代码 + 权重双干净」的参考妆迁移

| 项 | 值 |
| --- | --- |
| 仓库 | `github.com/wtjiang98/PSGAN` |
| 许可 | **MIT**，`[读到原文·父代理实测]`：`LICENSE` 首行 `MIT License / Copyright (c) 2020 Wentao Jiang`，且**对 README 全文 grep `licen\|commercial\|research purpose` 零命中** |
| 骨干 | **自研 GAN，无任何第三方预训练骨干** —— 这是它干净的根本原因 |
| 规模 | ~12.6M 参数、256×256 → 8GB 绰绰有余（`[推测]`，未实测） |
| 状态 | 780★，push 2024-03-13，未归档 |
| **权重可下载性** | ✅ **实测过**：`G.pth` 22,608,943 B + `faceutils/mask/resnet.pth` 20,806,705 B，**走 ghproxy 而非 Google Drive** |

> **最后一行在大陆网络下是决定性的**：GAN 时代那批仓库的权重**几乎全挂 Google Drive**，
> PSGAN 是少数能直接拉到的。

**⚠️ 三个已知地雷（都是代理实测/读到的，不是推测）：**

1. **dlib 在 Windows 上没有预编译 wheel。** 实测 PyPI：`19.24.2` 至 `20.0.1` 全部
   **`win_amd64 wheels: []`，只有 sdist** → 装 dlib 要 **CMake + Visual Studio 现场编译**。
   **这是 PSGAN 在本机最大的实际拦路石**，也正是代理被杀时在查的那件事。
2. **`faceutils/faceplusplus.py` 里硬编码了 Face++ 的 API key / secret。**
   该文件不在默认推理路径上（`faceutils/__init__.py` 会 import 它，但它不依赖外部包，不会 ImportError），
   **但涉及「用户自拍不得上传第三方」红线，必须审计并删除。**
3. **2020 年的代码。** 代理原本担心 `torch.ByteStorage` 被移除会让 `preprocess.py` 报错，
   **本地实测推翻了**：torch 2.9.1 里 `hasattr(torch,'ByteStorage') == True`。

**顺带证伪一条传闻**：此前流传「PSGAN 的 README 里有 non-commercial 字样」。
代理只验证了 `wtjiang98/PSGAN`（无此字样），**但它从未检查传闻出处指向的另一个路径
`wq2012/PSGAN` 是否真的存在**——这是首位推荐上唯一的残留不确定性。

**佐证**：`aigc-apps/sd-webui-EasyPhoto` 的 `easyphoto_infer.py` 第 800 行原注释
`# psgan for transfer makeup`，用的是 `makeup_transfer.pth` ——
**一个宽松许可的项目把 PSGAN 当作可用件**，间接印证它的许可状况。

#### (c) 同批捞到的其他许可干净项（备查）

| 项目 | 许可 | 状态 / 卡点 |
| --- | --- | --- |
| `makeuptransfer/SCGAN`（CVPR 2021） | MIT | 133★，2022-01。**权重在 Google Drive** |
| `VinAIResearch/CPM` | **BSD-3-Clause** | 418★，2024-11。权重也在 Google Drive |
| `wtjiang98/BeautyGAN_pytorch` | MIT | 229★，2019。**老** |
| `AnonymScholar/SpMT` | MIT | 36★。**权重可获取性未核实**（README 无直链） |
| `PaddlePaddle/PaddleGAN` | **Apache-2.0** | 8047★，内含 PSGAN 等 |
| `ZHKKKe/MODNet` | **Apache-2.0，README 显式覆盖权重** | 罕见的正例；但训练数据链未核实 |
| `BiRefNet` / `BiRefNet-portrait` | **MIT 三层一致**（代码+LICENSE+HF 卡） | README 原文：1024×1024 推理需 **5.5GB 显存** → 8GB 可行。**被 IC-Light 官方 README 点名为商用替代品** |

---

## 3. 候选二：扩散 + mask inpainting（自建）

这一类的完整实施方案见 `ai-engine-selfhost-review.md` §5，**本文只记本轮新增的三件事**。

### 3.1 ⚠️ 一条打在方案前提上的反面证据 `[一手，来自论文摘要页]`

**MagicMakeup**（vivo 蓝影实验室 × 浙大，ECCV 2026，arXiv 2607.20924）论证：

> **像素级 mask 不足以可靠约束基于注意力的信息流**——像素 mask 与 token 交互不对齐，
> 会让参考图的妆容线索**泄漏到 ROI 之外**。

它的解法 TARG 是把像素 ROI mask 映射到模型的 token 网格，在 attention 里做区域 logit 门控。

**对 §5.3 的影响**：该节整套 mask 分工（分割模型给唇/眉/眼、关键点几何构造腮红/眼影）的**前提是
「mask 画对了就只改妆容区」**。**在扩散模型上这个前提比在传统 CV 上弱——mask 画对了，信息仍会漏。**

**行动**：若走自建路线，**验收必须加一格「mask 外的像素色相有没有漂」**，不能只测 mask 内。

> ⚠️ **但 MagicMakeup 本身不能用**：它的骨干是 **FLUX.1-Kontext-dev**，与 FLUX-Makeup 同一个坑。
> **只能引它的论证，不能引它的代码。** 见 §6.1。

### 3.2 「低 denoise 染色 vs 高 denoise 漂色」被软化 `[检索级]`

`selfhost-review.md` §5.4 断言这两者**不可两全**。现实里有人找到了**第三条轴**：

**Differential Diffusion / Soft Inpainting**——**ComfyUI 内置节点**
（`comfy_extras/nodes_differential_diffusion.py`，源码注明改编自 exx8/differential-diffusion，
搜索别名 "inpaint gradient"）。机制：把 mask 当 **0–1 连续值**，mask 值即该像素的 denoise 强度，
且**时间依赖**——采样初期只有 mask 最暗处参与去噪，随步数推进阈值下移，
**边界像素比中心晚开始去噪，于是自己融进去，不出现硬缝**。

对应到上妆：唇心给高值（重画唇纹、高光点）、唇线边缘给低值（保原唇形）；
腮红中心低值（保皮肤纹理）、外缘渐到 0（自然消散，不出圆盘边）。
**一片 mask 内逐部位不同强度**，而不是「唇 0.6 / 腮红 0.3」一刀切。

配套：
- **Gaussian Blur Mask**（kernel 控范围、sigma 控软度）把二值 mask 变梯度；
- **Denoise to Compositing Mask**（Acly 包）——denoise mask 是 0–1 全量程，直接做 alpha 合成会毁效果，
  这个节点用 `offset`(默认 0.1) / `threshold`(默认 0.2) 重映射，官方称是「Differential Diffusion 缺失的那一环」；
- **限制**：平滑度依赖采样步数，**少步采样器（如 LCM）上效果不好**（GitHub issue #2671）。

**结论要改的措辞**：§5.4 的「不可两全」应改成「**有第三条轴，但需要逐像素 mask**」。

### 3.3 现成的抗色漂做法：`Color Match (Masked)` `[检索级]`

Acly 的 **ComfyUI Inpaint Nodes** 里有三个直接相关的节点：

- **Fill Masked**：`neutral` 填灰（适合凭空加新内容）/ `telea` / `navier-stokes` 从边界取色填；
- **Blur Masked**：「mask 边界处更弱，**适合保持整体颜色**」——最朴素的 color guide；
- **Color Match (Masked)**：**后处理**节点，拿原图当 reference、denoise 输出当 target，
  **用排除 mask 只统计 mask 外的变化**，再对整图做色彩校正。文档明说能缓解 inpainting 的色/亮度漂移。

**还有两个坑**：
- `img2img_color_correction` 在 inpainting 场景下**会造成严重色彩渗出**，要显式关掉；
- mask 颜色约定喂错会**把保护区和目标区对调**：SD repaint → `mask_black`；SDXL repaint → `mask_white`；
  Flux repaint → `Alimama`；Qwen-Image repaint → `Alimama`。

### 3.4 denoise 参数：**没有任何单一来源可信** `[检索级]`

拿到的建议值互相打架（微调 0.2–0.5 / 通用 0.6–0.8 / Flux 需 0.85+ / ADetailer 面部 0.4 /
A1111 防渗色 0.45–0.6）。**没有一份是可复现的实测数据。**

唯二具体到部位的经验（单一来源，作者自述）：
- PixAI「Two Tone Lipstick/Eyeshadow Inpainting」LoRA 作者：Pony 系**即使 denoise 低到 0.05
  也会慢慢把双色唇膏揉成一个色**，他的 LoRA 把可用上限从 0.05 抬到 0.4；
  且**撞色比邻近色好**（邻近色几乎必然揉成一团）、**薄唇用 Euler A 会串色，DPM++ 2M/3M SDE 更稳**、
  低 denoise 跑得快所以**分几次小幅迭代**优于一次大改。
- **承接本项目一贯做法：把参数当假设，用夹具 + 评分表去证伪。别采信任何单一来源。**

### 3.5 现成 ComfyUI 工作流 `[检索级]`

| 工作流 | 形态 | 许可 / 坑 |
| --- | --- | --- |
| `ComfyUI_Stable_Makeup`（smthemex） | 5 节点，Manager 一键装，原图+参考图 → 出图 | pyproject 只写 `license = {file = "LICENSE"}`，**没读到是哪个协议**；**依赖 insightface** ❌ |
| `ComfyUI-Portrait-Maker`（THtianhao） | `PM_MakeUpTransfer`（PSGAN 系）/ `PM_SuperMakeUpTransfer` | `[未核实]`。**坑**：`avatar_box` 标 optional 但代码当必填读，不接 `PM_RetinaFace` 会 TypeError |
| FLUX-Makeup 官方 `flux_makeup.json` | 源图 + 参考图 | ❌ 骨干 Kontext dev |
| RunningHub「妆容迁移」457627 | 网页版，核心节点 StableMakeup | 平台托管，无 JSON |

> **净判断**：想抄现成 JSON，最容易上手的是 `ComfyUI_Stable_Makeup`，但它**踩在 insightface 上**，
> 与红线 §13-2 正面冲突，且要额外下三个来源不明的权重。
> **能抄的「形状」值得抄，能抄的「依赖」不能抄。**

### 3.6 🆕 ComfyUI 生态已经量过了：**这条路是死的** `[实测]`

打捞得到两份硬数据，它们把「去 ComfyUI 生态捡现成的」这个念头**一次问死**——
**不是没找到，是数过了。**

**(a) 全量注册表只有 3 个上妆节点包。** 拿 ComfyUI-Manager 注册表快照
（2026-09-12 全量快照，**5934** 个自定义节点；快照文件已从版本库移除）逐条筛，
上妆语义的只有：

| 节点包 | 插件许可 | 底座 | 能用? |
| --- | --- | --- | --- |
| `ComfyUI_Stable_Makeup`（smthemex） | 未读到（pyproject 只写 `license = {file = "LICENSE"}`） | 检测器 = InsightFace RetinaFace | ❌ NC |
| `ComfyUI_CSD_MT`（smthemex） | **MIT** | 底座权重 **CC BY-NC-SA** | ❌ NC |
| `ComfyUI-Portrait-Maker`（THtianhao） | `LICENSE.txt` = **Apache-2.0**（README 自称 MIT） | PSGAN 系 | ⚠️ 见 (b) |

**(b) 全网只有 2 份上妆工作流 JSON，且都点名了。**

1. `smthemex/ComfyUI_Stable_Makeup` → 根目录 `makeup.json`（5 节点，4044B）：
   `LoadImage`×2 + `StableMakeup_LoadModel` + `StableMakeup_Sampler` + `SaveImage`；
   `DreamShaper_8_pruned_sdm.safetensors` + `clip_l.safetensors`；512×512 / 30 步 / cfg 1.6。
   **插件 Apache-2.0、骨干 SD1.5（OpenRAIL-M 可商用带限制），但检测器权重是 InsightFace RetinaFace → NC 污点**（正是 §6.1 第 4 层的同类问题）。
2. `360CVGroup/FLUX-Makeup` → `Flux_Makeup_ComfyUI/user/default/workflows/flux_makeup.json`（7 节点，25 步）：
   LoadModel **直指 `FLUX.1-Kontext-dev`** → ❌ 不可用。

**另外两个被排除的：**
- `ComfyUI_CSD_MT` / `ComfyUI_SHMT` **仓库里根本没有 JSON**，只有 `example.png` ——
  即「有节点、无工作流」，抄不到东西。
- `ComfyUI-Portrait-Maker` 的 `./workflow/easyphoto.json`（90,833 字节、**99 节点**）
  **是完整的 EasyPhoto 人像/换脸流水线**，含 `PM_FaceFusion`（换脸）、Chilloutmix、
  FilmVelvia3 LoRA、roop，**而且根本没接上妆容节点**。
  > 代理的原话建议是：**「这正是不要抄的那种东西。」**

**(c) 一批近亲节点包，未展开**（记下来免得下次重查）：
`comfyui-face-beauty`、`ComfyUI-EasyPortrait`、`comfyui_facetools`、
`comfyui_face_parsing` / `_New`、`Skin Highlight Remover`、`Pink Blush Overlay`、
`ComfyUI-SkinToken`、`ComfyuiSmartColorMatch`、`ComfyUI-ColorshiftColor`、
`comfyui_skin-tone-detector`、`ComfyUI-Vton-Mask`。

**结论：ComfyUI 不是一条「有现成可抄」的路，是一条「要自己从零搭」的路**
（回到 `selfhost-review.md` §5）。而 §6.4 已说明，**那条路的阶段 0 都还没开始。**

---

## 4. 候选三：学术 SOTA（参考图驱动）`[一手]`

**这一节的许可是从 PDF 原文读到的**——本轮证据等级最高的一节。但结论对项目不利。

| 论文 | 会议 | arXiv | 代码/权重 | 许可 | 骨干 |
| --- | --- | --- | --- | --- | --- |
| **ART: Anchoring on Reality** | ECCV 2026 | 2606.31089 | **代码：无** | 不适用 | 未写明，输出 2048×2048 |
| **MagicMakeup** | ECCV 2026 | 2607.20924 | 中文报道称「开源推理代码」，**无仓库链接、权重未提** | 未标 | ❌ **FLUX.1-Kontext-dev** |
| **MakeupMirror** | arXiv 2026-06 | 2606.20094 | **代码：无** | 未标 | Stable-Makeup 系（SD1.5 级），0.7s |
| **FRAM** | CVPR 2026 | 2603.20012 | **有代码** `github.com/zaczgao/Facial_Region-Aware_Makeup` | `[未核实]`（github 不可达） | SD + ControlNet Union |
| **From Synthetic to Real (RealBeauty)** | arXiv 2026-05 | 2605.07861 | 代码未提 | 未标 | 未报告 |
| **Supervised MT w/ curated dataset** | ICASSP 2026 | 2602.00729 | **代码：无** | 论文 CC BY 4.0（⚠️ 只是论文） | 扩散 |
| **Decoupling Style Generation** | WACV 2026 | CVF 开放获取 | **代码：无**（PDF 全文无仓库链接） | 未标 | A100 训练 ~12h |
| **DreamMakeup** ⭐ | WACV 2026 | 2510.10918 | **代码：无** | 未标 | **SD 1.5**，4090 上 <4s |

### 4.1 唯一形状对得上的：DreamMakeup

**全场唯一「RGB 颜色 + 强度 α + 文字 + 参考图 → 妆后脸」的公开方法**，训练-free，
骨干 SD 1.5（许可干净），KAIST + **爱茉莉太平洋**（欧莱雅竞品，产品动机同源）。

**但它没放代码。** 方法公开、骨干干净、训练-free——理论可复现，**但复现是拿工期赌，不建议押。**

### 4.2 结构性发现：能跑的和能用的不相交 `[一手]`

- **有代码的**（FPMT / CSD-MT / SHMT / SSAT / DTMT）——**全部 CC BY-NC-SA 4.0 非商用**，
  且**全部来自同一课题组**（武汉理工，`Snowfallingplum`）。
- **许可干净的**（ART / MakeupMirror / 2026 那批）——**全部没放权重**。

**调研员的判断：这不是「还没轮到」，是学术界开源妆容迁移的许可生态就是 NC 主导的。**
DTMT 的 NC 已在 `ai-engine-api-spike.md` §1 记过，本轮确认它是结构性的，不是个例。

### 4.3 没有综述

**不存在 2025/2026 年的妆容迁移技术综述。** 找到的候选（Cognitive Robotics 2021、
IET CV 2022）都是 GAN 时代，早于全部扩散工作。
**替代品**：ART 论文正文的对比表——在 MT-Wild + MF2K 上打了 PSGAN / PSGAN++ / EleGANt /
BeautyGAN / MAD / SHMT / StableMakeup / LADN / SSAT / BeautyDiffusion 的
CLIP-I / DINO-I / MSimG / MSimQ。**写相关工作就引那张表。**

---

## 5. 候选四：商业 API `[检索级，全部无一手来源]`

> ## ⛔ 2026-09-12：**整类按「用不起」关闭**（owner 表态，原话「不要了，用不起」）
>
> 这条同时关掉了 `ai-engine-api-spike.md` §0.1 那个挂了两轮的 `【待 owner 确认】`——
> **推测成立**（免费档只有 40 units，跑不完调用矩阵），且 owner 不再考虑付费。
>
> **对本节的处置**：
> - **不再调研本节任何选项**。下面这些数字留着，是为了下次有人问起时**不必重新查一遍**。
> - **不要**拿本文任何一格的「免费额度」去论证「其实够用」——**额度够不够不是问题所在，付费本身才是。**
> - 唯一的例外见 §8 备注（若只是想拿免费档做**一次**横向对照，不在此限）。
>
> ⚠️ 关闭的是**商业 API 这一类**，**不是** §2 的 `OpenMakeupSDK`、§3 的自建路线——
> 那两个是本地跑的，零付费，不受影响。

### 5.1 「个人即可注册 + 无企业资质」的选项

| 选项 | 免费额度 | 全妆? | 服务端 REST? | 大陆直连 | 单价 |
| --- | --- | --- | --- | --- | --- |
| **fal.ai `makeup-application`** ⭐ | 未核 | 未核 | ✅ | ⚠️ 未测 | **$0.04/张，标商用** |
| **阿里云 VIAPI `FaceMakeup`** | 首次 0 元试用 | ⚠️ **只整妆** | ✅ | ✅ **已确认** | ¥0.016–0.04/次 |
| Picsart AI Hub | 200 credits | 自称有 | ✅ | ⚠️ | $0.005/credit |
| 阿里云百炼 `qwen-image-edit` | **100 次 / 90 天** | 靠 prompt | ✅ | ✅ | ≈$0.03/张 |
| 腾讯云人脸试妆 | **1000 次/月** | ❌ **只唇色** | ✅ | ✅ | ¥0.01/次 |
| ModelScope | 2000 次/天 | 视模型 | ✅ | ✅ | ¥0（**商用条款未明确**） |
| 旷视 FaceStyle | 未知 | ✅ 全妆 | ✅ API + H5 | ✅ | **不公开** |

**四条值得单独说的：**

- **fal.ai `makeup-application`** 是本轮新发现里最值得试的一条：**美妆专用**托管模型
  （不是通用图像编辑器），`POST fal-ai/image-apps-v2/makeup-application`，描述为
  「Apply realistic makeup styles with **adjustable intensity**」，**$0.04/张、标注支持商用**。
  它比 Qwen-Image-Edit 更适合占 `api-spike.md` §3.1 那个「生成式 wow」名额——同价位，
  但**不用写 prompt 描述妆容**。`[未核实]`：输入 schema、吃不吃原脸、部位覆盖、人脸审核策略。
- **阿里云 VIAPI `FaceMakeup`**：个人实名 + 大陆直连 + 全妆，但**只能整妆**——
  `MakeupType` 只有 `whole`，6 种 `ResourceType` 预设风格（基础/少女/活力/优雅/魅惑/梅子）+ `Strength`。
  **不能给 hex、不能逐部位控**，与 `Look{zones}` 契合度很低。**当 demo 兜底可以，当主选不行。**
- **旷视 FaceStyle** 是国内唯一「全妆 + 有 API + 部位可控」的，但**价格和门槛全查不到**，
  官网只有售前咨询入口。**这是唯一一个「问一句就可能捡到」的选项，值得发一封售前咨询**，
  问两件事：要不要企业资质、API 层有没有免费额度。
- **Perfect Corp 的 40-unit 真相**已写进 `ai-engine-api-spike.md` §0.1：注册只送 **40 units**
  （不是文档原先写的 500~1000），Copy Makeup 20 张、参数化 VTO 40 张，**跑不完调用矩阵**。
  促销码 `ytmakerthrive` 可换 500 units `[未核实]`——**成了矩阵就能跑完，值得花五分钟试**。

### 5.2 「真有人在用吗」——**这是本轮最硬的一节**

找到了 **8 个以上公开的 YouCam 黑客松项目**（Devpost 2026-07~08 那场已截止，但作品全公开）。

**跨 8 个项目零例外的共同模式：**

1. **一律后端代理**，前端绝不碰 key（CORS 本来就逼你这么做）；
2. **async submit → poll** 流水线；
3. **都撞过 CORS / 公网可访问 URL 两个坑**（后者要 ngrok）；
4. **每个项目都提到需要 fallback**。

> **这四条正好是 `Engine` 端口 + `compose.ts` + MockEngine 已经解决的事。**
> 可以诚实地写「我们的架构与 8 个真实项目的收敛结论一致」。

**可直接抄的经验：**
- **上妆顺序必须是「磨皮 → 妆容 → 发色 → 饰品」**——先上妆后磨皮 "looks fake"，
  饰品在发色之后会 "clipped the hairline"（Perfect Corp Try-On Concierge 项目结论）；
- **需要严格的前置人脸校验器**（检查眼/唇/皮肤可见度）再放行试妆，
  **防止把妆画到头发或手上**（Pretty Alice 项目）；
- **上传前压缩图片 + 上游失败有 fallback mode**（glowcart-ai 项目）；
- **`gemini-glowchart-agent`** 提供了**零云依赖 stub 模式**（fixture 结构与真实 API 一致），
  可直接跑 pytest——**这和 `api-spike.md` §4.5 的 record/replay 是同一个思路**。

### 5.3 行业数据：可作红线 §13-3 / §13-4 的对立面素材 `[检索级]`

- **某国货粉底推荐对深肤色适配率仅 27%，较浅肤色低 53%**；
- **10 个试妆平台仅 3 家能实时删除原始面部数据**；
- 有「试妆数据训练换脸模型引发诉讼、人脸照片泄露」的案例；
- 另一组：31% 不愿推荐者归因「效果个人差异大」，**70% 的问题出在光源**。

---

## 6. 本轮最重要的四条交叉结论

### 6.1 许可陷阱一共四层，**每查一层都不够** `[一手]`

这是本轮最该记住的一节。**打捞之后，陷阱的谱系补齐了四层**——
每一层都能骗过前一层的方法论。`ai-engine-selfhost-review.md` §3.3 那条
「代码开源 ≠ 权重开源」只覆盖了第 2 层。

| 层 | 骗术 | 实例 | 只查前一层会怎么错 |
| --- | --- | --- | --- |
| **1. 徽章当许可** | README 挂个 shields.io 的 `License: Apache2.0` 图片，**仓库里根本没有许可文件** | **MAD**（`basiclab/MAD`）：`LICENSE` / `.md` / `.txt` 三条路径**全 404**，README 那个是 `<img>` 徽章不是法律文件 | 看到徽章就以为 Apache-2.0。**实际是保留全部权利** |
| **2. 包装干净、骨干脏** | 仓库 LICENSE 与 HF 模型卡都标 Apache-2.0，**但 README 自己要求下载一个非商用的 backbone** | **FLUX-Makeup**（→ FLUX.1-Kontext-dev）、**MagicMakeup**（ECCV'26 SOTA，同一个骨干）、**ART** | 读了自己仓库的 LICENSE 就放心了。**上一层方法「看骨干」正是在这里出现的** |
| **3. LICENSE 正文里的第三方清单** | 许可证标题是 Apache-2.0，**但正文自己列了非商用的第三方组件** | **GFPGAN**：LICENSE 正文写着 `DFDNet` = **CC BY-NC-SA 4.0**、`StyleGAN2`（NVIDIA）§3.3「only may be used **non-commercially**… research or evaluation purposes only」 | **「看骨干」也挡不住**——坑不在骨干，在许可正文的第 200 行 |
| **4. 运行期下载的 checkpoint** | 代码、骨干、LICENSE 全干净，**但依赖包里一行 `git+https://` 会在运行时自动拉一个非商用权重** | **Stable-Makeup**：`requirements.txt` 里 `facelib @ git+…/FaceLib.git` 会自动下载 `mobilenet0.25_Final.pth`，溯源到 **InsightFace NC**。而**这个文件名原样出现在它的 ComfyUI workflow JSON 里** | **「读到 LICENSE 原文」也挡不住**——**顶层许可证对运行期下载的 checkpoint 一无所知** |

**由此得到的规则（建议替换 §3.3 那条）：**

> **代码开源 ≠ 权重开源 ≠ 运行期加载的东西开源。**
> 接任何一个模型前要过四关：① 仓库里**到底有没有**许可文件（不是徽章）→
> ② **骨干**是什么、它什么许可 → ③ 许可**正文**里列了哪些第三方组件 →
> ④ 依赖装完之后，**运行期还会不会自动下载别的权重**，那些是什么许可。

**第 3 层还有个更狠的推论**（代理做的，值得记）：GFPGAN v1.3/v1.4 用 StyleGAN2-based decoder，
而那个 StyleGAN2 prior **是在 FFHQ 上预训练的** → **权重同时继承 FFHQ 的 CC BY-NC-SA 4.0**。
**数据集许可会顺着预训练权重传下来。** 同一逻辑命中 **BeautyBank**（MIT 代码，
骨干却踩 FFHQ + InsightFace IR-SE50）。

代理为此做了个有用的区分，建议沿用：
**「数据集 NC」属风险级，「权重有明确 NC 条款」属硬否决级。**

**其他同类判例：**

| 对象 | 表面 | 实际 |
| --- | --- | --- |
| **CodeFormer** | README 自称 "NTU S-Lab License 1.0" | 正文实测 **非商用**；`docs/train.md` 原文证实训练数据是 **FFHQ** → 代码和权重都不可商用 |
| **BeautyREC** | 许可文件名是 `License`（大写 L、**无扩展名**）→ GitHub 检测 `NOASSERTION`、ecosyste.ms 显示 `license=other`、`LICFILE=None` | 原文「use **for non-commercial purpose**」。**只看元数据会反向误判成宽松** |
| **SSAT** | GitHub = CC BY-NC-SA 4.0；同作者 **Gitee 镜像 = MIT** | 两处**都是官方自称**且打架 → **按 NC 处理最安全** |
| **ComfyUI_SHMT / ComfyUI_CSD_MT** | 插件本身 **MIT** | **底座权重 CC BY-NC-SA** → 「插件 MIT 救不了底座」 |
| **ComfyUI-Portrait-Maker** | `LICENSE.txt` = **Apache-2.0** | **README 自称 MIT** → 文件与 README 矛盾 |
| **FaceLib** | 代码 **MIT** | 运行期自动下载的 RetinaFace 权重**溯源到 InsightFace NC** |
| **Adv-Makeup**（腾讯优图） | — | 「shall only be for the purpose of **academic research**」+「**shall not run or work with other open source software**」 |
| **UyaliBeautySDK** | — | `LICENSE.md` = 「Free and Evaluation License Agreement… **All rights reserved**」→ 非开源 |
| `Honlan/BeautyGAN` / `Honlan/DMT` / `wangguanzhi/LADN` / `EdVince/PSGAN-NCNN` | — | **仓库里根本没有许可文件** → 默认保留全部权利 |

**一批曾被当成候选、实为同一个不可用选项的方法**：
MAD / SHMT / CSD-MT / SSAT / DTMT / FPMT **实为同一作者（Zhaoyang Sun / `Snowfallingplum`）
一条谱系**，商用上等价于 1 个「不可用」选项，不是 5 个备选。
（这解释了 §4.2 那个「武汉理工垄断」的结构性发现。）

> ✅ **2026-09-12 已办**：MagicMakeup 已正式挪进 `ai-engine-selfhost-review.md` §5.6 的排除表，
> 措辞从「留作论文参考」改成「许可不能用」（Kontext-dev 底座）。
> 但它 §3.1 那条「像素 mask 约束不住注意力」的论证**与许可无关，仍然成立**，
> 已作为 caveat 留在 `selfhost-review.md` §5.3。

### 6.2 深肤色：学术界是空白，但拿到了弹药 `[一手]`

**ICCCV 2026 偏差审计**（DOI 10.1145/3810417.3810425，论文 CC BY 4.0）
拿 320 张按 4 族裔平衡的合成脸测 BeautyGAN / PSGAN / EleGANt：

> **Black-presenting 脸退化最严重**——错位、光度/色度伪影、**非预期肤色漂移**，
> 并用 CIELAB **mid-face ΔL\*** 量化明度漂移。

**这是学术界唯一真正量化深肤色退化的工作。** 它把 roadmap §13-3 的「深肤色不能抹灰」
从直觉变成**有 DOI、有指标、可引用**的论据。

**同时也要记住反面**：2026 年所有方法论文都只说 "diverse skin tones"，
**没有一个给出「5 档肤色各自通过率」这种表**。
**你们要的可断言红线，在学术界目前没有可复用的评测口径——那套夹具和评分表得自己建，**
**而这恰好是 `api-spike.md` §4.2 / §4.4 已经做过的事。**

### 6.3 「参考图是否必需」这个问题，本轮有了更强的答案

`api-spike.md` §1.2 曾把「引擎能不能收结构化参数」当作 `references` 模块能否退役的关键。
本轮两边都印证了这个方向的价值：

- **参数化那一类（§2）天然不吃参考图**，且许可干净、参数可断言；
- **学术 SOTA（§4）清一色吃参考图**，而它们**全部非商用或无权重**。

**结论**：`references` 的去留，应当**作为选型的一项硬性筛选条件提前问**
（「这个候选吃不吃参考图」），而不是等选完了再回头发现它又需要参考图。
这条已写进 `roadmap.md` §13-2。

### 6.4 🆕 本机环境实测：**那块 8GB 显卡现在用不上** `[实测]`

打捞时顺带回收到的本机实测数据，**它对所有自建路线都是前置否决**：

```
Python 3.13.5
torch 2.9.1 —— 是 CPU-only 构建，cuda.is_available() == False
已装 opencv-python-headless 4.13.0.90
未发现任何 ComfyUI 安装目录
```

**这意味着两件事：**

1. **8GB 显存目前完全用不上。** RTX 5060 Laptop 是 Blackwell（**sm_120**），
   要 **PyTorch ≥ 2.7 的 cu128 wheel** 才有 CUDA。已装的是 CPU-only 构建。
2. **ComfyUI 根本没装。** `selfhost-review.md` §5 那套方案的「阶段 0：ComfyUI 起得来」
   **一步都还没走**。

> **对本轮结论的影响**：本文 §2.4 那个 OpenMakeupSDK 之所以价值最高，
> **一部分原因正在这里**——它是纯浏览器 WebGL，**绕开了上面这两个前置条件**。
> 而所有「本地跑扩散模型」的路线，**都要先过 PyTorch CUDA 重装这一关**，
> 而那是一个**与选型无关的、纯粹的环境坑**。

---

## 7. 还没做完的事（调研被中止处）

1. ~~GitHub 开源项目全盘点没跑完，dlib 那个悬念没有结论。~~ **⚠️ 已打捞，结论是：**
   **dlib 在 Windows 上没有预编译 wheel。** 实测 PyPI `19.24.2` ~ `20.0.1` 全部
   `win_amd64 wheels: []`，**只有 sdist** → 装它要 **CMake + Visual Studio 现场编译**。
   这是 PSGAN（§2.4b）在本机最大的实际拦路石。
   **但「开源项目全盘点」本身仍然没跑完**——打捞只回收了它已经查过的部分，
   **§2.4c 那张表是「它查到的」，不是「存在的全部」。**
2. **fal.ai `makeup-application` 的输入 schema 完全未知**——吃不吃原脸、要不要参考妆图、
   还是只吃 prompt + intensity。**这决定了它是「Copy Makeup 的替代」还是「Qwen-Image-Edit 的替代」。**
3. **旷视 FaceStyle 的价格与门槛未知**——唯一一个「问一句就可能捡到」的选项。
4. ~~所有 GitHub 仓库的 LICENSE 原文，一条都没读到。~~ **⚠️ 2026-09-12 打捞后部分填上，改为：**
   **读到原文的是 8 个项目**（`PSGAN` / `face-makeup.PyTorch` / `MODNet` / `P3M` /
   `CodeFormer` / `GFPGAN` / `RobustVideoMatting` / `ffhq-dataset`），加上一批 HF 模型卡与
   MediaPipe 官方 Model Card（原件已移除）。**详见 §2.4 与 §6.1。**
   **`§2.1` 那批「参数化上妆」开源实现（`srivatsan-ramesh` / `carlmagumpara` 等）仍然一条都没核**
   ——**它们标 MIT 这件事依旧不可信，按未核实对待。**

   **仍未核实的许可（打捞后剩下的洞）：**
   - `BeautyGAN_pytorch` 的 MIT —— 代理只拿到 **HTTP 200 状态码和一条 README 文字**，
     却在思考里写成了 "Good — MIT"。**它自己标了 "Risky"，但没打捞的话这个结论会被当成已验证。**
   - `P3M-10k` **数据集**协议 —— 只读到 README 里一个链接标签 `(Agreement (MIT License))`，**协议 PDF 从未打开**
   - `MODNet` 训练数据链（PPM-100 / Adobe Image Matting / SOC）—— **完全未核实**
   - `VideoMatte240K`、Adobe Image Matting 数据集条款 —— 站点不可达
   - `CodeFormer` 权重层 —— 托管在 Google Drive / GitHub Releases，**无独立许可声明**
   - `FRAM` 仓库 LICENSE —— github 全域不可达
   - **「皮肤匀净 / 人像美化」整个子赛道** —— 因搜索通道崩溃（Bing 故障、WebSearch 预算 200/200 耗尽）
     **基本没被覆盖**。它探测的一批仓库（`bcmi/SSAT`、`bcmi/EleGAN`、`bcmi/DualStyleGAN`、
     `dafeiqi1/SPMT`、`SongsongWu/*`）全部返回 NOT FOUND，
     **代理怀疑是探测 API 本身 flaky 而非真不存在，没有定论。**
5. **所有结果图一张都没看到**——「真的跑得通吗」这格空着。
6. **大陆网络可达性一条都没实测。** 调研环境的拦截是工具侧策略，与 venue 网络无关。
7. **`ytmakerthrive` 促销码是否有效**、`mu-transfer`/`makeup-vto` 在 40-unit 档是否可用，均未测。

---

## 8. 下一步该做的（建议，非拍板）

**打捞之后这一节的首位换了** —— 因为 §2.4 那个东西**已经在仓库里了**。

| # | 耗时 | 做什么 | 为什么排这个位置 |
| --- | --- | --- | --- |
| **1** | **半小时** | **审 `tespro/`（OpenMakeupSDK）**：① `assets/patterns/` 那 73 张 PNG 和 `face.glb` 的**来源与授权**（撞红线 §13-2）② 它到底能不能吃**静态照片**（现在只吃 `<video>`/`<canvas>`）③ 接上你们 `brief → Look{palette}` 那条链，用 `AI_SENTINEL` 钩子 | **它已经在仓库里、已经装好、许可 MIT、零显存、零上传。** 本轮**唯一**一个能同时说这四句话的方案。不先把它摸清，后面所有判断都是空转 |
| ~~2~~ | — | ~~注册 Perfect Corp 试 `ytmakerthrive` 换 500 units~~ | ❌ **2026-09-12 owner 已否：用不起。** 删掉，不要重开 |
| ~~3~~ | — | ~~给旷视发售前咨询（要不要企业资质 / API 层有免费额度吗）~~ | ❌ 同上——**它是商业 API，同类**。删掉，不要重开 |
| ~~4~~ | — | ~~读 fal.ai `makeup-application` 模型页~~ | ❌ 同上（$0.04/张）。**只有一种情况例外**：需要给评委一张「和商业方案比，我们不差」的对照图，此时**只用免费档跑一次**，且不算进主链路 |
| **5** | 半天 | 若要碰 PSGAN：先解 **dlib 的 Windows 编译**（CMake + VS），再审计删掉 `faceplusplus.py` 里的硬编码 key | **它是唯一「代码+权重双干净」的参考妆迁移**，但前置成本不低 |
| **6** | 一天起 | 若要碰自建：先装 **PyTorch cu128**（sm_120）+ **ComfyUI** | §6.4 实测：这两样**一个都没就绪**，是纯粹的环境坑 |

**不建议现在做的**：任何需要 GPU 云租用、任何需要复现论文、任何需要重训模型的路线，
以及——**2026-09-12 起——任何按张/按次计费的商业 API**（owner 已按「用不起」关闭，见 §5）。
上表第 2/3/4 项已划掉；**现在真正要做的只有第 1 项**，其余是「如果要走才要做的」。

> **一条方法论提醒**：本次调研四路里**三路的证据都来自搜索摘要**，
> 而打捞出来的东西**几乎全是原文**。**下一次要判断某个许可，直接去读原件，别先问搜索引擎。**
> 本轮所有真正的进展——两个新候选、四层陷阱谱系、dlib 的结论——
> **没有一条是从搜索摘要里来的。**

---

## 附：本轮来源

**学术（一手）**：[ART](https://arxiv.org/abs/2606.31089) ·
[MagicMakeup](https://arxiv.org/abs/2607.20924) ·
[MakeupMirror](https://arxiv.org/abs/2606.20094) ·
[FRAM](https://arxiv.org/abs/2603.20012) ·
[From Synthetic to Real](https://arxiv.org/abs/2605.07861) ·
[ICASSP 2026](https://arxiv.org/abs/2602.00729) ·
[DreamMakeup](https://arxiv.org/abs/2510.10918) ·
[WACV 2026 Decoupling Style Generation](https://openaccess.thecvf.com/content/WACV2026/html/Chau_Towards_High-Fidelity_Identity-Preserving_Real-Time_Makeup_Transfer_Decoupling_Style_Generation_WACV_2026_paper.html) ·
[ICCCV 2026 偏差研究](https://dl.acm.org/doi/10.1145/3810417.3810425) ·
[Cardiff ORCA 187641](https://orca.cardiff.ac.uk/id/eprint/187641/) ·
[Deep Graphics Encoder](https://arxiv.org/abs/2105.06407) ·
[BeautyBank](https://ar5iv.labs.arxiv.org/html/2411.11231) ·
[MAD](https://arxiv.org/abs/2504.02545) ·
[FLUX-Makeup](https://github.com/360CVGroup/FLUX-Makeup) ·
[BFL 自托管许可说明](https://help.bfl.ai/articles/9272590838-self-serve-dev-license-overview-pricing)

**实践（检索级）**：ComfyUI Inpaint Nodes（Acly）· ComfyUI Differential Diffusion 节点 ·
`ComfyUI_Stable_Makeup` · `ComfyUI-Portrait-Maker` · PixAI Two Tone Lipstick LoRA ·
YouCam Devpost 黑客松参赛作品（Hue&You / glowcart-ai / Try-On Concierge / EcoTry Bellini /
Pretty Alice / gemini-glowchart-agent / Touchstone / MIRROR）

**商业（检索级）**：fal.ai `makeup-application` · 阿里云视觉智能 `FaceMakeup` ·
旷视 FaceStyle · 腾讯云人脸试妆 · 阿里云百炼 `qwen-image-edit` · Picsart AI Hub ·
Perfect Corp 官方博客与 Zenn 实测（40 units）

**未能核实清单见 §0、《本文未完成项》见 §7——请勿把任何 `[检索级]` 条目当作已知。**
