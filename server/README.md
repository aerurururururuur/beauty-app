# 场合美妆后端（server/）

TypeScript + **模块化清洁架构**的后端：`src/modules/*` 按功能拆模块，模块内部走 domain ← application ← presentation、`infrastructure` 只实现模块内 `domain/ports`；模块间只经各模块 `index.ts`(public barrel)协作。目前场景理解 / 参考检索 / 上妆引擎均为 mock，接口留作接缝，换真实实现不改业务层。

产品定位（赛道 3 · 无界体验家）：为「重要场合」配得体妆容——输入是**本人照片 + 需求简报 brief**（occasion 场合 / 肤质 / 肤色 / 穿搭 / 天气 / 自由文字）。0..6 张「氛围参考图」保留但**降级为可选、不驱动成片**，仅回显。

## 技术栈

- Node.js ≥ 22、TypeScript（ESM + NodeNext）
- Fastify 5（+ `@fastify/cors` / `@fastify/multipart`）
- zod（运行时校验的形状底座）
- Vitest（单测）

## 分层与目录

依赖单向向内，只有组装根(`src/index.ts` + 各模块 `compose.ts`)认识全部实现；模块内部 domain 不依赖框架 / IO。

```
presentation → application → domain         # 模块内部的分层方向
infrastructure ── 实现 ──► domain/ports
modules ── public barrel ──► modules         # 模块间只经各 index.ts,禁止直达内部文件
```

```
src/
├── index.ts                 # 组装根:loadConfig → 各模块 createXxxModule → buildApp → 启停
├── app.ts                   # Fastify web shell:cors / multipart / 错误码→HTTP / 挂 /api 路由
└── modules/                 # ★ 按功能拆模块;模块内部 domain/application/presentation/infrastructure
    ├── shared/              # 地基:brief 枚举单源 / ImageRef·EngineSourceImage / AppError(+ compose)
    ├── assets/              # 图片存储:ArtifactStore 端口 + 本地文件系统实现
    ├── understanding/       # 场景理解:SceneAnalysis + 分析器端口 + mock(occasion/关键词→方向)
    ├── references/          # 参考妆面检索:ReferenceImage + 提供器端口 + mock(自绘授权诚实)
    ├── makeup/              # 上妆引擎:Engine 端口 + Look/ResultText + narration + 输出校验 + mock 引擎
    ├── jobs/                # Job 生命周期 + 流水线编排:状态机 / 仓库 / 队列 / 用例 / 控制器 / JobView DTO
    ├── weather/             # [空壳] 天气拉取端口(骨架未 wire)
    └── recommendations/     # [空壳] 平价同款推荐端口(骨架未 wire)
```

每个模块 = `index.ts`(public barrel,跨模块协作只走它) + `compose.ts`(`createXxxModule` 组合根) + 模块内四层；
`shared` 只被依赖;`jobs` 是编排者,依赖 assets / understanding / references / makeup 的公开端口与工具。
**每个模块下都有 `README.md`**：一句话职责、目录/依赖、现状、怎么改（含空壳模块的待办），接手前先读。

### brief —— 输入的唯一结构化载体

`modules/shared/domain/entities/brief.ts` 是枚举单源，schema / validator / 测试共用：

| 字段 | 枚举 / 约束 | 说明 |
| --- | --- | --- |
| `occasion` | `interview` 面试 / `date` 约会 / `stage` 上台 / `family` 见家长 / `daily` 日常兜底 | 主风格信号，直进 domain |
| `sceneText` | ≤2000 字 | 自由文字自定义需求 |
| `skinType` | `dry`/`oily`/`combination`/`sensitive`/`neutral` | 肤质（持妆策略） |
| `skinTone` | `light`/`light_medium`/`medium`/`tan`/`deep` 5 档 | **缺省默认 `medium`（中间档）**，不默认浅肤色审美 |
| `dress` | ≤80 字 | 穿搭一句话（风格 + 主色） |
| `weather` | `{ condition?, temperatureC?, humidityPct?, uvIndex? }` | 当日天气（骨架先手动预设，实拉在 W2） |

### schema vs validator

- `jobs/domain/schemas` 只声明**形状**：字段结构、枚举取值、类型、长度上限——没有跨字段规则，不做动作。
- `jobs/domain/validators`（+ 校验输出的 `makeup/domain/validators`）才是**做校验行为的对象**：输入侧把 multipart 的 `metaRaw` JSON 解析 + 形状校验 + 业务规则一并执行，失败映射成语义错误码；输出侧把关外部引擎产物。

| 校验器 | 模块·位置 | 行为 |
| --- | --- | --- |
| `jobs/domain/validators/job-submit.validator.ts` | 输入 | face 单张、scene ≤6；`metaRaw` JSON 坏/越界枚举 → `VALIDATION_ERROR`；无 `occasion` 且无 `sceneText` → `CONTEXT_REQUIRED`；清洗 `sceneText`/`dress` 后产出 `SubmitJobInput { face, scenes, brief }` |
| `jobs/domain/validators/job-id.validator.ts` | 输入 | 路径参数 `:id` 格式，非法抛 `VALIDATION_ERROR` |
| `makeup/domain/validators/engine-output.validator.ts` | 输出 | 把关引擎产物：成品路径/类型存在；`look.zones/palette` 若声明则坐标/比例 `0..1`、RGB `0..255`、`opacity 0..1`、`blur ≥ 0`，非法抛 `INTERNAL_ERROR`（任务置 failed） |

### Job 聚合与进度

状态机 `queued → running → done | failed`，步骤单调推进：

| step | progress |
| --- | --- |
| `queued` | 0 |
| `scene_understand` | 20 |
| `reference_gather` | 40 |
| `makeup_generate` | 70 |
| `store_result` | 100(done) |

流水线语义：`SceneAnalyzer` 按 `brief.occasion`（或 `brief.sceneText` 关键词命中，否则 `daily` 兜底）产出 `SceneAnalysis{ label, direction, tags, confidence, source }`；`ReferenceProvider` 按 label 取场合样本；`Engine` 按 **occasion 基准风格 × skinTone 调深浅** 生成 `Look`（含 `zones` 供前端 CSS 叠加）。标识符沿用 `scene` 词（中文「场景/场合」皆可），语义已场合化。

## HTTP 契约（全部挂 `/api` 前缀）

契约类型唯一真源在 `modules/jobs/domain/api/job-view.ts`。

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /api/jobs` | multipart：`face`(1 张，必填)、`scene`(0..6，可选氛围参考图)、`meta`(JSON 简报，字符串标量)。`brief` 含 `occasion` 或 `sceneText` 至少其一 → **202** `{ id, status, progress, step }` |
| `GET /api/jobs/:id` | 任务视图 `JobView`，轮询到 `status: done`；`inputs` 回显 `brief`，含 `scene` / `references` / `result` |
| `GET /api/jobs/:id/result` | 成品图片字节流（带 Content-Type）。骨架 mock 引擎把本人照片原样收编为产物并返回 `resultUrl`；纯浏览器 mock（无后端）的 `resultUrl` 为空，预览由前端按 `look.zones` CSS 叠加 |
| `GET /api/health` | 存活检查 `{ ok, name, uptimeSec, now }` |

### 错误体（与错误码 → HTTP 映射）

统一 `{ error: { code, message, details? } }`：

| 错误码 | HTTP | 触发 |
| --- | --- | --- |
| `JOB_NOT_FOUND` | 404 | 任务不存在 |
| `JOB_NOT_READY` / `JOB_FAILED` | 409 | 任务未就绪 / 已失败 |
| `FACE_REQUIRED` | 422 | 未上传本人照片 |
| `CONTEXT_REQUIRED` | 422 | 既无 occasion 也无自由文字 |
| `SCENES_MAX_EXCEEDED` | 422 | 氛围参考图 >6 |
| `VALIDATION_ERROR` | 422 | meta JSON 非法 / 枚举越界 / face>1 等 |
| `INTERNAL_ERROR` | 500 | 引擎输出不过关等内部错误 |
| 框架级（如文件超限） | 保留原状态码(413) | — |

### 提交示例

```bash
curl -s -F "face=@../vue/public/demo/demo-photo.svg" \
     -F "scene=@../vue/public/demo/scenery.svg" \
     -F 'meta={"occasion":"interview","sceneText":"正式终面","skinType":"combination","skinTone":"tan","dress":"西装·藏青","weather":{"condition":"晴","temperatureC":24,"humidityPct":45,"uvIndex":3}}' \
     http://localhost:3000/api/jobs
```

> `face` 必填；`scene` 可省；`meta` 可省 `occasion`，但至少要带 `sceneText`（或用文字关键词）。curl 不带 `Content-Type` 时会按扩展名兜底推断为图片类型。

## 配置（env）

`.env.example` → `.env`（已 ignore）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATA_DIR` | `./data` | 任务记录 + 输入/产物文件目录 |
| `MAKEUP_ENGINE` | `mock` | `mock`（未来 `parametric`/`third-party`） |
| `SCENE_ANALYZER` | `mock` | `mock`（或 `off`） |
| `REFERENCE_PROVIDER` | `mock` | `mock`（或 `off`） |
| `MAX_UPLOAD_MB` | `25` | 上传体积上限 |

## 命令

```bash
npm run dev        # tsx watch 开发
npm run build      # tsc 编译到 dist/
npm run start      # node dist/index.js
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

## 测试

`test/` 用内存假端口（`helpers/fakes.ts`）跑用例，外加 validator 形状/行为用例：

- `job-state.test.ts` — Job 状态机 / 步骤迁移
- `submit-job.test.ts` / `run-pipeline.test.ts` — 用例端到端（假端口；brief 驱动 occasion→look）
- `schemas.test.ts` — 纯形状（结构/格式/长度/严格模式）
- `validator.test.ts` — 输入业务规则码（含 CONTEXT_REQUIRED / meta JSON） + 输出几何/颜色把关
- `mock-engine.test.ts` — 调色行为：occasion 换风格、skinTone 深色加深、缺省取 medium

## 换真实引擎怎么做

任选其一实现对应 port，再到所属模块的 `compose.ts` 里换实现即可，无需改动模块内的业务层：

- 真实上妆引擎：实现 `modules/makeup/domain/ports/engine.ts` 的 `generate()`，产物仍交给 `makeup/domain/validators/engine-output.validator.ts` 把关；
- 真实场景理解：实现 `modules/understanding/domain/ports/scene-analyzer.ts`（视觉大模型），输入里带着 `brief`；
- 真实参考检索：实现 `modules/references/domain/ports/reference-provider.ts`（网页/图库），需遵守授权条款并回填 `license`/`sourceUrl`。

> **素材红线**：参考样本当前为自绘演示示意，license 诚实标注、`sourceUrl` 置空；正式稿须替换为可授权素材并逐张回填来源，不抓取网络图。
