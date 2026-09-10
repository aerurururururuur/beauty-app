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
    ├── shared/              # 地基:brief 枚举单源 / scene-rules(场合语义·前后端单一源) / AppError(+ compose)
    ├── assets/              # 图片存储:ArtifactStore 端口 + 本地文件系统实现
    ├── understanding/       # 场景理解:SceneAnalysis + 分析器端口 + mock/off(判定实现在 shared/scene-rules)
    ├── references/          # 参考妆面检索:ReferenceImage + 提供器端口 + mock(自绘授权诚实)
    ├── makeup/              # 上妆引擎:Engine 端口 + Look/ResultText + narration + 输出校验 + mock 引擎
    ├── jobs/                # Job 生命周期 + 流水线编排:状态机 / 仓库 / 队列 / 用例 / 控制器 / JobView DTO
    ├── user/                # 账号:昵称+密码(scrypt 哈希,不存明文) / 注册·登录核对·查档案 + JSON 落盘
    ├── weather/             # 当日天气:open-meteo 实拉(无 key)+ WMO 码映射 + mock 兜底 + 查询校验
    ├── cabinet/             # 衣橱:用户自己的化妆品(名称 + 自定义特性),按 userId 归属 + 归属校验 + JSON 落盘
    └── recommendations/     # [空壳] 平价同款推荐端口(骨架未 wire);「已拥有品」将来取自 cabinet
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
| `weather` | `{ condition?, temperatureC?, humidityPct?, uvIndex? }` | 当日天气，整块 `.optional()`：前端拉不到就**整个省掉**（无手动预设可填，不吃假数据） |

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

流水线语义：`SceneAnalyzer` 按 `brief.occasion`（或 `brief.sceneText` 关键词命中，否则 `daily` 兜底）定 `label`，**再叠一层自由文字里的修饰词**（低调 / 加浓 / 利落 / 温柔 / 提气色 → 追加 tags + 在 `direction` 后接一句），产出 `SceneAnalysis{ label, direction, tags, confidence, source }`；`ReferenceProvider` 按 label 取场合样本；`Engine` 按 **occasion 基准风格 × skinTone 调深浅** 生成 `Look`（含 `zones` 供前端 CSS 叠加）。标识符沿用 `scene` 词（中文「场景/场合」皆可），语义已场合化。

> 修饰词**只改 `direction`/`tags`（文案与前端 chip），不改 `label`、不动色板** —— 判定结果与妆效与从前一致。
> 判定规则是前后端单一源（`shared/domain/scene-rules.ts`），前端浏览器 mock 模式直读同一份。详见 `modules/shared/README.md` 与 `modules/understanding/README.md`。

## HTTP 契约（全部挂 `/api` 前缀）

契约类型唯一真源在 `modules/jobs/domain/api/job-view.ts`。

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /api/jobs` | multipart：`face`(1 张，必填)、`scene`(0..6，可选氛围参考图)、`meta`(JSON 简报，字符串标量)。`brief` 含 `occasion` 或 `sceneText` 至少其一 → **202** `{ id, status, progress, step }` |
| `GET /api/jobs/:id` | 任务视图 `JobView`，轮询到 `status: done`；`inputs` 回显 `brief`，含 `scene` / `references` / `result` |
| `GET /api/jobs/:id/result` | 成品图片字节流（带 Content-Type）。骨架 mock 引擎把本人照片原样收编为产物并返回 `resultUrl`；纯浏览器 mock（无后端）的 `resultUrl` 为空，预览由前端按 `look.zones` CSS 叠加 |
| `POST /api/users` | JSON `{ nickname, password }` → **201** `UserView{ id, nickname, createdAt }`(昵称唯一；密码只存 scrypt 凭据) |
| `POST /api/users/login` | JSON `{ nickname, password }` → **200** `UserView`；不符 → 401 `INVALID_CREDENTIALS`。**只核对，不签发 token**（登录态未做） |
| `GET /api/users/:id` | 账号档案 `UserView`(响应**永不含密码/凭据**) |
| `GET /api/weather` | `?city=北京` 或 `?lat=39.9&lon=116.4` → `WeatherView{ source, place, condition, temperatureC, humidityPct, uvIndex }`。前端只取 `condition/temperatureC/humidityPct/uvIndex` 四字段填进 `POST /jobs` 的 `meta.weather`（`place`/`source` 是回显元信息，**不进 meta**——weather schema 是 `.strict()`）；失败就不填 |
| `POST /api/cabinet/items` | JSON `{ userId, name, attributes? }` → **201** `CosmeticItemView`。`attributes` 是 `{label,value}[]` 的**自定义**键值（≤12 条，标签去重），名称 ≤40 字 |
| `GET /api/cabinet/items?userId=` | → **200** `{ items: [...] }`（按建档时间升序；**只回该用户的**） |
| `PATCH /api/cabinet/items/:id` | JSON `{ userId, name?, attributes? }` → **200** `CosmeticItemView`。两者**至少给一个**（都不给 = 空操作，直接 422） |
| `DELETE /api/cabinet/items/:id?userId=` | → **204** 无响应体。归属走**查询串**（DELETE 带 body 会被不少代理丢掉） |
| `GET /api/health` | 存活检查 `{ ok, name, uptimeSec, now }` |

> 衣橱的 `userId` 由客户端显式传（本轮无登录态、不签发 token）。**改 / 删一律校验归属**：
> 条目不存在与不属于你**共用** `CABINET_ITEM_NOT_FOUND` / 404，不泄露「这条存在但不属于你」。

### 错误体（与错误码 → HTTP 映射）

统一 `{ error: { code, message, details? } }`：

| 错误码 | HTTP | 触发 |
| --- | --- | --- |
| `JOB_NOT_FOUND` | 404 | 任务不存在 |
| `JOB_NOT_READY` / `JOB_FAILED` | 409 | 任务未就绪 / 已失败 |
| `FACE_REQUIRED` | 422 | 未上传本人照片 |
| `CONTEXT_REQUIRED` | 422 | 既无 occasion 也无自由文字 |
| `SCENES_MAX_EXCEEDED` | 422 | 氛围参考图 >6 |
| `LOCATION_REQUIRED` | 422 | 天气查询既没给 city 也没给 lat/lon |
| `CITY_NOT_FOUND` | 404 | 城市名解析不到坐标 |
| `WEATHER_UNAVAILABLE` | 502 | 上游天气源超时 / 断网 / 返回体不合预期（前端据此**整个不带 `weather` 提交**，不阻塞提交；没有手动预设这条回落路） |
| `USER_NOT_FOUND` | 404 | 账号 id 不存在（含衣橱归属指向不存在的用户） |
| `CABINET_ITEM_NOT_FOUND` | 404 | 衣橱条目不存在**或不属于你**（两者共用，不泄露存在性） |
| `CABINET_FULL` | 409 | 单用户衣橱超过 100 件 |
| `NICKNAME_TAKEN` | 409 | 昵称已被占用（唯一） |
| `INVALID_CREDENTIALS` | 401 | 昵称或密码不正确（两者共用，不泄露账号是否存在） |
| `VALIDATION_ERROR` | 422 | meta JSON 非法 / 枚举越界 / face>1 / 昵称密码不合规等 |
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

账号（JSON 体，注意 `Content-Type: application/json`）：

```bash
curl -s -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' \
     -d '{"nickname":"小美","password":"hunter2"}'        # → 201 { id, nickname, createdAt }
curl -s -X POST http://localhost:3000/api/users/login -H 'Content-Type: application/json' \
     -d '{"nickname":"小美","password":"hunter2"}'        # → 200 同一视图；密码错 → 401
```

> 密码**不做 trim**（空格是密码的一部分），昵称会 trim，清洗后 2–32 字；密码 6–128 位。

## 配置（env）

`.env.example` → `.env`（已 ignore）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATA_DIR` | `./data` | 任务记录、输入/产物文件、账号表（`users/users.json`）与衣橱表（`cabinet/items.json`）的根目录 |
| `MAKEUP_ENGINE` | `mock` | **尚未接线**（`createMakeupModule()` 还不收参数）：`off` 对「上妆引擎」没有意义——没有引擎就出不了成品，硬接只会得到又一个假开关。接真实引擎时再接。 |
| `SCENE_ANALYZER` | `mock` | `mock` 或 `off`(**已接通**,见 `understanding/compose.ts`)。`off` = **不推断**，不是关掉这一棒（流水线强依赖 `scene`） |
| `REFERENCE_PROVIDER` | `mock` | `mock` 或 `off`(**已接通**,见 `references/compose.ts`)。`off` 返回空列表且**不声称任何来源** |
| `WEATHER_PROVIDER` | `open-meteo` | `open-meteo`（无 key 实拉）或 `mock`（离线示意，**现场断网演示前切**） |
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
- `user.test.ts` — 注册/重名/登录成败/查档案 + 真实 JSON 仓库与 scrypt 凭据（守「明文不落库、视图不含凭据」）
- `weather.test.ts` — WMO 码映射 / 查询校验 / 用例错误翻译 + open-meteo 适配器（**打桩 fetch，单测不联网**）
- `understanding.test.ts` — 场合判定行为不变（0.92/0.72/0.4/0.3 四档 + 优先级表）+ **自由文字真的进方向**（修掉的短路）+ 修饰词去重不发散 + **红线:「显白」不被采纳** + 单一源完整性（`SCENE_RULES`/`SCENE_MATCH_ORDER` 覆盖 `OCCASIONS` 全集、共享文件**零运行时 import**、前端 alias 确实指向它）+ mock 与 off 适配器
- `cabinet.test.ts` — 衣橱边界（空名 / 超长 / 特性重名 / 控制字符 / 空更新）+ 用例（用户不存在 → `USER_NOT_FOUND`、超上限 → `CABINET_FULL`）+ **越权改删 → 报 404 且原数据一个字没动** + 真实 JSON 仓库 `mkdtemp` 验「重启后还在」

## 换真实引擎怎么做

任选其一实现对应 port，再到所属模块的 `compose.ts` 里换实现即可，无需改动模块内的业务层：

- 真实上妆引擎：实现 `modules/makeup/domain/ports/engine.ts` 的 `generate()`，产物仍交给 `makeup/domain/validators/engine-output.validator.ts` 把关；
- 真实场景理解：实现 `modules/understanding/domain/ports/scene-analyzer.ts`（视觉大模型），输入里带着 `brief`；在 `understanding/compose.ts` 把 `kind` 扩成 `'mock' | 'vision' | 'off'`。**留着 `off` 当逃生门**——现场模型翻车时一个环境变量就能退回「不推断」；
- 真实参考检索：实现 `modules/references/domain/ports/reference-provider.ts`（网页/图库），需遵守授权条款并回填 `license`/`sourceUrl`；
- 换账号存储 / 换哈希算法：实现 `modules/user/domain/ports/user-repository.ts` 或 `password-hasher.ts`，在 `user/compose.ts` 换实现（用例与路由不变）；
- 换天气源：实现 `modules/weather/domain/ports/weather-provider.ts`，在 `weather/compose.ts` 按 `kind` 分发 + `config.weatherProvider` 开一个环境变量。拿不到数据要抛 `WeatherUpstreamError`（→ 502 让前端**省掉这次天气**，不阻塞提交），**不要返回假天气**；
- 换衣橱存储：实现 `modules/cabinet/domain/ports/cosmetic-repository.ts`，在 `cabinet/compose.ts` 换实现。换到有并发保障的存储后，把「件数上限 / 归属判断」从用例下沉到仓库层兜底（端口契约不变）。

> **素材红线**：参考样本当前为自绘演示示意，license 诚实标注、`sourceUrl` 置空；正式稿须替换为可授权素材并逐张回填来源，不抓取网络图。
