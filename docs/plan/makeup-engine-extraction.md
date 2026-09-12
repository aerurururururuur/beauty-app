# 把 OpenMakeupSDK 抽进 olyhks · 可行性方案

> 对应 `ai-engine-makeup-models.md` **§8 第 1 项**（"审 `tespro/`"，本轮唯一该做的事）
> 与 `roadmap.md` **§14** 那条待拍板（选型已塌缩至 ①自研参数化一支，候选 = `tespro/`）。
> 日期：**2026-09-12** · 状态：**方案成文，未开工**。
>
> **本文档只回答"怎么接"，不回答"要不要接"。** 后者是 owner 的拍板，见 §12。

**一句话**：`OpenMakeupSDK` 比预想的干净 —— 引擎本来就留了注入口，接入主要是**三个补丁**，
不是重写；真正的成本不在代码，在 **`assets/` 的授权**与**它不支持多人合影**这两件事上。

---

## 0. 本文的证据来源

| 标级 | 含义 | 在本文中的分布 |
| --- | --- | --- |
| `[一手·本地代码]` | 直接读 `tespro/` 源码 | 主体 |
| `[实测]` | 本机真跑过（headless Chrome / 读像素 / 算 MD5） | §3、§4 |
| `[推测]` | 由代码结构推断，未实测 | §6 的工期估计 |

**没有一条来自搜索摘要。** `ai-engine-makeup-models.md` §8 末尾那条方法论提醒
（"要判断某个许可，直接去读原件"）在本文同样适用。

**本文有一处更正上游数字**：§4.1 的 pattern 计数。`ai-engine-makeup-models.md` §2.4a 写
"73 张"——**那个数字是对的**；本次初查曾一度得出"76"，是把 `foundation/.gitkeep`、
`lipstick/.gitkeep`、`patterns.json` 三个非 PNG 文件算了进去。**73 为准。**

---

## 1. §8 三项待办的现状

`ai-engine-makeup-models.md` §8 第 1 项列了三件事，逐条对账：

| # | 待办 | 现状 | 落点 |
| --- | --- | --- | --- |
| ① | `assets/patterns/` 的 PNG 与 `face.glb` 的**来源与授权** | ⚠️ **仍未解决**，且本轮查出了更硬的证据 | §4 |
| ② | 它到底能不能吃**静态照片** | ✅ **已解决** | §3 |
| ③ | 接上 `brief → Look{palette}` 那条链，用 `AI_SENTINEL` 钩子 | 🟡 **方案已成形** | §7 |

**关于 ① 的一句提醒**：它不是"顺手查一下"的行政事项，而是**阻塞提交**的。
`roadmap.md` 红线 §13-2 要求「所有参赛代码、算法模型及方案必须确保原创性，
不得侵犯第三方知识产权」（引文核实范围见 `reference-fetch-feasibility.md` §6）。
**§4 的证据会让这一格的优先级上升，而不是下降。**

---

## 2. 抽取边界：抽什么、不抽什么

`tespro/src/` 只有 **13 个文件** `[一手·本地代码]`，形状比预想的干净。

### 2.1 抽

```
makeup-engine/
├── package.json          # private, type:module, deps: three
├── README.md             # 出处 / 改了什么 / 授权状态（见 §4）
├── src/
│   ├── index.js          # 去掉 morphs 导出
│   ├── OpenMakeup.js     # ★ 补丁 1
│   ├── categories.js     # 原样
│   ├── config.js         # 原样
│   └── core/
│       ├── MakeupEngine.js        # ★ 补丁 2
│       ├── materials.js           # ★ 补丁 3（顺带）
│       ├── FaceMeshModelController.js
│       ├── FaceNurbsModelController.js
│       └── KalmanFilter2D.js
├── tools.js / executor.js         # 新增，见 §7
└── assets/{models,shaders,patterns}
```

### 2.2 不抽

- `assets/blender/`（2.3M 的 `.blend` 源文件，运行期用不到）
- `morphs.js`（修脸，产品上已明确不要）
- `index.html` / `main.js` / `examples/` / `docs/`（上游演示壳）

### 2.3 三个补丁

**补丁 1 —— `OpenMakeup.js:57-67` 透传 `cameraClass` / `faceMeshClass`** `[一手·本地代码]`

`MakeupEngine.js:103` 本来就收这两个注入，文件头注释原文：

> *"…are taken from `window.FaceMesh` / `window.Camera` (load them via a `<script>` tag)
> or injected via the `faceMeshClass` / `cameraClass` options."*

**但公开构造函数解构后没有往下传。** 后果是在 vue 里只能靠 `window.Camera = …`
猴补丁污染全局。透传之后 §3 的静态照片垫片就是正规注入。**约 4 行。**

**补丁 2 —— `MakeupEngine.js:204-208` 给 `WebGLRenderer` 加 `preserveDrawingBuffer: true`** `[一手·本地代码]`

该处构造参数只有 `{ canvas, alpha: true, antialias: true }`，**没设 `preserveDrawingBuffer`**，
默认即 `false` → 帧合成后绘制缓冲被清空 → `canvas.toBlob()` / `toDataURL()` **拿到空白**。

**这不是优化项，是"导出成品图能不能成立"的前提。** 静态照片场景下性能代价可忽略。

配套注意：renderer 是 `alpha: true`，导出时必须**先画照片、再叠 WebGL 画布**（2D canvas 合成），
否则成片背景透明。

**补丁 3 —— `materials.js:39` 删掉游离的顶层 `tMask: faceMask`** `[一手·本地代码]`

```js
uniforms: {
    ...refractUniforms,
    tMask: { value: faceMask },   // ← :37，正确
},
tMask: faceMask,                  // ← :39，游离顶层键，THREE 警告的来源
```

### 2.4 ⚠️ 摘修脸：只摘公开面，不拔内部

**这是本方案里唯一一个"看起来该做但先别做"的决定，理由是一手的。**

- `_applyMorph()` 在 `_onResults` 的渲染循环里被调用 `[一手·本地代码 MakeupEngine.js:428-450]`
- **所有妆容 mesh 共享同一份 `mesh.geometry`（来自 `face.glb`）**，morph buffer
  与 camera-on-face warp mesh 也挂在那份 geometry 上 `[一手·本地代码 MakeupEngine.js:279-403]`

**第一阶段只摘公开面**：删 `morphs.js` 及其 import，删 `morph() / setMorph() / resetMorph() /
getMorphTargets() / setWireframe()` 这几个公开方法，不接任何 UI。
**保留内部 `_applyMorph()` 与 `faceWarpMaterial.js` 不动** —— morph 权重全为 0 时它本就是恒等变换，
妆效不变。

> **理由**：把 morph 从共享 geometry 上拔干净是一次有风险的几何手术，收益只是少几百行死代码。
> **摘不干净会静默改妆效** —— 这是最难查的一类 bug。
> 等工具层跑通、有了回归截图基线之后再做第二阶段。

---

## 3. ✅ 静态照片：已实测跑通（§8 ②）

**结论：能吃，但要两层垫片。** `[实测]`

`MakeupEngine` 硬绑了 MediaPipe `Camera` 工具的两个角色，而这两个角色它其实都不需要：

| 角色 | 位置 | 为什么不需要 | 垫片 |
| --- | --- | --- | --- |
| **帧泵** | `_setupCamera()` 建 `new Camera(video, { onFrame: () => faceMesh.send({image: video}) })`；且 `_resolveMediaPipeClasses()` 在没有 `window.Camera` 时**直接抛错** `[一手·本地代码 MakeupEngine.js:179-188, 413-421]` | 它只是要一个定时器 | 自己的 `StillFramePump`，永不碰 `getUserMedia` |
| **视频元素** | `_setupScene()` 建 `new VideoTexture(this.video)` `[一手·本地代码 MakeupEngine.js:211]` | 渲染源必须是真 `<video>` | 离屏 canvas + `captureStream(N)` → `<video srcObject>` |

**MediaPipe 本身没有这个限制**：`FaceMesh.send()` 接受
`HTMLVideoElement | HTMLImageElement | HTMLCanvasElement`
`[一手·本地代码 public/mediapipe/face_mesh/index.d.ts:81]`。

### 3.1 实测结果

headless Chrome 跑 `tespro/image-test.js`：

- 蓄意让 `navigator.mediaDevices.getUserMedia` 抛错并计数
  → **`gumCalls === 0`，`init()` 成功，妆上脸**
- 全链路像素验证通过：图片 → canvas → captureStream → `<video>` → `VideoTexture` → WebGL canvas → 屏幕
- 6 秒内 `send` 30 次 / `results` 30 次（受 MediaPipe 延迟限制，实际约 5fps，由 `_busy` 守卫节流）

### 3.2 ★ 一个必须保留的陷阱守卫 `[实测]`

**MediaPipe 收到 0×0 帧会 `abort(undefined)` → `CalculatorGraph::Run() failed`，
且该 FaceMesh 实例从此永久死亡**（报 `ROI width and height must be > 0`）。

必须保留：

```js
if (!this.video.videoWidth || this.video.readyState < 2) return;
```

**摄像头路径撞不到这个坑** —— `Camera.start()` 只在 `getUserMedia` resolve 之后才跑，
而我们从 `init()` 就开始推帧。**所以这是照片路径独有的、必须自己防的死法。**

### 3.3 其余约束（都是实测踩出来的）

- 换图时**先 `stop()` 旧 stream 的 tracks** 再换，否则缓冲区泄漏
- `<video>` 必须 `object-fit: contain` —— 引擎 `_sizeToVideoBox()`（`:222-271`）用的是 contain 逻辑，
  两者不一致会漂移
- **不能 `scaleX(-1)`** —— 上游 `index.html` 为摄像头做的镜像，照片不能镜像
- 地标对静态图是稳定的，所以**检测窗口跑完就可以停泵**；换色 / 换 finish / 换 pattern
  只触发重渲染，不需要新地标

---

## 4. ⚠️ 授权：仍未解决，且证据比 §2.4a 当初判断的更硬

`ai-engine-makeup-models.md` §2.4a 保留意见 3 写的是「代理判断**看起来**来自商业图案库，
**必须问作者或自行替换**」。本轮把"看起来"变成了实测证据。`[实测]`

### 4.1 pattern 逐个数清（上游"73 张"是对的）

`assets/patterns/` 下共 **73 个 PNG**（另有 2 个 `.gitkeep` + 1 个 `patterns.json`，合计 76 个文件）：

| 类目 | PNG | 文件本身 | `setPattern()` 分支 | **开箱可用** |
| --- | --- | --- | --- | --- |
| `eyeshadow` | 49 | ✅ 真实（12–26 KB） | ✅ | **49** |
| `eyeline` | 12 | ✅ 真实 | ✅ | **12** |
| `mascara` | 4 | ✅ 真实 | ✅ | **4** |
| `blush` | 4 | ✅ **真实（24–52 KB）** | ❌ **无分支** | 0 → **可救回 4**，见 §4.2 |
| `lipstick` | 3 | ❌ **占位图** | ❌ 无分支 | 0 |
| `foundation` | 1 | ❌ **占位图** | ✅ **有分支，但危险** | 0 |
| | **73** | | | **65** |

**四条占位图的证据链（三条独立）** `[实测]`：

1. 文件大小**全部恰好 1114 字节**
2. **MD5 完全相同**：`715bc765b8c306a0f310f5732fe885d4`
3. 逐张读像素：alpha 通道取值域**恒为 `[0, 0]`**（全透明）

命中的正是：`foundation/6421.png`、`lipstick/6427.png`、`lipstick/6429.png`、`lipstick/6431.png`。

**其余 69 张 MD5 两两不同**（73 个文件去重后 70 个不同 MD5，差的 3 个正是这 4 张占位图的重复）
—— 也就是说**没有别的重复文件，其余都是各不相同的真图**。

> ⚠️ **`foundation` 那个占位图比"死分支"更危险**：
> `setPattern()` **确实**为 foundation 写了分支，把它赋给 `foundationMat.uniforms._Mask`
> —— 那是**让底妆可见的遮罩本身**。选中它等于把底妆抹没。
> 这不是"点了没反应"，是"点了妆没了"。

### 4.2 ★ 顺带发现的低垂果实：blush 只差一行接线

**blush 的 4 张 pattern 是真图，而且接线几乎是现成的**：

- `blush/fragment.glsl:12` 声明的 sampler 名是 **`_EyeShadowTexture`** —— 与眼影**同名**
  `[一手·本地代码]`
- `loadBlushMat()` **已经把它暴露在 uniforms 里**：
  `_EyeShadowTexture: { value: blushTexture }` `[一手·本地代码 materials.js:200]`
- `this.blushMat` 在引擎里**已存在** `[一手·本地代码 MakeupEngine.js:127, 332-334]`
- `setAR()` **已经处理 blush**，连 `_noise` 的三个 colorMode 取值都写好了
  `[一手·本地代码 MakeupEngine.js:464-469]`

所以 `setPattern()` 里补一个分支即可：

```js
if (armode === 'blush' && this.blushMat) {
    this.blushMat.uniforms._EyeShadowTexture.value = tex;
}
```

**收益：可用 pattern 从 65 → 69。** 这是纯粹的"上游忘接了"，不是缺资源。
（`lipstick` 接不了 —— 它的 3 张是占位图，接上也看不见东西。）

> **注意这是改上游行为**，不是无风险的搬运。要做就单独一个补丁、单独一次截图对比。
>
> **§13.2 把它当成了"加同族成员"的存在性证明** —— 它说明这条配方上游自己已经跑通过一遍，
> 所以 §13.3 层 3 那批新部位不是从零摸索。

### 4.3 shader 是 Unity ShaderLab 移植，且贴图编号共享同一个来源

`assets/shaders/*/fragment.glsl` 带**波斯语注释**（如 `مطابق Unity`，意为"与 Unity 一致"），
使用 `_MainColor` / `_Mask_ST` / `_shedat` 这类 Unity uniform 命名惯例 `[一手·本地代码]`。

**而编号在两处是共享的** `[实测]` —— `shaders/*/` 里的内置贴图，与 `patterns/*/` 里的
pattern 用的是**同一套数字 ID**：

| 编号 | `shaders/` 内置 | `patterns/` 里也有 |
| --- | --- | --- |
| `6417` | `blush/i6417.png` | ✅ `blush/6417.png` |
| `10246` | `eyeline/i10246.png` | ✅ `eyeline/10246.png` |
| `9144` | `eyeline/i9144.png` | ✗ （仅内置） |
| `6333` / `6339` | `eyeshadow/i6*.png` | ✅ 都有 |
| `9144` | `mascara/i9144.png` | ✅ `mascara/9144.png` |

**6 个内置贴图里 5 个能在 `patterns/` 里按同号找到。**
这坐实了它们**同出一源**（某个素材包 / Unity 工程），也给出了一个具体线索：
**这几个数字 ID 值得直接拿去搜**，比空泛地问"图哪来的"有效。

**MIT 只覆盖作者的移植工作**，不覆盖被移植的 shader 逻辑，也不覆盖 `assets/shaders/` 下
那 9 张散落贴图与 `face.glb`。`face.glb` 是**带 blend shape 的人脸模型** —— 来源同样未声明。

### 4.4 处理建议（按优先级）

1. **去上游仓库开 issue 问来源**，并把 §4.3 那几个数字 ID 一起贴上去
   —— 成本最低，且**能留下书面记录**（对评委是加分项，不是减分项）
2. **自绘替换** —— `eyeshadow` 的 pattern 是 1024×1024 灰度 UV 遮罩，
   本质是柔边眼形渐变，**可以程序化生成**；`face.glb` 则需要另外找/建
3. **兜底：只用 shader 内置贴图**（§4.3 那 6 张），**关掉 pattern 选择器**，
   工具层里 `pattern` 参数一并下线 —— 妆效损失有限（颜色 + finish 都还在），
   但**授权面显著收窄**

> **发布 / 提交前必须回填这一格。开发阶段可以先用。**
> 这一条与 `roadmap.md` §13-2 那条"`references` 没有合规素材来源"是**同一个红线的第二个实例** ——
> 注意 §13-2 目前记的是「完全未解决、且暂无出路」，本模块不要重蹈覆辙：
> **先拿来源，再决定用不用。**

---

## 5. 资源放哪

资源**不进 `makeup-engine/`**，走 `vue/public/` 静态服务。
`assetsBaseUrl` 本来就是可配的 `[一手·本地代码 config.js:9-19]`，注释原文明确支持三种形态：

> *"relative : './assets' · absolute : '/static/openmakeup' · full URL : 'https://cdn.example.com/openmakeup'"*

```
vue/public/openmakeup/
├── assets/{models,shaders,patterns}/     # ~4.8M（blender/ 已排除）
└── mediapipe/face_mesh/                  # ~16.6M
```

**MediaPipe 那 16.6M 的构成** `[一手·本地代码]`：两个 wasm —— `simd` 6.1M、非 simd 6.0M ——
占大头，**两个都要留**（运行时按能力挑一个）；另有一个 3.9M 的 `.data`。

```js
assetsBaseUrl:    '/openmakeup/assets',
mediapipeBaseUrl: '/openmakeup/mediapipe/face_mesh',
```

> **保留本地、不走 CDN**：`roadmap.md` 红线 §13-1 要求断网可演示
> （§8 已为天气做过同样的取舍，把 `WEATHER_PROVIDER` 写进现场 `.env`）。
> 代价是 **~22M 静态资源进 git** —— 这是有意取舍，不是疏忽。

---

## 6. ⚠️ 已知限制：不支持一张图两个人

**结论：不支持，而且不是改配置就行的。** `[一手·本地代码]`

| 层 | 位置 | 现状 |
| --- | --- | --- |
| 检测 | `config.js:22` | `maxNumFaces: 1` |
| **取用** | `MakeupEngine.js:429` | `const landmarks = results.multiFaceLandmarks[0]` —— **硬编码 `[0]`**，多检出来的脸被直接丢弃 |
| **结构** | `MakeupEngine.js:279-403` | 引擎里只有**一套**人脸装置：一个 `faceModel`、一组 `*Mat`、一份 `face.glb` geometry、4 条 NURBS 眼线/睫毛网格。`setAR()` / `clearPart()` 也**没有 face 索引参数** |

**MediaPipe 本身支持多脸**（`public/mediapipe/face_mesh/index.d.ts:199` 有 `maxNumFaces`）
—— **卡点完全在引擎的单脸假设上。**

真支持两人 = 把整个面部子树改成**按脸实例化的工厂**（faceModel + 6 组材质 + 4 条 NURBS 网格）
+ 公开 API 加 face 索引 + 逐脸遮挡排序。`[推测]` 是数天的重构，**不该塞进 10/20**。

### 6.1 便宜且诚实的替代（建议做）

**自己算 468 点的包围盒，挑最大那张脸喂给引擎**，并在多检到人时照实上报：

- **不要假设 `multiFaceLandmarks` 按大小排序** —— 这个顺序**没有文档保证**，必须自己算
- 检出 >1 人时对外抛 `faceCount`，UI 明说「已选画面中最大的脸」
- 约 10 行，符合红线 §13-1 的优雅降级（"人脸检测失败 → 兜底"）

---

## 7. 工具层：这是「给 AI 调用」的全部内容

**设计前提（已拍板）**：只做工具层 + 执行器，**不接真 LLM**。
服务端全仓 grep `openai|anthropic|claude|llm|tool_call|completions|…` **零命中**
`[一手·本地代码]`，所以"给 AI 调用"是**新建一层契约**，不是改造现有代码。

### 7.1 放哪

`makeup-engine/tools.js`（**零第三方依赖的纯数据**，可原样递给任何 LLM）
+ `makeup-engine/executor.js`。

### 7.2 工具集

| 工具 | 参数 | → SDK |
| --- | --- | --- |
| `list_makeup_categories` | — | `mk.categories` + `CATEGORIES` 元信息 |
| `list_makeup_patterns` | `{ category }` | `mk.getPatterns()` |
| `apply_makeup` | `{ category, color?, finish?, pattern? }` | `mk.apply()` |
| `clear_makeup` | `{ category }` | `mk.clear()` |
| `clear_all_makeup` | — | `mk.clearAll()` |
| `get_current_look` | — | 执行器自持状态 |
| **`apply_look`** | `{ palette: [{ role, rgb }] }` | **领域桥，见 §7.4** |

**★ 枚举必须从 `categories.js` 现取**（`Object.keys(CATEGORIES)` / `FINISHES` /
每类的 `finishMap`），**不能在 schema 里抄一份** —— 抄一份必然静默漂移。
这正是 `roadmap.md` §2 "枚举只定义一处"那条规矩在客户端的对应物。
`tools.js` 因此 import `categories.js`，但**仍无第三方依赖**。

同理，`pattern` 参数的取值域**只认 §4.1 里那几个可用类目**，schema 里照实写死，
**别把 73 个都列出来**（其中 `lipstick` / `foundation` 的是占位图，
`foundation` 那个还会把底妆抹没）。

### 7.3 执行器：参数是**不可信输入**

`createMakeupExecutor({ mk })` → `{ run(name, args), state }`

**LLM 会瞎编参数，必须在进引擎之前挡掉** —— 这与
`makeup/domain/validators/engine-output.validator.ts` 把关"引擎产物"是同一件事的两端：
**那边守出口，这里守入口。**

| 参数 | 校验 |
| --- | --- |
| `category` | `resolveCategory()`（已处理 `eyeliner→eyeline` / `eye-liner→eyeline` / `eye-shadow→eyeshadow` / `foundationmakeup→foundation` 四组别名）`[一手·本地代码 categories.js:66-71]` |
| `color` | hex 规范化 —— 复用 `OpenMakeup.js:10-16` 的 `normalizeHex`（**提出来共用，别再写一份**） |
| `finish` | 必须 ∈ `FINISHES` ∩ 该类的 `finishMap`；`supportsFinish: false` 的类（`eyeline` / `mascara`）传了就拒 |
| `pattern` | 必须是 1..n 的整数，**n 按 §4.1 的可用数算，且 foundation 一律拒绝** |

每次调用返回结构化结果，供 agent 判断下一步。

### 7.4 `apply_look` —— 接上 `brief → Look{palette}`（§8 ③ 的字面答案）

服务端 `MockEngine` 产出的形状 `[一手·本地代码 mock-engine.ts:112-123]`：

```js
palette: [{ role: '唇', rgb: [188,118,122] }, { role: '颊', … }, { role: '眼影', … }]
```

映射：`唇 → lipstick`、`颊 → blush`、`眼影 → eyeshadow`、`底妆 → foundation`；
`rgb` → hex 复用 `vue/src/utils/color.js` 的 `rgbToHex` `[一手·本地代码]`。

**这一层同时是 `mock` 与真引擎之间的桥**：服务端继续只出参数 —— `Look` 对流水线是不透明的
`Record<string, unknown>`，`look.ts:9` 明说"未来真实引擎换成别的形状即可" ——
**浏览器负责渲染，服务端一行都不用改。**

### 7.5 `AI_SENTINEL` 钩子

`OpenMakeup` 的 `aiColor: async (category) => hex` 正好接同一份 palette ——
工具层不传 `color` 时由它兜底。`lipstick` 的默认色就是 `'ai'` `[一手·本地代码 categories.js:42]`，
官方注释原文：

> *"Sentinel meaning resolve this color from the AI color provider at apply time"*

> 这也是 `ai-engine-makeup-models.md` §2.4a 说"你们的 `brief → describeScene → Look{palette}`
> 那条链可以直接接进这个钩子，**中间零转换**"的**具体落法**。

---

## 8. 分阶段（每阶段可独立停）

| 阶段 | 内容 | 完成标志 |
| --- | --- | --- |
| **P0 抽取** | 建 `makeup-engine/`、打 §2.3 的三个补丁、资源进 `vue/public/openmakeup/`、vite alias + `fs.allow` | vue 里能 import 引擎；最小页面渲染出妆 |
| **P1 静态照片** | `vue/src/makeup/still-frame.js`（§3 的垫片）+ `vue/src/pages/MakeupStudioView.vue`（新路由 `/studio`）+ §6.1 最大脸选择 | 上传照片 → 真妆效上脸；断言 `gumCalls === 0` |
| **P2 工具层** | `tools.js` + `executor.js` + `apply_look` | 手写一串 tool-call 能驱动整张脸；坏参数被拒 |
| **P3 接入结果页** | 导出 PNG（补丁 2）→ `ResultView.vue` 的「真图优先」分支 | 结果页显示真渲染成片而非 CSS 叠加 |
| **P4（可选）** | §4.2 补 blush 分支 / 多人合影 / 第二阶段摘 morph | — |

### 8.1 关键文件

- **新增**：`makeup-engine/{package.json,src/*,tools.js,executor.js}`、
  `vue/src/makeup/*`、`vue/src/pages/MakeupStudioView.vue`
- **修改**：`vue/vite.config.js`（alias + `fs.allow` —— **复刻已有的 `@scene-rules` 跨根做法**）、
  `vue/src/router/index.js`、`vue/package.json`（加 `three`）、`ResultView.vue`（P3）
- **`server/` 一行不动**（引擎在浏览器侧）
- **`.gitignore`**：`tespro/` 保留（上游参考副本），**`makeup-engine/` 必须入库**

### 8.2 关于 P3 的一个判断

`ResultView.vue:137` 的注释原文是「底图：真实引擎产物优先；mock（`resultUrl` 为空）
则用本人照片原图 + `look` 叠加」`[一手·本地代码]` —— **接缝已经留好了。**

但 P3 改的是**产品主流程**，且有一个必须说清的点：

> **引擎在浏览器侧，服务端 `/api/jobs/:id/result` 仍返回原图字节。**

P3 的做法是**前端本地渲染 + 导出 PNG**，**不改服务端**。
代价要认：成品图不进 `ArtifactStore`，没有服务端留档，也进不了将来可能的"妆造间"后端历史
—— 而 `roadmap.md` §12 那条"数字妆造间存哪"的待拍板本来就倾向**本地**，方向一致。

---

## 9. 验证

### 9.1 门禁（沿用 `roadmap.md` §0 已有的两条）

```bash
cd vue && npm run build
# ★ 跨根引用只在 dev 暴露，build 过得去不代表 dev 过得去
#   —— roadmap §0 对 @scene-rules 有同样的告警，本方案的 alias 是同一类
cd vue && npm run dev

cd server && npm run typecheck && npm test    # 本方案未改 server，应保持 120 用例全绿
```

### 9.2 浏览器自动化

`D:\omu-smoke\` 里已有现成的 puppeteer-core 夹具（`test-image-entry.mjs` / `probe-alpha.mjs` 等），
**直接改，别重写**。

| # | 测什么 | 断言 |
| --- | --- | --- |
| 1 | **无摄像头证明** | `evaluateOnNewDocument` 里让 `getUserMedia` 抛错并计数 → `gumCalls === 0` 且出妆 |
| 2 | **像素证明** | 截图 + `canvas.toBlob()` 导出 → 导出 PNG **非空白**（专盯 §2.3 补丁 2） |
| 3 | **工具层** | 跑 `apply_makeup` / `clear_makeup` / `apply_look` → 返回的 `{category,color,finish,pattern}` 与预期一致 |
| 4 | **坏参数** | 非法 category / hex / finish / 越界 pattern / **foundation 的任何 pattern** 各自被拒，且不抛到 UI |
| 5 | **多人合影** | 2 人照片 → 只选一张脸、`faceCount === 2` 被上报 |
| 6 | **0×0 守卫** | 断言 MediaPipe 未 abort（§3.2 那个永久死亡陷阱） |

### 9.3 人工

`npm run dev` → `/studio` → 上传 `vue/public/demo/demo-photo.svg` 与自备照片
→ 逐个类目开妆 / 换色 / 换 finish / 换 pattern。

---

## 10. 风险汇总

| # | 风险 | 级 | 处置 |
| --- | --- | --- | --- |
| 1 | **`assets/` 的 PNG / `face.glb` / shader 来源未声明**（红线 §13-2） | **阻塞提交** | §4.4 三级方案；**开发可用，提交前必须回填** |
| 2 | **不支持一张图两个人**（§6） | 产品限制 | 先做"选最大脸 + UI 照实提示" |
| 3 | **画质是 AR 滤镜级，不是生成式真实感** | 叙事 | §11 |
| 4 | `preserveDrawingBuffer` 未设 → 导出空白 | 已识别 | 补丁 2 |
| 5 | 摘 morph 摘不干净 → 静默改妆效 | 已规避 | §2.4：第一阶段只摘公开面 |
| 6 | **`foundation` 的占位 pattern 会把底妆抹没** | 已识别 | §4.1；工具层直接拒绝 foundation 的 pattern |
| 7 | 22M 静态资源进 git | 取舍 | §5，由红线 §13-1 断网演示倒推 |

---

## 11. 一条必须诚实说清的叙事边界

`ai-engine-makeup-models.md` §2.4a 保留意见 2 已经写过，这里给出**可执行的措辞**：

> `api-spike.md` §1 说的 `wow = 上妆像本人、且自然`，这个 SDK **只满足前半句**。

- **「像本人」很强** —— 妆是画在**真实面部几何**（`face.glb` 网格 + 468 关键点）上的，
  不是贴一张图。这一点比生成式方案更稳，也与 `api-spike.md` §3 那段
  「关键点锚定、保脸不变」的通行路线同源。
- **「自然」偏弱** —— 贴图质感，是 AR 滤镜级，达不到生成式的皮肤质感。
  **不要在任何材料里写"以假乱真"。**

诚实的说法是「**消费级 AR 试妆的实时渲染**」，与 `api-spike.md` §3 对美图算法的措辞口径一致：
可写"开放能力"，**不吹自研、不吹生成式**。

**另有三条它是真能兑现的**（这才是本方案的价值所在，且都不是审美）：

1. **用户自拍不上传** —— 正面解掉红线 §13-4 那个悬空项。
   `api-spike.md` §0.2 原话：「换任何云端引擎，用户自拍仍是上传到第三方」
2. **零显存** —— 绕开 §6.4 实测的"PyTorch 是 CPU-only 构建、ComfyUI 根本没装"两个前置坑
3. **零 API 费用** —— 绕开 §5 整类被关闭的商业 API

> **这三条是本轮唯一一个能同时说出口的方案**，而这个稀缺性**不依赖于画质**。

---

## 12. 未决（需要 owner 拍板）

1. **要不要开工** —— 本文只答"怎么接"，不答"要不要接"
2. **授权怎么走** —— §4.4 三条路选哪条（问作者 / 自绘替换 / 只用内置贴图）
3. **P3 做不做** —— 改不改 `ResultView` 主流程，还是只停在 `/studio` 独立页
4. **§4.2 那个 blush 补丁做不做** —— 收益 +4 个 pattern，代价是改上游行为
5. **4 张占位图怎么处理** —— 保留原样（在工具层拒绝）还是直接删掉
6. **妆容扩展做到哪一层** —— §13 给了四层与推荐顺序，但要做到哪停，得拍

---

## 13. 妆容扩展：能加到哪、每层多贵

> 这一节回答"6 个类目太少"。**核心发现：引擎内部不是 6 个写死的类目，是 4 个可复用的
> shader 族** —— 所以"加一个部位"往往不是写 shader，而是复用一族 + 换一张 UV 遮罩。

### 13.1 四个 shader 族（比对全部 9 个程序的 uniform 面）`[一手·本地代码]`

| 族 | 成员 | 接口 | 加一个新成员要做什么 |
| --- | --- | --- | --- |
| **遮罩色块** | `blush` + `eyeshadow` | **uniform 逐字相同**：`_ShadowColor` / `_EyeShadowTexture` / `_FaceMaskE` / `_noise` / `_transparency` | 换 `_FaceMaskE` 遮罩 + 颜色 |
| **平铺色** | `foundation` | `_Mask` / `_MainColor` / `_Mask_ST` / `_shedat` | 换 `_Mask` + 颜色 |
| **贴图线条** | `eyeline` + `mascara` | `map` + `color`；**顶点着色器 MD5 完全相同**，fragment 只差一行（mascara 多 `offsetUv.y*1.2`） | 换贴图 + 一条 NURBS/quad |
| **屏幕空间后处理** | `bluremask` | 读 `tScene`（已渲染场景）+ `tMask` + `transmission` | 换 `tMask` |

（`lip` 自成一体：`_shine` / `_lipOpen` / `_bright` / `_gradientSize` 加开闭口两张贴图，
是一个真唇部渲染器，不属任何一族。）

**区域遮罩是独立资源**，躺在 `assets/shaders/` 根下，目前三张：

| 遮罩 | 服务 | 位置 |
| --- | --- | --- |
| `foundation_mask.PNG` | **blush**（不是 foundation！） | `materials.js:184` |
| `foundation_mask2.PNG` | eyeshadow | `materials.js:149` |
| `foundation_mask3.PNG` | blur pass | `materials.js:27` |

> ⚠️ **命名已在误导人**：叫 `foundation_*` 的三张里，没有一张服务 foundation。
> 加新类目前得先定遮罩放哪、怎么命名。

### 13.2 blush 是"加同族成员"的存在性证明

blush 内部**已经完整存在**：`blushMesh` + `blushMat` + `setAR` 分支 + 独立遮罩
+ `_EyeShadowTexture` sampler —— 只差 `setPattern` 分支与公开暴露（即 §4.2）。
**换句话说，"加一个遮罩色块族成员"这条配方，上游自己已经跑通过一遍了。** 完整的 7 步：

1. 一张区域遮罩 PNG（1024×1024 灰度 UV）→ `assets/shaders/`
2. `materials.js` 加 `loadXxxMat()` —— 可照抄 `loadBlushMat`，只换遮罩与 sampler 初值
3. `_loadFaceAndMaterials()` 里 `new Mesh(mesh.geometry, mat)` + `renderOrder` / `position.setZ()`
   —— **共享同一份 `face.glb` geometry**，不新增模型
4. `setAR()` 加分支（设 `_ShadowColor`，按 colorMode 设 `_noise`）
5. `categories.js` 加类目条目
6. `setPattern()` 加分支（可选）
7. `clearAll()` / `clearPart()` 各加两行

**层高（`renderOrder` / `position.z`）有富余**：blur 0(z0) → faceVideo 1(z0.5) →
foundation 1(z1) → blush 2(z2) → lip 3(z3) / eyeshadow 3(z3) → eyeline 14(z15) →
mascara 15(z50)。中间插层位很宽。

### 13.3 四层扩展

#### 层 1 — 零引擎改动（现在就能做）

- **颜色**：`_ShadowColor` / `_MainColor` 是 vec4，全色域自由
- **finish**：每类 2–4 种视觉模式，走 `_noise` / `_shine` / `_bright`
- **pattern 自己生成** —— 见 §4.4 第 2 条：造遮罩**同时解掉授权问题**（自绘即自有）
- **组合**：6 类可同时开，Z 分层已排好

#### 层 2 — ★ 已写好、只差接上（最低垂的三颗）

| 能力 | 现状 | 成本 |
| --- | --- | --- |
| **blush 的 4 张 pattern** | 内部全齐，只缺 `setPattern` 一个分支（§4.2） | **4 行** |
| **美瞳（瞳色）** | `MakeupEngine.js:471-473` 有 `if (arType === 'lens') { // reserved }`；且 `config.js:23` 的 `refineLandmarks: true` **已经开着** | 遮罩/圆盘 mesh，中 |
| **磨皮 / 柔焦** | `bluremask` shader 已写好；`MakeupEngine.js:327` `visible = false`；**`setBlur()` 已经完整暴露在公开 API**（`OpenMakeup.js:200-202`） | **一次调用**（但见下） |

**美瞳这条值得单说**：我把引擎里所有地标索引扫了一遍，**最大用到 467**
（`FaceMeshModelController.js` / `FaceNurbsModelController.js`）—— 也就是说
`refineLandmarks: true` 正在产出的 **478 点里，468–477 那 10 个虹膜点全被丢掉了。
数据是白扔的。** 而 `lens` 在 `categories.js` 的 6 类里**并不存在** ——
作者在引擎里留了位子、公开 API 却没暴露。中国美妆用户的预期里美瞳是标配类目。

**磨皮的风险要说清**：`setBlur(true)` 是一行，但上游注释原文是
`// off by default — it was covering the warp/face`
—— **作者做了、没调通、留着了。** 所以成本低而风险高，得先截图看它到底糊成什么样。

#### 层 3 — 同族新部位（不用写 shader）`[推测]` 每个 1–2 天

| 新部位 | 落哪族 | 要做什么 |
| --- | --- | --- |
| **眉** | 贴图线条（最便宜） | 与 eyeline 同一个 shader，换贴图 |
| **修容 / 高光** | 遮罩色块 | 与 blush uniform 逐字相同，换 `_FaceMaskE` + 颜色 |
| 卧蚕 / 眼头提亮 | 遮罩色块 | 同上 |
| 唇线 | 贴图线条 | 同上 |
| 遮瑕 / 素颜霜 | 平铺色 | 与 foundation 同构 |

**眉是最该加的那一个** —— 现在的 6 类恰好是"底妆 + 腮红 + 唇 + 眼影 + 眼线 + 睫毛"，
**唯独少了脸上面积最大、最影响"得体"的那一块**。一套重要场合的得体妆缺眉就是不对的，
而它是全表最便宜的。

#### 层 4 — 真正的新能力

- **遮瑕 / 肤色均匀**：需要肤色估计 + 局部提亮，要新 shader

#### 加不了的（别吹）

- **皮肤质感 / 毛孔 / 重打光** —— 生成式的活，AR 贴图做不到
- **发型 / 发色** —— 不在面部网格上

### 13.4 推荐顺序

| # | 做什么 | 成本 | 风险 | 为什么是这个位置 |
| --- | --- | --- | --- | --- |
| 1 | **blush 接线**（§4.2） | 4 行 | 低 | 顺手，且它是层 3 那批的配方验证 |
| 2 | **眉** | ~2 天 | 低 | 最便宜的"补全一套妆"；缺它不是审美问题 |
| 3 | **修容 + 高光** | ~2–3 天 | 低 | 同族，与 blush 同构，一次做两个 |
| 4 | **美瞳** | ~2–3 天 | 中 | 有 reserved 位子 + 虹膜数据已在算 + 用户预期 |
| 5 | **磨皮** | 1 行起 | **高** | 对「体面」最值钱，但作者自己关了它 |
| 6 | 卧蚕 / 唇线 / 遮瑕 | — | — | 有余力再说 |

**1–3 是稳的，4 有回报，5 要先验证。** 全部不碰 §2.4 那条危险的 morph 路径。

### 13.5 ★ 但"妆容不够"的正解在工具层，不在引擎

**引擎给的是零件，不是妆容。** 6 类 × 任意色 × 4 finish × N pattern 已经是组合爆炸。
缺的是"**这个场合该画什么**"那一层 —— 那是 `brief → Look{palette}`，
**100% 我们的代码，0% 引擎**。

服务端 `MockEngine` 已经在产 palette 了，但**只有 3 个 role（唇 / 颊 / 眼影），
且不带 finish 与 pattern**。所以：

> **把 `palette` 从 3 个 role 扩到 6 个，每个 role 带 finish 与 pattern 建议。**

改完之后，需求侧想加多少"妆容"（面试妆 / 正式妆 / 晚宴妆 / 见家长妆……）
**都不用碰引擎一行**。而这条路正踩在项目定位上：价值在「**这个场合该这样**」，
不在「颜色更多」。

**结论：先做 §13.4 的 1–3（把零件补到"一套妆"完整），再回头看要不要加类目。
类目不是瓶颈，`palette` 的维度才是。**

### 13.6 两个可疑处

1. **`MakeupEngine.js:487`：eyeshadow 的 `_noise` 在 colorMode `'7'` 时是 `7`**，
   而 foundation（`:461`）/ blush（`:468`）都是 **`0.7`**。同一张 `finishMap` 映射出来
   差 10 倍，**疑似漏了小数点** —— 会让珠光眼影的噪点强度不对。
   `[推测]`，值得单独截一张图确认再动。
2. **`foundation_mask{,2,3}.PNG` 的命名**（见 §13.1）—— 新类目开工前先定规范。

---

## 附：本文引用到的本地证据

| 结论 | 文件 : 行 |
| --- | --- |
| `maxNumFaces: 1` | `tespro/src/config.js:22` |
| 硬编码 `multiFaceLandmarks[0]` | `tespro/src/core/MakeupEngine.js:429` |
| `cameraClass`/`faceMeshClass` 注入口 | `tespro/src/core/MakeupEngine.js:103`、文件头 `:55-58` |
| 公开构造函数漏传注入 | `tespro/src/OpenMakeup.js:57-67` |
| `WebGLRenderer` 缺 `preserveDrawingBuffer` | `tespro/src/core/MakeupEngine.js:204-208` |
| `setPattern()` 只有 4 个分支 | `tespro/src/core/MakeupEngine.js:534-550` |
| `setAR()` 已处理 blush（含 `_noise` 三值） | `tespro/src/core/MakeupEngine.js:464-469` |
| `blushMat` 已存在 | `tespro/src/core/MakeupEngine.js:127, 332-334` |
| 妆容 mesh 共享 geometry | `tespro/src/core/MakeupEngine.js:279-403` |
| `_resolveMediaPipeClasses()` 缺类即抛错 | `tespro/src/core/MakeupEngine.js:179-188` |
| `_setupCamera()` | `tespro/src/core/MakeupEngine.js:413-421` |
| `VideoTexture(this.video)` | `tespro/src/core/MakeupEngine.js:211` |
| `_sizeToVideoBox()` 的 contain 逻辑 | `tespro/src/core/MakeupEngine.js:222-271` |
| `loadBlushMat` 暴露 `_EyeShadowTexture` | `tespro/src/core/materials.js:200` |
| `blush/fragment.glsl` 的 sampler 名 | `tespro/assets/shaders/blush/fragment.glsl:12` |
| 游离顶层 `tMask` | `tespro/src/core/materials.js:37, 39` |
| `AI_SENTINEL = 'ai'` | `tespro/src/categories.js:17, 42` |
| 类目别名表 | `tespro/src/categories.js:66-71` |
| `normalizeHex` | `tespro/src/OpenMakeup.js:10-16` |
| `assetsBaseUrl` 可配三形态 | `tespro/src/config.js:9-19` |
| `send()` 收静态图 | `tespro/public/mediapipe/face_mesh/index.d.ts:81` |
| `maxNumFaces` 是 MediaPipe 选项 | `tespro/public/mediapipe/face_mesh/index.d.ts:199` |
| 服务端 `Look` 不透明 | `server/src/modules/makeup/domain/entities/look.ts:9` |
| `MockEngine` 的 palette 形状 | `server/src/modules/makeup/infrastructure/engine/mock-engine.ts:112-123` |
| 出口校验器 | `server/src/modules/makeup/domain/validators/engine-output.validator.ts` |
| 结果页"真图优先"接缝 | `vue/src/pages/ResultView.vue:137` |
| §3 的实测来源 | `tespro/image-test.js`（**未提交，属本地上游副本**） |

**§13 新增：**

| 结论 | 文件 : 行 |
| --- | --- |
| shader 族划分（9 个程序 uniform 面比对） | `tespro/assets/shaders/*/fragment.glsl` |
| eyeline 与 mascara 顶点着色器 MD5 相同 | `tespro/assets/shaders/{eyeline,mascara}/vertex.glsl`（`d8fbace9…`） |
| 三张区域遮罩 | `tespro/assets/shaders/foundation_mask{,2,3}.PNG` |
| 遮罩服务对象（blush / eyeshadow / blur） | `tespro/src/core/materials.js:184, 149, 27` |
| `lens` 保留位 | `tespro/src/core/MakeupEngine.js:471-473` |
| `setBlur()` 已暴露在公开 API | `tespro/src/OpenMakeup.js:200-202` |
| blur 默认关闭（"it was covering the warp"） | `tespro/src/core/MakeupEngine.js:327` |
| `refineLandmarks: true` | `tespro/src/config.js:23` |
| 地标最大索引 467 → 虹膜 468–477 未被使用 | `tespro/src/core/FaceMeshModelController.js`、`FaceNurbsModelController.js` |
| eyeShadow `_noise = 7`（疑漏小数点） | `tespro/src/core/MakeupEngine.js:487`，对照 `:461` / `:468` 的 `0.7` |
| Z 分层（renderOrder / position.z） | `tespro/src/core/MakeupEngine.js:218, 297-298, 325-326, 335-336, 345-346, 355-356, 365-366, 375-381, 390-395` |
