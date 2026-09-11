# AI 上妆引擎 · 选型分析与 API 实测规范（可派单 · 学生预算版）

> 对应 roadmap §6（上妆引擎拍板）与 §13 待拍板第 1 条。
> 目的：在一周内用**真实厂商调用**验证一条「上妆像本人、且自然」的引擎路线，
> 产出可复用的离线回归夹具，然后把这单「真实 API 的 dirty 测试」干净地交给别人。
>
> 日期：2026-09-09 · 预算是学生档（≈¥0，且**没有企业主体**）；价格/额度/接入形态以注册当日厂商文档为准，本文只给量级与判断口径。

---

## 1. 一句话结论（先测哪个）

**主选 = Perfect Corp YouCam「AI Copy Makeup / Makeup Transfer」REST API。**

它是「把一张参考妆**整体复刻**到另一张本人脸上」的语义最贴 API，而且**个人邮箱注册即开、不需要公司/营业执照**——对学生是硬门槛的胜负手：

1. **不要企业认证**：国际开发者平台，个人注册 → 直接送免费单元（Copy Makeup ≈2 单元/张，常见推广码 500~1000 单元）。hackathon 量级**不用真花钱**，只有要超量才 $24/月。
2. **语义最贴**：输入本人照 + 一张参考妆照 → 输出「妆在本人脸上」——正好是我们的 references → makeup 两段。
3. **保留本人脸**：渲染在用户自己的面部特征上进行，不是重画一张脸 → 贴合 §6 wow = 像本人且自然。
4. **async task 模型**：`POST task → 轮询 → 取图`，跟我们 jobs 流水线同构；`Engine` 端口 2 个成员即可接住。
5. **大陆直连需实测**（§4.7 第 0 步）——这是本方案唯一要赌的点；不通就预录 + 切本地兜底，别让它卡死 demo。

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

---

## 4. 交给别人的 dirty 测试规范

> 下面整段可以原样转给接手的人。目标是在**¥0 预算 + 无企业主体 + 不触红线**内，把 Perfect Corp Copy Makeup 真实跑通，
> 交付：① 质量评分表 ② 免费单元够不够 / 每张延迟 ③ 边界用例行为 ④ record/replay 夹具（把真实调用变成离线回归）。

### 4.1 任务边界（接手人职责）

1. 注册 Perfect Corp（yce.perfectcorp.com/ai-api）→ 拿 key + 免费单元。**同时试注册美图**（ai.meitu.com）：若卡企业认证，记一行「卡企业」就停，**不去找中转**（§1.1 已核查无可靠免企业中转）。
   - 产物：key 写进本地 `.env`（**不要提交**），登记各自剩余免费额度。
2. 搭**一次性脚本**（放 `server/scripts/engine-spike/`，跑完即用）：
   - 输入：一张夹具人脸 + 一张夹具参考妆照 → 输出：成品图到 `tmp/` + 一行结构化日志（接口名、耗时 ms、单元消耗、成功/错误）。
   - 先单测「鉴权 + 上传 + 建 task + 轮询 + 下载」链路通，再上循环。**精确入参以厂商文档为准**（Copy Makeup 怎么传 source look + target face）。
3. 按 §4.2 夹具集、§4.3 矩阵跑，逐张填 §4.4 评分表。
4. 对每张结果：跑现有 `engine-output.validator`，记下外部产物是否被守门拦下（拦下 = 厂商返回怪形状 or 我们 validator 过严，要排查）。
5. 把表现最好的一批真实请求存为夹具（§4.5），做成 `record-replay` 离线回归。
6. 交回：评分表 + 单元/延迟记录 + 结论一句话（「Copy Makeup 达标 / 不达标，建议退到 X」）。

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
- 不达标就如实写「不达标 + 建议」——**别为了好看挑图**，那是给 demo 埋雷。

---

## 5. 决策树（拍板时用）

```
网络可达性(venue)实测通 且 Copy Makeup 5档肤色达标 ──► 定版 copy engine(预录 demo + mock 兜底)
├─ 质量达标但网络不稳 ───────────────────────────► copy engine 预录作 wow,mock 现场兜底
├─ 质量不达标 ─────────────────────────────────► 有企业主体? 是→美图复测; 否→自研分支① 或 简化 demo
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
