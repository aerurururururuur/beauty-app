# 开源上妆项目全盘点 · 第四路补完

> 对应 `ai-engine-makeup-models.md` **§7 未完成项第 1 条**（"「开源项目全盘点」本身仍然没跑完，
> §2.4c 那张表是「它查到的」，不是「存在的全部」"）。
> 与 `makeup-engine-extraction.md`（审 `tespro/`）同源，本文是它的**上游视野**：
> 那篇回答"怎么接 tespro"，本文回答"**除了 tespro 还有没有更好的**"。
>
> 日期：**2026-09-13** · 状态：**盘点成文，结论方向明确，未拍板**。
>
> **本文只回答"存在什么 / 孰优孰劣"，不回答"最终选谁"。** 后者是 owner 的拍板，见 §8。

**一句话**：**没有"更好的同类开源 SDK"——这个品类在开源世界基本是空的。** 不是 `tespro/` 特别差，
是整条赛道上**不存在成熟的开源实时试妆项目**。真正更好的东西不在某个仓库里，
而在「官方 canonical 人脸模型 + MediaPipe tasks-vision + 自研渲染层」这个**组合**里。

---

## 0. 本文的证据来源（含一条方法论发现）

| 标级 | 含义 | 在本文中的分布 |
| --- | --- | --- |
| `[一手·API实测]` | 本机 `curl` 直打 `api.github.com` / `registry.npmjs.org`，拿到**原始 JSON** | §2–§4 全部星标/活跃度/许可字段 |
| `[一手·读原件]` | 读到 README / LICENSE **正文** | §2.2、§2.3、§5 |
| `[实测]` | HTTP 状态码探测 | §5.2 |
| `[检索级]` | 只在 WebSearch 摘要里见过，**未读到原文** | 已逐条标出，仅 §5.3 一处 |

**没有一条结论来自"我记得"。** 凡未读原件的，都标了 `[检索级]` 并写明。

### 0.1 ⚠️ 方法论发现：WebFetch 拦截可以绕开，证据等级能提两档

`ai-engine-makeup-models.md` §0 记着：**WebFetch 被全域拦截**（不止 github.com，连
en.wikipedia.org 都返回 "Unable to verify if domain is safe to fetch"），
后果是"四路里有两路的所有结论都来自搜索摘要的二次转述"。

**本轮复现了这个拦截**——`github.com`、`www.npmjs.com`、`tympanus.net` 全部被拦。

**但 `curl` 到下列端点全部可达且返回真实数据：**

| 端点 | 用途 |
| --- | --- |
| `api.github.com/repos/{owner}/{repo}` | 星标 / fork / `pushed_at` / `license` / `has_pages` |
| `api.github.com/repos/{owner}/{repo}/license` | **LICENSE 全文**（base64 解码） |
| `api.github.com/repos/{owner}/{repo}/readme` | **README 全文** |
| `api.github.com/repos/{owner}/{repo}/releases`、`/issues`、`/contributors` | 发布 / issue / 贡献者 |
| `registry.npmjs.org/{pkg}` | 包元数据、发布史、`build` 脚本 |
| `api.npmjs.org/downloads/point/last-week/{pkg}` | 真实下载量 |
| `raw.githubusercontent.com/...` | 任意仓库文件正文 |

**这不是小事。** 上一轮卡在 `[检索级]` 的那批结论（许可、活跃度、是否真存在），
**用 curl 全部可以拿成 `[一手]`**。§7 第 4 条列的那一串"未核实的许可"里，
凡是 GitHub 上的，本轮方法都能补上。**建议后续调研默认走 curl，不要再把 WebFetch 拦截当成硬约束。**

> 注意：这与"大陆网络可达性"无关。`api.github.com` 在本次环境可达，不代表 venue 网络可达，
> 两者都不要互相推断（沿用 `ai-engine-makeup-models.md` §7 第 6 条的口径）。

---

## 0.2 本文要修正的一处上一轮说法

| 上一轮说法 | 状态 | 实情 |
| --- | --- | --- |
| 「`jeelizFaceFilter` 只输出头部位姿+缩放+张嘴系数，**没有关键点**，做不了试妆」 | ⚠️ **说错了，已修正** | README 原文：*"the position and the scale of the detected face and the rotation Euler angles. **Facial landmarks positions are also among the neuron network outputs.** There is still a balance between the number of detected keypoints and the accuracy/weights."* —— **landmark 是有的**，但作者自陈存在"关键点数量 ↔ 精度/权重"的权衡。准确说法是**稀疏关键点**，不是"没有"。**是否够画唇形，本文未实测，按未知对待**（§7） |

**修正后的净判断不变**（它仍不是试妆库），但**理由从"没有关键点"退到"关键点密度与精度未实测"**——
这是个弱得多的理由，**不得再按旧口径传播**。

---

## 1. 结论先行：品类是空的

`ai-engine-makeup-models.md` §2.4c 那张表收的是"打捞到的"项目。**本轮把 A 类（实时几何式试妆）
重新扫了一遍，结论是：不存在一个"装上就能用"的开源实时试妆库。**

证据不是"我没搜到"，而是三条可复核的结构性事实：

1. **星标最高的那几个，都不是试妆库。** `face-api.js`（★17953）是**检测/识别**，
   `clmtrackr`（★6499）是**特征点跟踪**，`mind-ar-js`（★2730）是**通用 WebAR（图像+人脸）**。
   它们提供追踪，**不提供任何妆效渲染**。
2. **唯一带真·试妆 demo 的那个（WebAR.rocks.face）是追踪库 + 示例**，不是成品 SDK；
   渲染层仍要自己写（§2.2）。
3. **唯一"像 SDK"的那个（`open-makeup-sdk`）是单人单次发布、已停更、demo 失效**（§2.4）。

**所以"再找一个更好的开源试妆 SDK"这条路，可以判定为走不通。** 剩下的路是**换栈**（§5）。

---

## 2. A 类：实时几何式试妆（与 `tespro/` 同一路线）

全部数据 `[一手·API实测]`（2026-09-13）。

| 仓库 | ★ | fork | 最后推送 | 许可 | 语言 | 是不是试妆 |
| --- | ---: | ---: | --- | --- | --- | --- |
| `justadudewhohacks/face-api.js` | **17953** | 3886 | 2024-01-24 | MIT | TS | ❌ 检测/识别 |
| `auduno/clmtrackr` | 6499 | 1133 | **2020-01-10** | MIT | JS | ❌ 特征点跟踪 |
| `jeeliz/jeelizFaceFilter` | **2938** | 545 | 2025-11-14 | **Apache-2.0** | JS | ⚠️ 滤镜库，见 §2.2 |
| `hiukim/mind-ar-js` | 2730 | 513 | 2024-06-11 | MIT | JS | ❌ 通用 WebAR |
| `jeeliz/jeelizWeboji` | 1097 | 150 | 2024-02-06 | Apache-2.0 | JS | ❌ 表情系数 |
| `malaybaku/VMagicMirror` | 542 | 53 | 2026-07-31 | MIT | **C#** | ❌ **误报，应排除**（见 §2.5） |
| `maham-creates/ToneMatch` | **1** | 1 | 2026-02-01 | 无 | TS | ⚠️ 空壳，见 §2.5 |
| `WebAR-rocks/WebAR.rocks.face` | 123 | 30 | 2025-11-15 | ⚠️ 见 §2.2 | JS | ✅ **有试妆 demo** |
| `jays0606/mediapipe-facelandmark-demo` | 118 | 25 | 2023-05-17 | MIT | TS | ❌ 关键点 demo |
| `Banuba/beauty-web` | 35 | 16 | 2025-04-15 | MIT | JS | ⚠️ 商业 SDK 的示例仓 |
| `matasarei/tryonface` | 82 | 32 | 2025-10-26 | **GPL-3.0** | JS | ❌ 眼镜试戴 |
| `nuwandda/snapchat-filter-threejs` | 7 | 1 | 2022-10-25 | 无 | JS | ❌ 滤镜 demo |

> `GPL-3.0`（`tryonface`）对本项目是**不可用**——传染性许可，与"参赛作品须原创"的叙事冲突。

### 2.1 `jeelizFaceFilter` —— 星最多、真开源可商用，但不是试妆库

`[一手·读原件]` README 原文（本次经 API 读到全文）：

> *"This library is lightweight and it does not include any 3D engine or third party library.
> We want to keep it framework agnostic so the outputs of the library are raw: if the face is detected
> or not, the position and the scale of the detected face and the rotation Euler angles."*

- **许可干净**：`Apache-2.0`，**可商用**，无附加条款。这是它在 A 类里最大的优势。
- **活跃**：最后推送 `2025-11-14`。
- **能力边界**：定位是"face filters"（眼镜/帽子/面具），输出以**头部位姿**为主；
  landmark 有但稀疏（见 §0.2 的修正）。**做唇形轮廓、眼影形状这种精度够不够，本文没实测**（§7）。
- **结论**：`★2938` 的星数**不代表它适合试妆**——它的星系在"AR 滤镜"这个更宽的品类里的。

### 2.2 `WebAR.rocks.face` —— 唯一明确带试妆 demo 的，但许可要问清楚

`[一手·读原件]` README 的 demo 清单里**确实有试妆**，**共四项**，逐条抄录原文：

> * Makeup:
>   * makeup lipstick VTO: [live demo](https://webar.rocks/demos/face/demos/makeupLipstick/), [source code](/demos/makeupLipstick/)
>   * makeup shapes based VTO: [live demo](https://webar.rocks/demos/face/demos/makeupShapes/), [source code](/demos/makeupShapes/)
>   * makeup texture based VTO: [live demo](https://webar.rocks/demos/face/demos/makeupTexture/), [source code](/demos/makeupTexture/)
>   * sport makeup: [live demo](https://webar.rocks/demos/face/demos/makeupSport/), [source code](/demos/makeupSport/)

**四套试妆 demo（lipstick / shapes-based / texture-based / sport），每套都带 live demo + 可跑源码。**
这是 A 类里**唯一**接近"能直接看到实现"的东西——且四种做法并列，本身就有对照价值。

**⚠️ 但许可有疑点，商用前必须问作者。** LICENSE 正文的结构特殊：

```
WebAR.rocks.face
Copyright (c) 2025 WebAR.rocks

LICENSED PROPERTY
The licensed property consists of files and sub-directories of:
  - /dist
  - /helpers
  - /neuralNets
  - /blenderPluginFlexibleMaskExporter
  - /reactThreeFiberDemos/src/js/contrib/WebARRocksFace
  - /VTO4Sketchfab
...
LICENSE
MIT License
```

**两种读法都成立**：(a) 先划范围、再给 MIT → **全库 MIT**；(b) 先划出"被许可财产"、
再另行给示例 MIT → **核心库 `/dist` 与权重 `/neuralNets` 是专有**。README 只写
*"This code is released under MIT Software license"*，**没有消歧**。

**决定性旁证**：`api.github.com` 对它的 `license` 字段返回 **`NOASSERTION`**（GitHub 无法认定），
而它的姊妹项目 `jeeliz/jeelizGlassesVTOWidget` 的 LICENSE 第一行是
**"Jeeliz VTO Commercial License Agreement"** —— 同一作者家族**确实走商业许可**。

**处置：在问清楚之前，按"不可商用"对待。** 且注意 `/dist`（就是你要 import 的那个）正在被划入的范围里。

### 2.3 许可正面清单（本轮读到的原件）

| 仓库 | 许可 | 证据 | 可商用 |
| --- | --- | --- | --- |
| `jeeliz/jeelizFaceFilter` | Apache-2.0 | `[一手·读原件]` LICENSE 全文 | ✅ |
| `jeeliz/jeelizWeboji` | Apache-2.0 | `[一手·读原件]` LICENSE 全文 | ✅ |
| `jeeliz/jeelizGlassesVTOWidget` | **Commercial License Agreement** | `[一手·读原件]` LICENSE 首行 | ❌ |
| `WebAR.rocks.face` | MIT + 范围声明（歧义） | `[一手·读原件]` LICENSE 全文 | ⚠️ **待问** |

> 这四条**直接补上 `ai-engine-makeup-models.md` §7 第 4 条的洞**——那一条写的
> "JEELIZ / WebAR.rocks 系列许可未核"，现在核完了。

### 2.4 `open-makeup-sdk`（即 `tespro/` 的上游）在本表里的位置

`[一手·API实测]` + `[一手·读原件]`：

| 指标 | 值 |
| --- | --- |
| ★ / fork / watcher | **12 / 3 / 0** |
| 最后推送 | **2026-06-16**（上游停更约 3 个月） |
| 贡献者 | 1（Ehsan Moradi） |
| open issues | 1，标题 "Mobile SDK"，**0 回复** |
| `has_pages` | **`false`** → README 主推的 live demo **链接是死的** |
| GitHub Pages API | **HTTP 404** |
| npm | `0.1.0`，**仅发布一次**（2026-06-16），从未更新 |
| npm 下载 | **17 次/周** |
| `build` 脚本 | `echo "(build step to be added)" && exit 0` —— **空壳** |
| 测试 | **无** |

**它在 A 类里排不上号**，但它有一个别人没有的东西，见 §6。

### 2.5 两个从搜索里冒出来的误报，一并排除

- **`malaybaku/VMagicMirror`（★542）**：搜索把它当"开源模块化虚拟试妆"。**实为 Windows 上的
  VRM 虚拟形象驱动软件（C#）**，与人脸试妆无关。**排除。**
- **`maham-creates/ToneMatch`（★1）**：搜索摘要把它写成"strong open-source reference implementation"。
  **实为 ★1、fork1、无许可、无描述的空仓**（`pushed 2026-02-01`）。**排除。**
  → **这两条是"搜索摘要比事实好看"的又一例**，印证 `ai-engine-makeup-models.md` §0 对 `[检索级]` 的警告。

---

## 3. B 类：生成式妆容迁移（效果天花板，但**不实时**）

全部 `[一手·API实测]`。

| 仓库 | ★ | 最后推送 | 许可 | 备注 |
| --- | ---: | --- | --- | --- |
| `wtjiang98/PSGAN` | 780 | 2024-03-13 | **MIT** | CVPR'20 Oral，经典基线 |
| `tryonlabs/opentryon` | 533 | 2026-09-09 | NOASSERTION | **服装试穿，非妆容，排除** |
| `Xiaojiu-z/Stable-Makeup` | 231 | 2024-07-14 | **Apache-2.0** | **SIGGRAPH 2025**，扩散模型，报 SOTA |

`[检索级]`（未读原件）：BeautyREC（~1M 参数，极轻）、MAD、FRAM、EleGANt、CPM、BeautyGAN
—— 均见于 `makeup-transfer` topic 与检索摘要，**许可未逐条核**（§7）。

**共同限制**：Python/PyTorch，需 GPU，**逐图而非逐帧** → **上不了实时 web**。

**但对本项目有一个明确的用法**：作为**「拍照试妆」**（非实时）那条产品线的后端，
以及作为**"效果能到多好"的标尺**。注意 `PSGAN` 在本机的拦路石是 dlib 无 Windows wheel
（`ai-engine-makeup-models.md` §7 第 1 条已记）。

---

## 4. C 类：商业 SDK（工业界真正在用的）

`[检索级]`，仅列名称与形态，**未核实价格与条款**：

| 名称 | 形态 | 备注 |
| --- | --- | --- |
| Perfect Corp YouCam Web SDK | 闭源，API key | **已于 2026-09-12 因成本被放弃** |
| Banuba Face AR Web | 闭源，Freemium | 示例仓 `Banuba/beauty-web` ★35 / MIT（示例仓自身 MIT，SDK 本体闭源） |
| GlamAR（`@glamario/core-web`） | 闭源，需 API key | npm 可查 |
| Facebetter Web SDK | 闭源，WASM+WebGL | 免费档带水印 |

**定位**：这一列是"工业界现状"的参照系，不是候选。**同样按 `[检索级]` 对待，价格未核。**

---

## 5. 真正更好的东西：换栈，不是换 SDK

这是本轮最有价值的发现。**现代正确管线所需的每一块，Google 都免费给了，而且是官方资产。**

### 5.1 对照表

| 环节 | 现代做法 | `tespro/`（上游 `open-makeup-sdk`） |
| --- | --- | --- |
| 追踪 | `@mediapipe/tasks-vision` **FaceLandmarker**：478 点 + **52 blendshape** + **4×4 度量姿态矩阵** | legacy `@mediapipe/face_mesh` 468 点，**手算 5 点定姿** |
| 网格拓扑 | 官方 **`FACE_LANDMARKS_TESSELATION`**（880 三角面） | 自己 Blender 建模 |
| **UV** | 官方 **`canonical_face_model.obj`**（468 顶点带 `vt`）+ `uv_map.json` | 自己烘 `uvLip`/`uvEyeShadow`/`uvBrow` |
| three.js 桥 | `spite/FaceMeshFaceGeometry`（★421，MIT，2023-01） | 自研 `FaceMeshModelController` |
| 配方 | Codrops 教程（`[检索级]`，见 §5.3） | —— |

**关键**：`tespro/` 手算位姿、继承了 MediaPipe legacy 的 z 噪声、自己烘 UV ——
**这三件事在官方栈里全都有现成答案**，而且是免费的、有维护的。

### 5.2 官方资产可达性（`[实测]`，2026-09-13）

```
canonical_face_model.obj                        HTTP 200   ✅
canonical_face_model_uv_visualization.png       HTTP 200   ✅
```

路径：`google-ai-edge/mediapipe` → `mediapipe/modules/face_geometry/data/`

**即：官方 canonical 人脸模型（468 顶点 + 纹理坐标）可以直接下载。**

### 5.3 相关项目（`[检索级]`，未读原件）

| 项 | ★ | 最后推送 | 许可 |
| --- | ---: | --- | --- |
| `spite/FaceMeshFaceGeometry` | 421 | 2023-01-12 | MIT |
| `google-ai-edge/mediapipe` | 36930 | 2026-09-11 | Apache-2.0 |
| `google-ai-edge/mediapipe-samples` | 2824 | 2026-09-01 | Apache-2.0 |

`[检索级]`：**Codrops 教程**《Building a Real-Time 3D Face Mask with MediaPipe, Threlte and Three.js》
（标注日期 2026-09-06）。**本文未能读到原文**（`tympanus.net` 被 WebFetch 拦截，
且**未用 curl 复现**）。**日期与内容均按未核实对待**，若要引用请先 curl 原文。

### 5.4 这一节的性质

**这是"方向建议"，不是"拍板"。** 本节不声称迁移成本低——`tespro/` 的渲染层重写
是实打实的工作量，不在本文估算范围内。

---

## 6. 对 `tespro/` 的处置建议：降级为素材库

**关键判断：`open-makeup-sdk` 真正值钱的不是引擎，是素材。**

| | 内容 | 价值 |
| --- | --- | --- |
| **留** | `face.glb` 的分区 UV 通道、**73 张 pattern 贴图**、`face-rigged.blend` 那套 Blender rig、各部位 shader 作参考 | **真贵的、耗时的美术资产工作**，且 MIT 可合法取用 |
| **扔** | CPU 逐帧写顶点、零时间滤波（`[一手·本地代码]`：`KalmanFilter2D.js` **全仓无一处 import**）、unlit 渲染、Unity 移植的包袱 | 可被官方栈替换 |

> 前面的引擎分析见 `makeup-engine-extraction.md`（"怎么接"）与 `brow-rendering-refactor.md`（眉毛模块）。
> **本文不改这两篇的结论**，只补一个上游判断：**它们的对象（`tespro/`）值得留的是素材，不是引擎。**

**唯一要保留的引擎技术**：`facewarp` 的 `aBasePos` 顶点着色器技巧
（用变形前位置算屏幕坐标采样相机、在变形后位置渲染）—— **那个是对的**，见
`brow-rendering-refactor.md` 与前述引擎分析的对应段落。

---

## 7. 还没做完的事

1. **`jeelizFaceFilter` 的 landmark 密度与精度未实测** —— §0.2 修正后，"它够不够画唇形"
   成了**开放的**问题。**这是 A 类里唯一可能翻盘的项**：它 Apache-2.0 可商用、活跃、★2938。
   测法：跑它的 `basic debug view` demo，数关键点数、看唇部点密度。
2. **`WebAR.rocks.face` 的许可歧义未消解** —— 必须直接问作者（§2.2）。**在问清前按不可商用对待。**
3. **四套 makeup demo 的渲染做法一条都没读** —— `makeupLipstick` / `makeupShapes` /
   `makeupTexture` / `makeupSport` 的源码没打开。**这是 A 类里唯一"可能直接借鉴的实现"，
   本轮只确认了它存在**（且初次抄录时**漏掉了第四项 `makeupSport`**，定稿时已补）。
4. **B 类剩余项目的许可未核** —— BeautyREC / MAD / FRAM / EleGANt / CPM / BeautyGAN（§3）。
   注：`ai-engine-makeup-models.md` §7 第 4 条把 `FRAM` 列为"github 全域不可达"，
   **本轮方法（curl）可以补上。**
5. **所有结果图一张都没看到**（沿用上一轮，仍然空着）。
6. **大陆网络可达性一条都没实测**（沿用上一轮）。
7. **Codrops 教程原文未读**（§5.3）。

---

## 8. 下一步该做的（建议，非拍板）

按"信息增益 / 成本"排序：

1. **问 WebAR.rocks 的许可**（§2.2）—— 一条邮件消解 A 类最大歧义。**成本最低，收益最高。**
2. **跑 `jeelizFaceFilter` 的 debug demo 数关键点**（§7.1）—— 半小时，可能让 A 类翻盘。
3. **读 `makeupLipstick` 的源码**（§7.3）—— 半天的活，A 类唯一的实现参考。
4. **验证 §5 那条栈**：用 tasks-vision + 官方 canonical 模型 + `tespro/` 的 73 张贴图，
   把**唇妆一层**跑通，与现状对比抖动与侧脸表现。**这是唯一能把 §5 从"方向"变成"结论"的动作。**
5. 本文**不改变** `makeup-engine-extraction.md` 的结论，也不构成对 owner 的推荐。
   **"最终选谁"仍是 `roadmap.md` §14 那条待拍板。**
