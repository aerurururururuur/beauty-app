# 场合美妆后端（server/）

TypeScript + **模块化清洁架构**的后端：`src/modules/*` 按功能拆模块，模块内部走 domain ← application ← presentation、`infrastructure` 只实现模块内 `domain/ports`；模块间只经各模块 `index.ts`(public barrel)协作。目前参考检索 / 上妆引擎均为 mock，接口留作接缝，换真实实现不改业务层；对话 agent 的模型缺省也是 `mock`（见下面 `AGENT_LLM`）。

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
    ├── references/          # 参考妆面检索:ReferenceImage + 提供器端口 + mock(自绘授权诚实)
    ├── makeup/              # 上妆引擎:Engine 端口 + Look/ResultText + narration + 输出校验 + mock 引擎
    ├── jobs/                # Job 生命周期 + 流水线编排:状态机 / 仓库 / 队列 / 用例 / 控制器 / JobView DTO
    ├── user/                # 账号:昵称+密码(scrypt 哈希,不存明文) / 注册·登录核对·查档案 + JSON 落盘
    ├── weather/             # 当日天气:open-meteo 实拉(无 key)+ WMO 码映射 + mock 兜底 + 查询校验
    ├── cabinet/             # 衣橱:用户自己的化妆品(名称 + 自定义特性),按 userId 归属 + 归属校验 + JSON 落盘
    └── agent/               # 对话 agent:工具调用循环 + LookSpec 产出 + 会话 + **出图(人在回路)**
```

每个模块 = `index.ts`(public barrel,跨模块协作只走它) + `compose.ts`(`createXxxModule` 组合根) + 模块内四层；
`shared` 只被依赖;`jobs` 是编排者,依赖 assets / references / makeup 的公开端口与工具（妆容方向那一步例外：它是 `shared` 里的纯函数，流水线直接调用，不经端口）。
**每个模块下都有 `README.md`**：一句话职责、目录/依赖、现状、怎么改（含「接缝（将来）」一节记着还没做的那步），接手前先读。

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

流水线语义：第一步的妆容方向不是外接能力，而是 `shared/domain/scene-rules.ts` 的**纯函数** `describeScene(brief)`——按 `brief.occasion`（或 `brief.sceneText` 关键词命中，否则 `daily` 兜底）定 `label`，**再叠一层自由文字里的修饰词**（低调 / 加浓 / 利落 / 温柔 / 提气色 → 追加 tags + 在 `direction` 后接一句），产出 `SceneDescriptor{ label, direction, tags }`；`ReferenceProvider` 按 label 取场合样本；`Engine` 按 **occasion 基准风格 × skinTone 调深浅** 生成 `Look`（含 `zones` 供前端 CSS 叠加）。标识符沿用 `scene` 词（中文「场景/场合」皆可），语义已场合化。

> 修饰词**只改 `direction`/`tags`（文案与前端 chip），不改 `label`、不动色板** —— 判定结果与妆效与从前一致。
> 判定规则是前后端单一源（`shared/domain/scene-rules.ts`），前端浏览器 mock 模式直读同一份。详见 `modules/shared/README.md`。
>
> **没有「场景理解」模块**（2026-09-10 删）：方向是一个纯查表函数，它没有可替换的实现，所以既不该有端口，也不该有开关。曾经包着它的那个模块的全部内容是「一个 `sleep` + 一次转发 + 一个只能拨到 mock 的开关」。接视觉大模型时再来建接缝。

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
| `POST /api/agent/sessions` | JSON `{ userId }` → **201** 会话视图。对话式定妆入口（见 `modules/agent/README.md`）。★ **用户不存在 → 404**，且一条会话都不落库（同衣橱的归属校验） |
| `GET /api/agent/sessions/:id?userId=` | → **200** 会话视图。刷新页面接着看；归属走查询串 |
| `POST /api/agent/sessions/:id/messages` | JSON `{ userId, text }`（text ≤1000 字）→ **200** 会话视图 + `stopReason` + 本轮 `events[]` |
| `POST /api/agent/sessions/:id/photo` | multipart，字段 `face`（文件，仅图片）+ `userId` → **200** 会话视图。照片**字节不进对话记录**，会话里只留一个引用 |
| `POST /api/agent/sessions/:id/render` | JSON `{ userId }`，**一个出图参数都不收** → **200** 会话视图 + `events[]`。★ **全项目唯一会花钱的入口**：模型只能提议，出图必须由用户点这一下。没有挂着的待确认请求 → 422 |
| `GET /api/agent/sessions/:id/renders/:seq?userId=` | → **200** 图片字节（`content-type` 随产物；`seq` 从 1 起）。先查归属、再查记录、最后才碰存储 |
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
| `USER_NOT_FOUND` | 404 | 账号 id 不存在（含衣橱归属、以及 `POST /api/agent/sessions` 指向不存在的用户） |
| `CABINET_ITEM_NOT_FOUND` | 404 | 衣橱条目不存在**或不属于你**（两者共用，不泄露存在性） |
| `CABINET_FULL` | 409 | 单用户衣橱超过 100 件 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在**或不属于你**（两者共用，不泄露存在性） |
| `RENDER_NOT_FOUND` | 404 | 成品图号不存在**或不属于该会话**。与上一条**分开**：归属已先查过，这里是真的没有那张图 |
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

对话 agent（缺省 `AGENT_LLM=mock` 走的是**脚本化演示**，见下面那段注）：

```bash
SID=<上一步返回的 sessionId>
# ⚠️ userId 必须是**上一步注册返回的那个 id**——服务端会校验它存在,查无此人 → 404
curl -s -X POST http://localhost:3000/api/agent/sessions \
     -H 'Content-Type: application/json' -d '{"userId":"<上一步返回的账号 id>"}'  # → 201 { sessionId, ... }
curl -s -X POST http://localhost:3000/api/agent/sessions/$SID/messages \
     -H 'Content-Type: application/json' \
     -d '{"userId":"<同一个 id>","text":"明天面试,帮我定个妆"}'                 # → 200 + stopReason + events[]
curl -s -X POST http://localhost:3000/api/agent/sessions/$SID/photo \
     -F "face=@./me.jpg" -F "userId=<同一个 id>"                              # → 200（照片只存盘，不进对话）
curl -s -X POST http://localhost:3000/api/agent/sessions/$SID/render \
     -H 'Content-Type: application/json' -d '{"userId":"<同一个 id>"}'         # → 200 ★ 这行会花钱
```

> 要看真实模型把 `lookSpec` 定出来，先设 `AGENT_LLM=dashscope` 与 `DASHSCOPE_API_KEY`。
> 响应里的 `lookDescription` 是给用户看的那段人话，**前端原样展示，不要自己再拼一遍**。
>
> ★ **出图是两步，不是一步。** 模型在对话里调 `render_look` 时服务端**不执行**，
> 而是把响应收在 `stopReason="awaiting_confirmation"` 并且视图里带一个 `pendingRender`
> （含着要给用户看的那句 `summary`）。前端据此弹确认框；用户点了才发上面那条 `render`。
> **不点就是没花钱**——用户关掉页面、或者干脆不发这条请求，都不会产生费用。
> 想看纯离线的一张假图，用 `MAKEUP_ENGINE=mock`（缺省）；`image` 才是真出图。
>
> ★ **`AGENT_LLM=mock` 是一段脚本，不是模型。** 它读请求里的**状态**（定下妆面了没有、
> 有照片了没有、上次出图成没成）决定下一步，所以**同一个进程里开个新会话就能从头再演一遍**。
> 它存在的理由很具体：空的 mock 脚本**永远走不到** `awaiting_confirmation`
> （回复里没有 `tool_use`，循环根本不会提议出图），于是「确认出图」这条
> **全项目唯一花钱的链路**，在最安全的缺省配置下**一次都跑不起来**——
> 而它恰恰是最需要能离线复现的那条。整条链路的自动化证据在 `test/demo-llm.test.ts`。
> ⚠️ **它理解不了用户的话**：除了一个明写在代码里的场合关键词表，它不解析任何语义。
> 所以**不能拿它判断妆面质量**，也不能拿它当「模型会怎么回话」的证据——
> 那件事只有 `AGENT_LLM=dashscope` 能给出。
> ⚠️ 它也写不出 `brief` 里那几项结构化字段（场合/肤质/肤色），只能把用户那句话**原样**塞进
> `sceneText`。所以 mock 模式下的 `brief` 看起来比真实对话「薄」——**这是脚本的局限，不是 bug**。
> ★ **用户点了「先不出图」之后，它不会再提议第二次**（再聊一句也不会）：那条线以一句
> 「脚本演完了，接上真实模型我再接着按你说的一点点调」收尾。**宁可明说演完了，也不重复提议**——
> 重复提议会让用户点完拒绝立刻又看到一个确认框，那和没有确认框一样糟。
>
> 起服务时会打一行日志说明当前是不是离线配置（`AGENT_LLM=mock` / `MAKEUP_ENGINE=mock`），
> 免得现场分不清对面是真模型还是那段脚本。

## 配置（env）

`.env.example` → `.env`（已 ignore）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATA_DIR` | `./data` | 任务记录、输入/产物文件、账号表（`users/users.json`）与衣橱表（`cabinet/items.json`）的根目录 |
| `MAKEUP_ENGINE` | `mock` | `mock`（离线骨架）/ `image`（真实出图，**按次计费**）/ `replay`（回放夹具，不联网）。**已接通**（`makeup/compose.ts` 按 kind 分发，2026-09-16）。★ 刻意**没有** `off`——没有引擎就出不了成品，给个 `off` 只会得到又一个假开关。⚠️ `image` 会让**表单路径（`POST /api/jobs`）不可用**：真实引擎需要妆面单（`LookSpec`），而表单不传它（见下）。✏️ 2026-09-17：`image` 原名 `qwen`（**旧值不再兼容**，写 `qwen` 会回落 `mock` 并打一声 `warn`——那行警告是唯一的警报，别跳过启动日志） |
| `MAKEUP_FIXTURES_DIR` | — | 录制/回放的夹具目录（绝对路径）。**不设就不录**——缺省值不能有意外副作用，这里的副作用是写盘。`replay` 时**必填** |
| `QWEN_IMAGE_MODEL` | `qwen-image-edit-plus` | 仅 `MAKEUP_ENGINE=image` 用（这是个**模型名**，与那个开关值不是一回事）。`qwen-image-edit`（无后缀）不认 `size`/`prompt_extend`，代码按模型能力归一化 |
| `REFERENCE_PROVIDER` | `mock` | `mock` 或 `off`(**已接通**,见 `references/compose.ts`)。`off` 返回空列表且**不声称任何来源** |
| `WEATHER_PROVIDER` | `open-meteo` | `open-meteo`（无 key 实拉）或 `mock`（离线示意，**现场断网演示前切**） |
| `AGENT_LLM` | `mock` | 对话 agent 的模型：`mock`（**脚本化演示**——离线、不花钱、**不是模型**，见上面那段注）或 `dashscope`（真实模型，**按 token 计费**）。★ 这里缺省**不是**实拉，与 `WEATHER_PROVIDER` 相反，理由是花钱——缺省值必须是「不会意外产生账单」的那个 |
| `AGENT_MODEL` | `qwen-flash` | 仅 `dashscope` 用。实测候选（`flash` / `plus` / `max`）见 `scripts/probe-tool-calling.ts` |
| `AGENT_BASE_URL` | 由 `DASHSCOPE_API_HOST` 拼出 | 仅 `dashscope` 用。走自建代理/网关时才设 |
| `AGENT_MAX_RENDERS` | `3` | 单会话最多出几张图（§10 `[I3]`），`0` = 不限制。★ 上限的理由**不是省钱**是**防失控**：没有它模型可以一直要，用户点烦了就会闭眼点，那时「每次确认」这道闸门就名存实亡 |
| `AGENT_SESSION_TTL_HOURS` | `24` | 会话空闲多久算过期（§10 `[I8]`），到期**真删**照片与成品图。★ **它同时是「用户本人的照片在服务端最多留多久」这个承诺，改大它等于改隐私条款**。清理每小时扫一次（`src/index.ts` 的 `PURGE_INTERVAL_MS`），扫**两遍**：第二遍从盘上反查**没有会话认领的目录**并真删，所以**进程重启后上一轮留下的照片也会被删掉**（不是只在"没重启过"时才成立） |
| `PRODUCTS_DIR` | `../products/ysl-property` | 产品库内容目录（绝对路径）。**用户主动问起产品时** agent 靠它推荐（★ 不是妆容做完就自动推，见下）。★ **三种加载结果口径不同，见下面那张表**——尤其是「坏数据启动即失败」这一条是**故意**的 |
| `DASHSCOPE_API_KEY` | — | `AGENT_LLM=dashscope` 或 `MAKEUP_ENGINE=image` 时**必填**（缺 key 启动即失败）。此前只有生图脚本读，现在服务路径也读 |
| `DASHSCOPE_API_HOST` | `https://dashscope.aliyuncs.com` | 上面两条路径共用的端点基址 |
| `MAX_UPLOAD_MB` | `25` | 上传体积上限 |

### 产品库（`PRODUCTS_DIR`）：三种结果，**故意不一样**

内容目录是**生成物**（`npm run import-products` 从源 docx 出来，见 `scripts/README.md`），
层级是 **库 → 类别 → 产品**：`products/<库>/<类别>/<产品>.json`，库根有 `library.json`。
`PRODUCTS_DIR` 指到**具体的库**（缺省那样）或指到**容器**（`../products`）都行；
容器里**有多个库、或者一个库都没有**，都**启动即失败**——多库时随便挑一个的后果是模型
只看得见其中一个品牌而它自己不知道；零库则多半是内容没复制全或 `library.json` 被删了。
★ **「没有产品库」只有一个判据：这个路径不存在。** 指一个存在的空目录**不会**关掉功能，
它会**让你起不来**——把「目录空着」也当成「没配」，就等于让删掉一份 `library.json` 之后
服务照常启动、模型静默地不再推荐，而**没有一行日志说为什么**。那正是下面「坏数据启动即失败」要防的事。

★ **推荐是用户要的，不是妆容做完了我们该给的。** 但**「问」和「读」是两件事**，口径要分开记：

| | 什么时候可以 |
| --- | --- |
| **问一句**（「要不要给你挑两支」） | 妆面定下来之后**随时可以**。人明确说了「可以主动挑话头」。问过一次就够了，用户没接就不再提 |
| **读库**（`list_products` / `read_product`） | **等用户开口**——自己问起，**或者答应了上面那一句** |

★ 所以**妆面刚定下来、用户也还没答应的那一轮，`list_products` 不该被调用**。
这是手工验证时要专门看一眼的，因为这条退化的样子很隐蔽：模型会想"我读了不一定推，
先备着总没错"，于是库里内容提前进了上下文。

⚠️ **两句话在提示词和两个工具的描述里都得有**——只写"等用户开口"，模型连问都不敢问
（第一版就是这么写的，被纠正了）；只写"可以问一句"，它问完**直接就去读了**。
口径是 2026-09-16 人拍的板，`SYSTEM_PROMPT_VERSION` 的 `v3 → v4` 就是这次收窄。

| 情况 | 处理 | 为什么 |
| --- | --- | --- |
| 目录**不存在** | `list_products` / `read_product` **不注册**，打一行 `info` | 「没配产品库」是合法部署形态。⚠️ **不是「注册了但返回空」——那是假开关**：模型会以为自己有个空库，然后对着空库编出像模像样的推荐 |
| 目录在但**内容坏** | **启动即失败** | JSON 语法错 / 字段缺或多 / `category` 与所在目录不符 / 类目登记条数与实际不符 / **取不到库（空目录、`library.json` 被删、内容没复制全）** —— 一律抛错。**静默丢产品 = 模型从残缺库里推荐而没人知道** |
| 正常 | 打一行 `info`（条数 + 源资料），有已知数据债再打一行 `warn` | 见下 |

★ **「坏数据启动即失败」是本项目里唯一一处刻意偏离「懒读」惯例的地方。** 本项目此前没有
「启动时急切扫目录」的先例（`references` 硬编码常量、`makeup` 夹具懒读、`assets`/`user` 懒读 +
`existsSync` 挡）。这里选急切，理由只有一条但足够：**懒读意味着一条字段损坏的产品要到
「对话进行到一半、模型真去读它」时才暴露**，而那时用户正等着推荐。同 `makeup/compose.ts`
那句话——配置错了却「能启动」，是最容易拖到演示当天才炸的一类问题。

**源资料自身的问题原样入库**（不改写、不跳过），由导入器**算出来**记进 `library.json` 的
`health` 字段，启动时以 `warn` 打摘要。所以「修好源文档 → 重导」会自然清零。
⚠️ `health` **不进模型上下文**（进去只是白烧 token），启动日志与 `library.json` 是唯一能看见它的地方。

## 命令

```bash
npm run dev        # tsx watch 开发
npm run build      # tsc 编译到 dist/
npm run start      # node dist/index.js
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

> ⚠️ **中文 Windows 的 PowerShell（5.1）里日志会是乱码**（`[products] 宸插姞杞?…`）。
> **日志本身没错**，写出去的是正确的 UTF-8；是**终端按 936（GBK）在解它**——
> 所以别去改日志的编码，那是把错怪在没做错的一边。让这个窗口改读 UTF-8：
>
> ```powershell
> chcp 65001 > $null
> [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
> ```
>
> 每次开窗都要敲，所以真要顺就写进 `$PROFILE`。★ PowerShell 7 默认 UTF-8，没这问题；
> Git Bash / CI 也没这问题——**它只咬「中文 Windows + PS 5.1」这一个组合**。

## 测试

> ⚠️ **`test/` 不被任何 tsconfig 覆盖**（根 `tsconfig.json` 的 `include` 只有 `["src"]`，
> `scripts/tsconfig.json` 收的是 `scripts/` + `src/`）。所以 **`npm run typecheck` 不会检查测试文件**，
> 类型错误在测试里只会在**运行时**冒出来。这不是理论风险：一个假端口的类少实现一个新增的方法时，
> `typecheck` 是绿的、测试也可能是绿的——如果那个方法的缺失被 `try/catch` 吞掉，
> 被测的那条分支就**静默不跑**。（`PurgeExpiredSessions` 的第二遍扫盘出过这个坑，
> 对策写在 `test/agent-render.test.ts` 里那个假存储的注释上：**给新加的端口方法补假实现，
> 并写一条"它缺了就会红"的测试**。）
> ★ `scripts/` 有自己那份 tsconfig 就是为了不被漏掉；**`test/` 至今没有**——
> 要么给它补一份，要么在评审时记住这句。

`test/` 用内存假端口（`helpers/fakes.ts`）跑用例，外加 validator 形状/行为用例：

- `job-state.test.ts` — Job 状态机 / 步骤迁移
- `submit-job.test.ts` / `run-pipeline.test.ts` — 用例端到端（假端口；brief 驱动 occasion→look）
- `schemas.test.ts` — 纯形状（结构/格式/长度/严格模式）
- `validator.test.ts` — 输入业务规则码（含 CONTEXT_REQUIRED / meta JSON） + 输出几何/颜色把关
- `mock-engine.test.ts` — 调色行为：occasion 换风格、skinTone 深色加深、缺省取 medium
- `user.test.ts` — 注册/重名/登录成败/查档案 + 真实 JSON 仓库与 scrypt 凭据（守「明文不落库、视图不含凭据」）
- `weather.test.ts` — WMO 码映射 / 查询校验 / 用例错误翻译 + open-meteo 适配器（**打桩 fetch，单测不联网**）
- `scene-rules.test.ts` — 场合判定行为不变（四条分支 + 优先级表）+ **自由文字真的进方向**（修掉的短路）+ 修饰词去重不发散 + **红线:「显白」不被采纳** + 单一源完整性（`SCENE_RULES`/`SCENE_MATCH_ORDER` 覆盖 `OCCASIONS` 全集、共享文件**零运行时 import**、前端 alias 确实指向它、**判定结果只有 `{label,direction,tags}`**——多出来的常量字段别加回来）
- `cabinet.test.ts` — 衣橱边界（空名 / 超长 / 特性重名 / 控制字符 / 空更新）+ 用例（用户不存在 → `USER_NOT_FOUND`、超上限 → `CABINET_FULL`）+ **越权改删 → 报 404 且原数据一个字没动** + 真实 JSON 仓库 `mkdtemp` 验「重启后还在」
- `agent-loop.test.ts` — ★ **harness 状态机**（§11 称它是「这一层唯一真正的风险控制」）：用 mock LLM 脚本驱动，逐个钉住 `agent-loop.ts` 文件头那六条不变量 —— assistant 原样回填 / 同轮结果装进**同一条** user 消息 / 副作用按顺序折叠 / 工具失败与未知工具名都照样回 observation / 迭代上限与超时不抛错 / LLM 不可达时点名 `POST /api/jobs` 那条出路
- `agent-tools.test.ts` — **四个**工具的行为（空补丁标 isError、空串不覆盖旧值、肤色**已知才**收窄色域、自由文本塞不进来）+ **手写 JSON Schema 与 zod 的样例双向校验**（枚举从实体常量取，那份有测试兜；结构只能靠同一份样例喂两边）+ 系统提示的硬规则（不许写提示词 / 肤色不许猜 / **调用 `render_look` 不等于出图，必须停下等用户**）
- `agent-render.test.ts` — ★ **人在回路那条链**（本模块最贵也最容易写错的一段）：`render_look` 三态（首次 → 只弹确认、**引擎一次都没被调用**；`declined` → 明说没出图也没花钱；`approved` → 真调引擎并落盘）+ 缺妆面/缺照片/超额都在**提议阶段**挡回 + 上限在"提议与确认之间"被追平就不再出 + 重放整轮时其余工具**可重入**（提两次确认，引擎仍是 0 次调用）+ 确认框文案含「按次计费」而**不含任何金额** + `attachPhoto` / `confirmRender` / `getRender` / `PurgeExpiredSessions` 的归属与顺序（**先删文件再删记录**、一条失败不中断整轮）+ 视图只在真挂着待确认时给 `pendingRender`、且**永不透出 `messages[]`** + 真盘上的 `ArtifactStore.remove`（递归删、`s10` 不受影响、`remove('..')` 被拦）+ **`StartSession` 校验归属用户存在**（不存在 → `USER_NOT_FOUND` 且**一条会话都不落库**；`exists` 抛存储故障时**原样抛穿**，不许把 500 说成 404）
- `session-artifacts.test.ts` — 组装根那段适配（`SessionArtifacts` → 真实 `ArtifactStore`）：照片存进去能解析成**真实存在**的绝对路径、**两张图落在不同的键上**（钉死 `results/<sid>/r<n>/result.<ext>`，因为 `putResult` 固定写一个路径，第二张会覆盖第一张）、收编之后**把引擎那份中间产物删掉**（★ 隐私：那张图就是用户的脸上了妆，而清理任务枚举不到它）**但只删落在引擎输出目录里的**（★ 边界是踩出来的：`MockEngine` 的"产物"就是输入照片自己，无边界地删会删掉用户上传的照片）、`removeAll` 连照片带全部成品图一起删而**不碰前缀相近的邻居** + `listStored` 只报**目录**、多张图**只报一个** id（交给 `removeAll` 一次删干净）+ ★ **端到端**：`InMemorySessionStore` 空 + 盘上有照片（模拟重启）→ 跑一次清理，**照片真的从盘上消失**；对照组的活会话**一个字节都没动**
- `agent-llm.test.ts` — 适配器**打桩 fetch，不联网**：`arguments` 的 JSON 字符串↔对象、`finish_reason` 归一化、结果拆成多条 `role:tool`、**`is_error` 的有损翻译**（靠「错误:」前缀补位）、HTTP 非 2xx 不重试而连接阶段错误重试、**日志里绝不出现 key 的值**
- `demo-llm.test.ts` — ★ **离线演示那条链路走一遍**（真 `AgentLoop` + 真工具注册表 + 装配里那一个 `DemoLlm` + `MockEngine` + 真盘上的存储）：需求原样进 `brief` 且**没有任何工具失败** → 提议出图时**停在等确认、引擎一次都没调** → 带 `'approved'` 重放后**真出图**并记下第 1 张、确认框消失 → 换句话（`declined`）后待确认被收掉、**不再提议出图**，**再聊一句也不提议**（宁可如实说"脚本演完了"） → 新会话能**从头再演一遍**（这是它按状态求值、不按顺序取脚本的理由）+ 三个 observation 标记（出成了 / 被拒了 / 照片到手了）**正好是工具实际那句话的开头**且彼此可分辨

## 换真实引擎怎么做

任选其一实现对应 port，再到所属模块的 `compose.ts` 里换实现即可，无需改动模块内的业务层：

- 真实上妆引擎：实现 `modules/makeup/domain/ports/engine.ts` 的 `generate()`，产物仍交给 `makeup/domain/validators/engine-output.validator.ts` 把关。**已接通**（`MAKEUP_ENGINE=image`，2026-09-16；该取值 2026-09-17 前叫 `qwen`），★ 它的**唯一消费者是对话 agent**（§8.1）——表单那条路不传妆面单，所以 `image` 下不可用；
- 真实参考检索：实现 `modules/references/domain/ports/reference-provider.ts`（网页/图库），需遵守授权条款并回填 `license`/`sourceUrl`；
- 换账号存储 / 换哈希算法：实现 `modules/user/domain/ports/user-repository.ts` 或 `password-hasher.ts`，在 `user/compose.ts` 换实现（用例与路由不变）；
- 换天气源：实现 `modules/weather/domain/ports/weather-provider.ts`，在 `weather/compose.ts` 按 `kind` 分发 + `config.weatherProvider` 开一个环境变量。拿不到数据要抛 `WeatherUpstreamError`（→ 502 让前端**省掉这次天气**，不阻塞提交），**不要返回假天气**；
- 换衣橱存储：实现 `modules/cabinet/domain/ports/cosmetic-repository.ts`，在 `cabinet/compose.ts` 换实现。换到有并发保障的存储后，把「件数上限 / 归属判断」从用例下沉到仓库层兜底（端口契约不变）。
- 换对话模型 / 换供应商：实现 `modules/agent/domain/ports/llm.ts` 的 `Llm`，在 `agent/compose.ts` 按 `kind` 分发。该端口的形状**已经为两支线上协议留好了缝**（`input_schema` vs `parameters`、对象入参 vs JSON 字符串、`stop_reason` vs `finish_reason`），差异全部关在适配器里，`agent-loop` 与工具看不到。★ 已有适配器**一个就够**：现在写第二个没人调用的分支，是一段没有实测支撑、也没人会发现的代码——真要换时再写，那时才有验证它的场合。

> **视觉大模型（想做时的说明）**：`describeScene` 是纯函数，没有端口可换——接视觉模型不是「换个实现」，而是**新建一个模块**：在它自己的 `domain/ports` 里声明端口、在 `compose.ts` 里按 `config` 分发，由 `run-pipeline.ts` 代替直接调 `describeScene`。**届时务必同时留一个 `off` 逃生门**（模型现场翻车时退回纯查表），那正是已删的 `OffSceneAnalyzer` 唯一的用途。另：它默认必须关闭，且**不得让氛围参考图重新变成风格主输入**（红线 §13-1 / §13-3）。

> **素材红线**：参考样本当前为自绘演示示意，license 诚实标注、`sourceUrl` 置空；正式稿须替换为可授权素材并逐张回填来源，不抓取网络图。
