# 后端架构与契约（server/）

这份文档回答这套后端是怎么搭的、边界在哪、契约长什么样。

想把它跑起来、想知道 API key 怎么填，看 [`server/README.md`](../server/README.md)。那份是使用说明，这份是参考。

与 `docs/plan/` 的分工：`plan/` 记的是打算怎么做、为什么这么选，这里记的是现在的系统实际长什么样。
两者冲突时以代码为准，但请回过头把这份文档改过来。

各模块自己还有一份 `server/src/modules/<模块>/README.md`。**接手某个模块前先读那一份。**

## 目录

- [1. 分层与目录](#1-分层与目录)
- [2. brief —— 输入的唯一结构化载体](#2-brief--输入的唯一结构化载体)
- [3. schema vs validator](#3-schema-vs-validator)
- [4. 场合判定（纯查表）](#4-场合判定纯查表)
- [5. HTTP 契约（全部挂 `/api` 前缀）](#5-http-契约全部挂-api-前缀)
- [6. 配置（env）](#6-配置env)
- [7. 产品库（`PRODUCTS_DIR`）](#7-产品库products_dir)
- [8. 测试](#8-测试)
- [9. 换真实实现（接缝在哪）](#9-换真实实现接缝在哪)
- [10. 素材红线](#10-素材红线)

---

## 1. 分层与目录

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
    ├── shared/              # 地基:brief 枚举单源 / scene-rules(场合语义·前后端单一源) / AppError
    ├── assets/              # 图片存储:ArtifactStore 端口 + 本地文件系统实现
    ├── face-catalog/        # 肤色与色号词表:8 档肤色 → 可用色号,给 makeup 收窄色域
    ├── makeup/              # 上妆引擎:Engine 端口 + 输出校验 + mock/image 引擎 + 读图分析(视觉模型)
    ├── user/                # 账号:昵称+密码(scrypt 哈希,不存明文) / 注册·登录核对·查档案 + JSON 落盘
    ├── weather/             # 当日天气:open-meteo 实拉(无 key)+ WMO 码映射 + mock 兜底 + 查询校验
    ├── cabinet/             # 衣橱:用户自己的化妆品(名称 + 自定义特性),按 userId 归属 + 归属校验 + JSON 落盘
    ├── products/            # 品牌产品库(内容库,给模型读的品类资料):加载 + 校验 + 只读查询
    ├── styling/             # ★ 妆容方案:21 套风格配方 + 展开成步骤/色板/产品/个性化(纯函数,无 IO)
    └── agent/               # 对话 agent:工具调用循环 + LookSpec 产出 + 会话 + **出图(人在回路)**
```

每个模块 = `index.ts`(public barrel,跨模块协作只走它) + `compose.ts`(`createXxxModule` 组合根) + 模块内四层；
`shared` 只被依赖;**没有编排模块**——谁用谁,由各 `compose.ts` 与 `src/index.ts` 装配。

模块间只能走 barrel，是因为模块内部随时可以重构，只要 `index.ts` 不变，别的模块就不受影响。
直达内部文件等于把内部结构变成了跨模块契约，那种耦合会在重构时以编译错误的形状出现，
而那时已经没人记得那处依赖是怎么长出来的了。

## 2. brief —— 输入的唯一结构化载体

`modules/shared/domain/entities/brief.ts` 是枚举单源，schema / validator / 测试共用：

| 字段 | 枚举 / 约束 | 说明 |
| --- | --- | --- |
| `occasion` | **8 个**：`interview` 面试 / `date` 约会 / `stage` 上台 / `family` 见家长 / `daily` 日常兜底 / `party` 聚会 / `travel` 旅行 / `fantasy` 奇想 | 主风格信号，直进 domain。★ 后 3 个是 2026-09-30 为桃妆补的（5 → 8）；补完之后这 8 个与桃妆前端那 5 张场景卡**同名同义**，前端把 `sceneId` 直传当 `occasion` 用，不再需要映射表 |
| `sceneText` | ≤2000 字 | 自由文字自定义需求 |
| `skinType` | `dry`/`oily`/`combination`/`sensitive`/`neutral` | 肤质（持妆策略） |
| `skinTone` | `cool_porcelain`/`pink_porcelain`/`warm_ivory`/`warm_beige`/`olive`/`warm_tan`/`wheat`/`deep_brown` **8 档** | **缺省 `olive`（橄榄皮·橄榄调）**，不默认浅肤色审美 |
| `dress` | ≤80 字 | 穿搭一句话（风格 + 主色） |
| `features` | 面部特征 id 数组（有**条数上限**，形状校验在 `shared`） | 用户在人设里勾选的特征，如 `eye-drop` / `face-round`。★ **取值与含义不在 `shared`**——合法成员在 `face-catalog` 的目录里（`shared` 不能反向 import 它），这里只声明"有这一列"。★ **未知 id 由消费者剔掉，不在这里报错**：用户数据里存的 id 可能比后端词表旧，那不该让整份需求被打回 |
| `weather` | `{ condition?, temperatureC?, humidityPct?, uvIndex? }` | 当日天气，整块 `.optional()`：前端拉不到就**整个省掉**（无手动预设可填，不吃假数据） |

## 3. schema vs validator

- `<模块>/domain/schemas` 只声明**形状**：字段结构、枚举取值、类型、长度上限——没有跨字段规则，不做动作。
- `<模块>/domain/validators` 才是**做校验行为的对象**：形状 + 业务规则一并执行，失败映射成语义错误码。

| 校验器 | 方向 | 行为 |
| --- | --- | --- |
| `shared/domain/validators/brief-fields.validator.ts` | 输入 | 简报字段的跨字段规则：枚举闭集、长度；开会话与 `patch_brief` 共用同一份 |
| `agent/domain/validators/agent-http.validator.ts` | 输入 | 对话那几条口的入参：`userId` 必填、发话 ≤1000 字、分析 `kind` ∈ 三个 case、上传 `kind` ∈ `{style, scene}` |
| `makeup/domain/validators/look-spec.validator.ts` | 输入 | 妆面单的闭集与区间（`propose_look` 的入参） |
| `makeup/domain/validators/analysis.validator.ts` | 输入 | 读图分析的越界即抛，**绝不就近映射** |
| `makeup/domain/validators/engine-output.validator.ts` | 输出 | 成品路径/类型存在；`look.zones/palette` 若声明则坐标/比例 `0..1`、RGB `0..255`、`opacity 0..1`、`blur ≥ 0`，非法抛 `INTERNAL_ERROR` |

形状和行为分成两层是有原因的：schema 管什么样的数据算合法，validator 管合法数据能不能做这件事。
混在一起，前端复用 schema 做表单校验时就会连带拖进业务规则；分开之后 schema 可以被前端直接拿去用。

## 4. 场合判定（纯查表）

`shared/domain/scene-rules.ts` 的**纯函数** `describeScene(brief)`：按 `brief.occasion` 定 `label`，
取不到就试 `brief.sceneText` 的关键词命中，再取不到兜底 `daily`；然后**叠一层自由文字里的修饰词**
（低调、加浓、利落、温柔、提气色各追加对应 tag 并在 `direction` 后接一句），
产出 `SceneDescriptor{ label, direction, tags }`。修饰词**只改 `direction` 与 `tags`**，
不改 `label`、不动色板。判定规则是前后端单一源，详见 `modules/shared/README.md`。

★ **2026-09-30：场合从 5 个变 8 个，这个文件也从"半死"变回"活的"——但只活一半。**
弄清是哪一半，别整块当成零消费者删掉：

- `SCENE_RULES`（场合 → 中文名 / 方向 / 关键词）**是活的**：`makeup` 的
  `look-description.ts` / `prompt-builder.ts` 与 agent 的 `propose-look.ts` /
  `style-pool-description.ts` 都在读它。`SCENE_MATCH_ORDER` 与 `OCCASIONS`
  的全集相等由 `test/scene-rules.test.ts` 钉着。
- `describeScene` 这个纯函数**仍然零消费者**：吃它的那条链（表单流水线与前端 mock）
  随 `jobs` 一起删了（见 §8），而新接上的 `/form` 动线**走的是 `brief.occasion` 直传**，
  不经过关键词兜底。

**没有「场景理解」模块**，2026-09-10 删掉了。方向是一个纯查表函数，它没有可替换的实现，
所以既不该有端口，也不该有开关。曾经包着它的那个模块，全部内容是一个 `sleep`、
一次转发、一个只能拨到 mock 的开关。接视觉大模型时再来建接缝，做法见 §9 末尾。

★ **这条是删模块的判据，不只针对它：没有可替换实现的端口，不该有开关。**
反过来也成立——**接一个永远不会拨到第二个值的开关，只会得到又一个假开关。**

## 5. HTTP 契约（全部挂 `/api` 前缀）

契约类型：请求形状在 `<模块>/domain/schemas/api/`，响应视图在 `<模块>/application/*-view.ts`（agent 的是 `agent-view.ts`）。

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /api/users` | JSON `{ nickname, password }` → **201** `UserView{ id, nickname, createdAt }`(昵称唯一；密码只存 scrypt 凭据) |
| `POST /api/users/login` | JSON `{ nickname, password }` → **200** `UserView`；不符 → 401 `INVALID_CREDENTIALS`。**只核对，不签发 token**（登录态未做） |
| `GET /api/users/:id` | 账号档案 `UserView`(响应**永不含密码/凭据**) |
| `GET /api/weather` | `?city=北京` 或 `?lat=39.9&lon=116.4` → `WeatherView{ source, place, condition, temperatureC, humidityPct, uvIndex }`。前端只取 `condition/temperatureC/humidityPct/uvIndex` 四字段填进 `POST /api/agent/sessions` 的 `weather`（`place`/`source` 是回显元信息，**不进 weather**——weather schema 是 `.strict()`）；失败就不填 |
| `POST /api/cabinet/items` | JSON `{ userId, name, attributes? }` → **201** `CosmeticItemView`。`attributes` 是 `{label,value}[]` 的**自定义**键值（≤12 条，标签去重），名称 ≤40 字 |
| `GET /api/cabinet/items?userId=` | → **200** `{ items: [...] }`（按建档时间升序；**只回该用户的**） |
| `PATCH /api/cabinet/items/:id` | JSON `{ userId, name?, attributes? }` → **200** `CosmeticItemView`。两者**至少给一个**（都不给 = 空操作，直接 422） |
| `DELETE /api/cabinet/items/:id?userId=` | → **204** 无响应体。归属走**查询串**（DELETE 带 body 会被不少代理丢掉） |
| `POST /api/agent/sessions` | JSON `{ userId, ...brief }` → **201** 会话视图。对话式定妆入口（见 `modules/agent/README.md`）。★ **用户不存在 → 404**，且一条会话都不落库（同衣橱的归属校验） |
| `GET /api/agent/sessions/:id?userId=` | → **200** 会话视图。刷新页面接着看；归属走查询串 |
| `POST /api/agent/sessions/:id/messages` | JSON `{ userId, text }`（text ≤1000 字）→ **200** 会话视图 + `stopReason` + 本轮 `events[]` |
| `POST /api/agent/sessions/:id/photo` | multipart，字段 `face`（文件，仅图片）+ `userId` → **200** 会话视图。照片**字节不进对话记录**，会话里只留一个引用 |
| `POST /api/agent/sessions/:id/images` | multipart，字段 `file` + `userId` + `kind`（`style` / `scene`）→ **200** 会话视图。收图，**不分析**（免费）。`VISION_ANALYZER=off` 时**不注册**（404） |
| `POST /api/agent/sessions/:id/analyses` | JSON `{ userId, kind }`，`kind` ∈ `face` / `scene` / `style`，**不收任何分析参数** → **200** 分析结果视图。★ **会花钱的入口之一**（另一条是 `render`）：用户点了才跑。★ 「用户填的优先」——`brief` 已有值 ⇒ **不调分析器**，回 `would_overwrite`（没花钱）。`VISION_ANALYZER=off` 时**不注册**（404） |
| `POST /api/agent/sessions/:id/render` | JSON `{ userId }`，**一个出图参数都不收** → **200** 会话视图 + `events[]`。★ **会花钱的入口之一**（另一条是 `analyses`）：模型只能提议，出图必须由用户点这一下。没有挂着的待确认请求 → 422 |
| `GET /api/agent/sessions/:id/renders/:seq?userId=` | → **200** 图片字节（`content-type` 随产物；`seq` 从 1 起）。先查归属、再查记录、最后才碰存储 |
| `GET /api/health` | 存活检查 `{ ok, name, uptimeSec, now }` |

> 衣橱的 `userId` 由客户端显式传（本轮无登录态、不签发 token）。**改 / 删一律校验归属**：
> 条目不存在与不属于你**共用** `CABINET_ITEM_NOT_FOUND` / 404，不泄露「这条存在但不属于你」。

> ★ **2026-09-30：会话视图里多了一格 `plan`（妆容方案）。** `propose_look` 成功时服务端
> **同时**存下 `lookSpec`（给引擎出图的那份妆面单）与 `plan`（给人看的那份方案，
> 由 `modules/styling` 展开）；桃妆的 `/result` 渲染的就是后者。
> **为什么是同一个工具产出两样**见 `modules/agent/README.md` 的 `propose_look` 那一节。
> ⚠️ **brief 的字段是平铺在请求体上的**（`startSessionSchema` 把 `shared` 的 `briefFields`
> 直接展开），**不是嵌在 `brief` 键下**；而它是 `.strict()`，多给一个键就是 422。
> 这个形状最容易出的错是：客户端写成 `{ userId, brief }` → 422；
> 或者干脆不收 brief → **请求照样 200、日志干净，而用户填的东西一字段不剩地被丢掉**。

### 5.1 错误体（与错误码 → HTTP 映射）

统一 `{ error: { code, message, details? } }`：

| 错误码 | HTTP | 触发 |
| --- | --- | --- |
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
| `VALIDATION_ERROR` | 422 | 形状或业务规则不合规：枚举越界、缺图、昵称密码不合规等 |
| `INTERNAL_ERROR` | 500 | 引擎输出不过关等内部错误 |
| 框架级（如文件超限） | 保留原状态码(413) | — |

★ 「两者共用同一个码」是刻意的，不是偷懒。`CABINET_ITEM_NOT_FOUND` / `SESSION_NOT_FOUND` /
`INVALID_CREDENTIALS` 都把「不存在」和「不属于你」合并成同一个响应。
分开写会变成一个存在性探针，攻击者能靠 404 和 403 的差别问出「这个 id 存不存在」。
加新错误码时请沿用这一条。

### 5.2 提交示例

账号（JSON 体，注意 `Content-Type: application/json`）：

```bash
curl -s -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' \
     -d '{"nickname":"小美","password":"hunter2"}'        # → 201 { id, nickname, createdAt }
curl -s -X POST http://localhost:3000/api/users/login -H 'Content-Type: application/json' \
     -d '{"nickname":"小美","password":"hunter2"}'        # → 200 同一视图；密码错 → 401
```

> 密码**不做 trim**（空格是密码的一部分），昵称会 trim，清洗后 2–32 字；密码 6–128 位。

对话 agent（缺省 `AGENT_LLM=mock` 走的是**脚本化演示**，见 `server/README.md` 的「三种运行形态」）：

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

响应里的 `lookDescription` 是给用户看的那段人话，**前端原样展示，不要自己再拼一遍**。

### 5.3 出图是两步，不是一步

★ 模型在对话里调 `render_look` 时服务端**不执行**。它把响应收在
`stopReason="awaiting_confirmation"`，视图里带一个 `pendingRender`，里面是给用户看的那句
`summary`。前端据此弹确认框，用户点了才发上面那条 `render`。
**不点就是没花钱**：用户关掉页面，或者干脆不发这条请求，都不会产生费用。

★ 因此每个工具都必须**可重入**。同一轮的工具结果被整体扣住，重放那一轮时它们会被再调一次，
所以谁都不能靠「我已经跑过一次了」来记账。这条不变量由 `agent-loop.ts` 保证，
用例在 `test/agent-render.test.ts`。

`AGENT_LLM=mock` 的行为细节见 `server/README.md` 的「三种运行形态」，那里讲的是「这东西是什么」。
这里只记两条契约相关的事实：它读请求里的**状态**决定下一步，所以同一个进程里开个新会话
就能从头再演一遍；★ 用户点了「先不出图」之后它**不会再提议第二次**，那条线以一句
「脚本演完了，接上真实模型我再接着按你说的一点点调」收尾。
**宁可明说演完了，也不重复提议**——重复提议会让用户点完拒绝立刻又看到一个确认框，
那和没有确认框一样糟。

## 6. 配置（env）

`.env.example` → `.env`（已 ignore）。**逐项说明以 `.env.example` 的注释为准**（那份就在配置旁边，最容易保持同步）；下面这张表是速查。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATA_DIR` | `./data` | 任务记录、输入/产物文件、账号表（`users/users.json`）与衣橱表（`cabinet/items.json`）的根目录 |
| `MAKEUP_ENGINE` | `mock` | `mock`（离线骨架）/ `image`（真实出图，**按次计费**）。**已接通**（`makeup/compose.ts` 按 kind 分发，2026-09-16）。★ 刻意**没有** `off`——没有引擎就出不了成品，给个 `off` 只会得到又一个假开关。⚠️ `image` 只在**对话 agent** 那条路上可用：真实引擎需要妆面单（`LookSpec`）。✏️ 2026-09-17：`image` 原名 `qwen`（**旧值不再兼容**）。✏️ 2026-09-29：删掉 `replay` 取值与整套 `MAKEUP_FIXTURES_DIR` 夹具链——那份夹具一份都没录过，「引擎离线可验」这条验收从未兑现，留着读起来却像"已经通了"。★ 2026-09-18：开关的取值一律**写错即启动失败**（报错列出合法取值），不再静默回落、也不再"喊一声继续跑" |
| `QWEN_IMAGE_MODEL` | `qwen-image-edit-plus` | 仅 `MAKEUP_ENGINE=image` 用（这是个**模型名**，与那个开关值不是一回事）。`qwen-image-edit`（无后缀）不认 `size`/`prompt_extend`，代码按模型能力归一化 |
| `VISION_ANALYZER` | `off` | 读图分析（face→肤色 / scene→场合 / style→妆面读数）：`off`（那两条入口**根本不注册**）/ `real`（**按 token 计费**）。产物**只补空**——用户填过的不覆盖，也不为此花钱。★ 刻意**没有** `mock`（见 `.env.example`）。⚠️ `real` 的请求形状与模型名都没实测过，先跑 `npm run probe:vision` |
| `QWEN_VISION_MODEL` | `qwen-vl-max` | 仅 `VISION_ANALYZER=real` 用。⚠️ 模型名未实测，同上 |
| `WEATHER_PROVIDER` | `live` | `live`（无 key 实拉）或 `mock`（离线示意，**现场断网演示前切**）。✏️ 2026-09-18：`live` 原名 `open-meteo`（那是**上游名**，现在的开关值一律按行为命名；响应里的 `source` 仍报上游名） |
| `AGENT_LLM` | `mock` | 对话 agent 的模型：`mock`（**脚本化演示**——离线、不花钱、**不是模型**）或 `real`（真实模型，**按 token 计费**）。★ 这里缺省**不是**实拉，与 `WEATHER_PROVIDER` 相反，理由是花钱——缺省值必须是「不会意外产生账单」的那个。✏️ 2026-09-18：`real` 原名 `dashscope`（那是**厂商名**，与 `MAKEUP_ENGINE` 的 `image` 同一条命名规矩） |
| `AGENT_MODEL` | `qwen-flash` | 仅 `real` 用。实测候选（`flash` / `plus` / `max`）见 `scripts/probe-tool-calling.ts` |
| `AGENT_BASE_URL` | 由 `DASHSCOPE_API_HOST` 拼出 | 仅 `real` 用。走自建代理/网关时才设 |
| `AGENT_SESSION_TTL_HOURS` | `24` | 会话空闲多久算过期（§10 `[I8]`），到期**真删**照片与成品图。★ **它同时是「用户本人的照片在服务端最多留多久」这个承诺，改大它等于改隐私条款**。清理每小时扫一次（`src/index.ts` 的 `PURGE_INTERVAL_MS`），扫**两遍**：第二遍从盘上反查**没有会话认领的目录**并真删，所以**进程重启后上一轮留下的照片也会被删掉**（不是只在"没重启过"时才成立） |
| `PRODUCTS_DIR` | `../products/ysl-property` | 产品库内容目录（绝对路径）。**用户主动问起产品时** agent 靠它推荐（★ 不是妆容做完就自动推，见 §7）。★ **三种加载结果口径不同，见 §7**——尤其是「坏数据启动即失败」这一条是**故意**的 |
| `FACE_CATALOG_DIR` | `../assests/face-catalog` | 面部词表内容目录（绝对路径）。★ 与 `PRODUCTS_DIR` 有意不同：**没有「目录不存在 = 关掉功能」这一格**，读不到一律**启动即失败**——它是 `brief.skinType` / `skinTone` 合法取值的来源，缺了它整条 brief 校验无从谈起。见 `modules/face-catalog/README.md` 与 `compose.ts` 文件头 |
| `DASHSCOPE_API_KEY` | — | `AGENT_LLM=real` / `MAKEUP_ENGINE=image` / `VISION_ANALYZER=real` 时**必填**（缺 key 启动即失败） |
| `DASHSCOPE_API_HOST` | `https://dashscope.aliyuncs.com` | 上面两条路径共用的端点基址 |
| `MAX_UPLOAD_MB` | `25` | 上传体积上限 |

★ **缺省值的一贯规矩：缺省必须选不会意外产生副作用的那一个。**
所以 `AGENT_LLM` / `MAKEUP_ENGINE` 缺省 `mock`、`VISION_ANALYZER` 缺省 `off`，副作用都是账单。
唯一相反的是 `WEATHER_PROVIDER` 缺省 `live`，因为那是免费公开接口，实拉没有代价。

⚠️ **`DASHSCOPE_API_KEY` 刻意不是 `ServerConfig` 的一个字段，而是 `readDashScopeApiKey()` 函数读的。**
`ServerConfig` 会被传进 `buildApp` 并长期挂在 `app` 上，任何一次 `app.log.info(config)` 式的调试
都会把整个配置对象打进日志。secret 不进那个对象是最省事的防线，不需要靠「记得别打印它」来保证。
同类先例是用户密码：从不进 config，只存 scrypt 凭据。

## 7. 产品库（`PRODUCTS_DIR`）

内容目录是**生成物**（`npm run import-products` 从源 docx 出来，见 `scripts/README.md`），
层级是 **库 → 类别 → 产品**：`products/<库>/<类别>/<产品>.json`，库根有 `library.json`。
`PRODUCTS_DIR` 指到**具体的库**（缺省那样）或指到**容器**（`../products`）都行；
容器里**有多个库、或者一个库都没有**，都**启动即失败**——多库时随便挑一个的后果是模型
只看得见其中一个品牌而它自己不知道；零库则多半是内容没复制全或 `library.json` 被删了。
★ **「没有产品库」只有一个判据：这个路径不存在。** 指一个存在的空目录**不会**关掉功能，
它会**让你起不来**——把「目录空着」也当成「没配」，就等于让删掉一份 `library.json` 之后
服务照常启动、模型静默地不再推荐，而**没有一行日志说为什么**。那正是下面「坏数据启动即失败」要防的事。

| 情况 | 处理 | 为什么 |
| --- | --- | --- |
| 目录**不存在** | `list_products` / `read_product` **不注册**，打一行 `info` | 「没配产品库」是合法部署形态。⚠️ **不是「注册了但返回空」——那是假开关**：模型会以为自己有个空库，然后对着空库编出像模像样的推荐 |
| 目录在但**内容坏** | **启动即失败** | JSON 语法错 / 字段缺或多 / `category` 与所在目录不符 / 类目登记条数与实际不符 / **取不到库（空目录、`library.json` 被删、内容没复制全）** —— 一律抛错。**静默丢产品 = 模型从残缺库里推荐而没人知道** |
| 正常 | 打一行 `info`（条数 + 源资料），有已知数据债再打一行 `warn` | 见下 |

★ **「坏数据启动即失败」是本项目里唯一一处刻意偏离「懒读」惯例的地方。** 本项目此前没有
「启动时急切扫目录」的先例（`assets` / `user` 懒读 +
`existsSync` 挡）。这里选急切，理由只有一条但足够：**懒读意味着一条字段损坏的产品要到
「对话进行到一半、模型真去读它」时才暴露**，而那时用户正等着推荐。同 `makeup/compose.ts`
那句话——配置错了却「能启动」，是最容易拖到演示当天才炸的一类问题。

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

**源资料自身的问题原样入库**（不改写、不跳过），由导入器**算出来**记进 `library.json` 的
`health` 字段，启动时以 `warn` 打摘要。所以「修好源文档 → 重导」会自然清零。
⚠️ `health` **不进模型上下文**（进去只是白烧 token），启动日志与 `library.json` 是唯一能看见它的地方。

## 8. 测试

> ✏️ **2026-09-29：`test/` 那份 tsconfig 已经补上了（`npm run typecheck:test`），
> 所以「类型检查是五道门」而不是三道——`test` / `typecheck` / `typecheck:test` /
> `typecheck:scripts` / `build`，缺一不可。** 下面这段是它补上之前的样子，留着是因为
> **它描述的坏法还在**（只是现在会被当场拦下），而且解释了为什么这个脚本不能省。
>
> 在此之前：根 `tsconfig.json` 的 `include` 只有 `["src"]`，`scripts/tsconfig.json` 收的是
> `scripts/` 和 `src/`，所以 **`npm run typecheck` 不检查测试文件**，类型错误只会在运行时冒出来。
>
> 这不是理论风险。一个假端口类少实现一个新增方法时，`typecheck` 是绿的，测试也可能是绿的；
> 如果那个方法的缺失被 `try/catch` 吞掉，被测的那条分支就静默不跑了。
> `PurgeExpiredSessions` 的第二遍扫盘出过这个坑，对策写在 `test/agent-render.test.ts` 里
> 那个假存储的注释上：**给新加的端口方法补假实现，并写一条「它缺了就会红」的测试。**
>
> ★ 补上那天第一次跑 `typecheck:test`，**当场炸出 29 条"运行时全绿"的类型谎言**——
> 这就是它存在的全部理由。别把这一步从验证清单里省掉。

`test/` 用内存假端口 `helpers/fakes.ts` 跑用例，外加 validator 的形状与行为用例。

**业务与模块**

- `schemas.test.ts` — 纯形状：结构、格式、长度、严格模式。
- `validator.test.ts` — 输入业务规则码；输出几何与颜色把关。
- `face-catalog.test.ts` — 8 档肤色 → 色号词表（含随包那份真词表的加载与体检）。
  ★ 另有一组**与前端 `kb/features.js` 的对表**：31 条特征 id、6 个分组的 id 与 `name`、
  以及分组 `hint` ↔ 后端 `strategy`，判据是**用户数据那边说了算**——前端那套 id
  已经落在用户 `localStorage` 的人设里，后端的 id 当时零消费者，所以**改后端对齐前端**。
- `styling-plan.test.ts` — ★ 2026-09-30 新增。跨端对表 + `derivePlan` 的行为契约：
  ① 后端那份配方（21 套 `STYLE_LIBRARY` + 5 个共有场合的 `SCENE_STYLES` 池）
  与**前端的 `kb/styles.js` 逐字段相同**；② 配方里每一对非空的 `(pid, code)` 都能在前端
  `kb/shades.js` 里查到非空 hex（这条一红，色板会少几块而**没人看得出来**）；
  ③ 展开不许漏、不许多：步骤数 / id 拼法 `${style.id}-${两位下标}` / `desc` 就是那一步的
  「操作手法」/ 产品逐条照搬；④ 色板按 `code` 去重、上限 8、只收步骤里真用到的色号；
  ⑤ 未知特征 id **剔掉**、顺序即用户勾选的顺序。
  ★ 对表的**方向是"前端说了算"**：`kb/styles.js` 是搬运前的原件，后端那份是搬迁版，
  搬家搬错一格没有任何别的征兆（方案照算、页面照渲染、日志干净）。
  ⚠️ 前端只有 5 个场景，另 3 个场合（`stage`/`family`/`daily`）没有可比的那一半。
- `user.test.ts` — 注册、重名、登录成败、查档案；外加真实 JSON 仓库与 scrypt 凭据，守「明文不落库、视图不含凭据」。
- `weather.test.ts` — WMO 码映射、查询校验、用例错误翻译；open-meteo 适配器打桩 fetch，单测不联网。
- `cabinet.test.ts` — 衣橱边界：空名、超长、特性重名、控制字符、空更新。用例层验 `USER_NOT_FOUND`
  与 `CABINET_FULL`，越权改删报 404 且原数据一个字没动，真实 JSON 仓库用 `mkdtemp` 验「重启后还在」。
- `config.test.ts` — 各开关的取值解析：合法值通过，**不认识的取值抛错**，报错里必须出现
  环境变量名、收到的原值、全部合法取值与 `.env.example`。另钉住「留空/全空白 = 没给 = 走缺省，
  不抛错」这条边界。★ 2026-09-18 之前钉的是"回落 `mock` 并打一声 `warn`"。
- `multipart-upload.test.ts` — ★ `agent/` 那两条 multipart 口（`photo` 与 `images`）的上传回归：
  大于 16 KB 的流必须在**出循环之前**开始读，否则永远挂住。
  在此之前 `test/` 里没有任何 HTTP 层的上传用例，两条路走的都是假的上传流，
  真实字节流的坑在单测里看不见。

**引擎与产品库**

- `mock-engine.test.ts` — 调色行为：occasion 换风格、skinTone 深色加深、缺省取**词表 `isDefault` 那一档**
  （不写死档位名 —— 词表把缺省档挪走之后，写死的那条测试会照样绿）。
- `makeup-engine.test.ts` — `ImageEngine` 的请求组装与下载重试，打桩 fetch；外加提示词口径那几条不变量
  （肤色写不写会改措辞、写哪一档不会）。
- `makeup-prompt.test.ts` — ★ 提示词模板的零漂移门槛：产出里不许出现几何词、构图词、服装词、背景词。
  依据是 §4.4 的四次实测，见 `makeup/README.md`。
- `products.test.ts` — 内容库加载口径：「不存在的目录」关掉功能，「存在但坏」**启动即失败**；
  外加体检报告。★ 该炸那几条最要紧，两者划错的后果不对称——前者是功能没了，看得见；
  后者是模型从残缺库里推荐，看不见。
- `scene-rules.test.ts` — 场合判定行为不变，四条分支加优先级表；自由文字真的进方向；
  修饰词去重不发散；红线「显白」不被采纳。另有一组单一源完整性断言：`SCENE_RULES` 与
  `SCENE_MATCH_ORDER` 覆盖 `OCCASIONS` 全集、共享文件零运行时 import、前端 alias 确实指向它、
  判定结果只有 `{label,direction,tags}`。

**agent**

- `agent-loop.test.ts` — ★ harness 状态机。§11 称它是「这一层唯一真正的风险控制」。
  用 mock LLM 脚本驱动，逐个钉住 `agent-loop.ts` 文件头那六条不变量：assistant 原样回填、
  同轮结果装进同一条 user 消息、副作用按顺序折叠、工具失败与未知工具名都照样回 observation、
  迭代上限与超时不抛错、LLM 不可达时给一条可行动的出路。
- `agent-tools.test.ts` — 工具行为与系统提示的硬规则。行为侧：空补丁标 isError、空串不覆盖旧值、
  肤色已知才收窄色域、自由文本塞不进来。另有手写 JSON Schema 与 zod 的样例双向校验——
  枚举从实体常量取，那份有测试兜；结构只能靠同一份样例喂两边。提示词侧：不许写提示词、
  肤色不许猜、调用 `render_look` 不等于出图必须停下等用户。
- `agent-render.test.ts` — ★ 人在回路那条链，本模块最贵也最容易写错的一段。`render_look` 三态：
  首次只弹确认且引擎一次都没被调用，`declined` 明说没出图也没花钱，`approved` 才真调引擎并落盘。
  缺妆面、缺照片都在提议阶段挡回；重放整轮时其余工具必须可重入，提两次确认引擎仍是 0 次调用。确认框文案含「按次计费」但不含任何金额。
  `attachPhoto` / `confirmRender` / `getRender` / `PurgeExpiredSessions` 的归属校验与顺序也在这里，
  包括「先删文件再删记录」和「一条失败不中断整轮」。视图只在真挂着待确认时给 `pendingRender`，
  永不透出 `messages[]`。真盘上的 `ArtifactStore.remove` 验递归删、`s10` 不受影响、`remove('..')` 被拦。
  `StartSession` 校验归属用户存在，不存在则 `USER_NOT_FOUND` 且一条会话都不落库；
  `exists` 抛存储故障时原样抛穿，不许把 500 说成 404。
- `agent-llm.test.ts` — 适配器打桩 fetch，不联网。`arguments` 的 JSON 字符串与对象互转、
  `finish_reason` 归一化、结果拆成多条 `role:tool`、`is_error` 的有损翻译靠「错误:」前缀补位、
  HTTP 非 2xx 不重试而连接阶段错误重试，以及日志里绝不出现 key 的值。
- `demo-llm.test.ts` — ★ 离线演示那条链路走一遍。真 `AgentLoop`、真工具注册表、装配里那一个
  `DemoLlm`、`MockEngine`、真盘上的存储。需求原样进 `brief` 且没有任何工具失败；提议出图时
  停在等确认、引擎一次都没调；带 `'approved'` 重放后真出图并记下第 1 张；换句话变 `declined` 后
  待确认被收掉且不再提议出图，再聊一句也不提议，宁可如实说「脚本演完了」；新会话能从头再演一遍，
  这是它按状态求值、不按顺序取脚本的理由。
  ★ 2026-09-30 补的两组（都走**表单那条路**——它才有明确的 `occasion`，因而提示词里只印一行池子）：
  ① **表单带下来的「用户原话」不会被开场白盖掉**（`brief` 那一格以表单为准，
   `patch_brief` 一次都没调）；② **换风格那一轮**——新提的 `propose_look` 就是点的那一个、
   `plan` 跟着换；桌面上正摆着确认框时换风格，**先按"不出图"了结欠账、照旧重配一套**；
  点的还是**当前**这一个则**不重配**（判据是"与上次提的不同"，不是"句子里有风格 id"）。
  ⚠️ ②里那条判据是**一次真 bug 的现场**：「出图那件事的结局只对**它当时提的那一套妆**有效」——
  不看 `propose_look` 与 `render_look` 的**先后**，换完风格会收到一句指向上**一套**妆的
  「那这次先不出图」，而旁边正摆着一个出图按钮。
- `analysis.test.ts` — ★ 读图那一轮（用户点了才跑）。三个适配器**越界一律抛错**（含 `unknown` 这条
  失败通道）；「用户填的优先」断言的是**一次都没调**；`VISION_ANALYZER=off` 时两条入口 **404**；
  端到端走 `buildApp` 验收图 → 分析 → 落点。★ 它管不了的那半句写在文件头：真实端点的请求形状
  与回复长相全靠 `npm run probe:vision`，本轮**没跑过** —— 单测全绿不等于这条路验过。
- `helpers/fakes.ts` — 共用的内存假端口。★ 给端口加方法时记得在这里补假实现。

## 9. 换真实实现（接缝在哪）

任选其一实现对应 port，再到所属模块的 `compose.ts` 里换实现即可，无需改动模块内的业务层：

- **真实上妆引擎**：实现 `modules/makeup/domain/ports/engine.ts` 的 `generate()`，
  产物仍交给 `makeup/domain/validators/engine-output.validator.ts` 把关。**已接通**，
  `MAKEUP_ENGINE=image`，2026-09-16 落地；该取值 2026-09-17 之前叫 `qwen`。
  ★ 它的**唯一消费者是对话 agent**：真实引擎需要妆面单（`LookSpec`）。
- **换账号存储或哈希算法**：实现 `modules/user/domain/ports/user-repository.ts`
  或 `password-hasher.ts`，在 `user/compose.ts` 换实现。用例与路由不变。
- **换天气源**：实现 `modules/weather/domain/ports/weather-provider.ts`，
  在 `weather/compose.ts` 按 `kind` 分发，再用 `config.weatherProvider` 开一个环境变量。
  拿不到数据要抛 `WeatherUpstreamError`，路由翻成 502，让前端省掉这次天气而不阻塞提交。
  **不要返回假天气。**
- **换衣橱存储**：实现 `modules/cabinet/domain/ports/cosmetic-repository.ts`，在 `cabinet/compose.ts`
  换实现。换到有并发保障的存储后，把件数上限与归属判断从用例下沉到仓库层兜底，端口契约不变。
- **换对话模型或供应商**：实现 `modules/agent/domain/ports/llm.ts` 的 `Llm`，
  在 `agent/compose.ts` 按 `kind` 分发。该端口的形状已经为两支线上协议留好了缝：
  `input_schema` 对 `parameters`、对象入参对 JSON 字符串、`stop_reason` 对 `finish_reason`，
  差异全部关在适配器里，`agent-loop` 与工具看不到。★ 已有适配器**一个就够**。
  现在写第二个没人调用的分支，是一段没有实测支撑、也没人会发现的代码；真要换时再写，
  那时才有验证它的场合。

**读图分析（视觉模型）。** ★ **已接通**，2026-09-29：`VISION_ANALYZER=real`。端口是
`makeup/domain/ports/analyzer.ts`（一个 case 一个适配器）与 `infrastructure/vision/vision-client.ts`
（唯一与厂商说话的缝），分发在 `makeup/compose.ts`。**用户点了才跑**——它不是工具，模型碰不到；
`off` 时那两条入口**根本不注册**，退回用户自己填 brief。
★ 三个 case 都只回答「把图分进哪个闭集」，越界即抛错、**不许兜底**：一个编出来的肤色会一路
流进妆面单和提示词。⚠️ 请求形状与模型名都 `[未验证]`，先跑 `npm run probe:vision`。
★ 端口放 `makeup` 而不新建模块的理由与代价见 `makeup/README.md`。
另：**不得让氛围参考图重新变成风格主输入**（红线 §13-1 / §13-3）——风格图只做文本化分析，
读数只能落进 `LookSpec` 的闭集，**不进引擎**。

★ 「接缝」和「假开关」的区别，就是这份清单存在的意义。上面每一条都是真有第二个实现、
或者已经有明确要接的第二个实现，才值得留的口子。给一个永远不会拨到第二个值的开关，
只会得到又一个假开关，同 §4 末尾那条判据。

## 10. 素材红线

参考样本当前为**自绘演示示意**，license 诚实标注、`sourceUrl` 置空；
正式稿须替换为**可授权素材**并逐张回填来源，**不抓取网络图**。

---

## 这份文档改什么、不该改什么

**该改**的是路由表、错误码表、配置表、测试清单。它们是现状的索引，代码一改就该同步。

**不该改**的是具体实现细节和取舍理由。那些在各模块自己的 `README.md` 和 `docs/plan/` 的设计文档里，
在这里重写一遍就多了一份会漂移的副本，这里只放指针。

与 `server/README.md` 的分工再说一遍，因为它最容易搞混：README 教人用，这份记架构。
想往 README 加「某段代码为什么这么写」之前，先问自己它是不是该在这份里。
