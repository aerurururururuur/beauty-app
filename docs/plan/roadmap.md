# 场景美妆 · 开发路线图（按模块 · 可派单）

> 定位一句话：让「得体地出现在明天那场面试 / 约会 / 重要场合」，不再是有化妆导师、有预算、有底气之人的特权
> （欧莱雅美妆科技黑客松 · 赛道 3「无界体验家」 · 受众 = 路径 A「重要场合体面平等」 · 初赛提交 2026-10-20）。
>
> 本文件是**给协作者的代码任务板**：按 `server/src/modules/*` 拆模块，任务可直接认领、做完跑门禁即可。
> 产品叙事 / 观众画像 / 提交材料叙事不入此文件；赛道背景与红线见文末「红线（写进验收）」。
>
> 状态（2026-09-10）：server 已按模块拆好、typecheck + 121 用例 + 真实 e2e 全绿；场景理解 / 参考检索 / 上妆引擎均为 mock，
> 接口留作接缝（`SCENE_ANALYZER` / `REFERENCE_PROVIDER` 的开关已真接通，`MAKEUP_ENGINE` 待接引擎时再接）。
> 场合语义已单源化到 `shared/domain/scene-rules.ts`，前后端共享同一份判定。以下 `[x]` 为已完成，`[ ]` 为可认领的剩余工作。

---

## 0. 给提交者的门禁（每条任务合并前都要绿）

```bash
cd server
npm run typecheck   # tsc --noEmit
npm test            # 121 用例全绿
# 动了 HTTP / 流水线语义时,另做一次真实 e2e:
#   PORT=3199 DATA_DIR=./data-e2e npm run dev
#   curl -F "face=@../vue/public/demo/demo-photo.svg" -F 'meta={"occasion":"interview","skinTone":"tan",...}' http://127.0.0.1:3199/api/jobs
#   → 轮询 /api/jobs/:id 到 done;GET /api/jobs/:id/result 取回成品图字节
#   账号:POST /api/users 注册 → POST /api/users/login 核对 → GET /api/users/:id;
#     重名 409 / 密码错 401 / 昵称密码不合规 422 / id 不存在 404,各来一发
#   衣橱:POST /api/cabinet/items → GET ?userId= → PATCH → DELETE → 再 GET 应为空;
#     user 不存在 404 USER_NOT_FOUND / 超 100 条 409 CABINET_FULL;
#     拿别人的 itemId 去改或删 → 404 CABINET_ITEM_NOT_FOUND,**且原数据一字未动**
#   天气:GET /api/weather?city=北京 与 ?lat=39.9&lon=116.4;
#     没地点 422 / 城名查不到 404 / 上游挂 502;再以 WEATHER_PROVIDER=mock 起一次确认 source=mock
#   · Windows/Git Bash:curl -d 带中文会按本地编码发,Content-Length 对不上而报
#     "Request body size did not match Content-Length"——改用 --data-binary @utf8.json
#   场景理解:POST 带 occasion=interview + sceneText=想显得专业但低调 → scene.tags 同时含
#     场合标签与「低调」、direction 有「;按你的要求…」后缀;再发一次只带 sceneText=面试
#     (无 occasion) → label 仍判 interview;SCENE_ANALYZER=off 起一次 → source=off、tags=[]
cd ../vue && npm run build   # 只改了前端才需要
#   ★ 动过 shared/domain/scene-rules.ts、vite alias 或 server.fs.allow 时,必须再 npm run dev
#     实开一次并打开页面:跨根引用只在 dev 暴露,build 过得去不代表 dev 过得去
```

错误码 → HTTP、契约字段、curl 示例的权威描述见 `server/README.md`，别在别处再维护一份。

---

## 1. 模块总览

```
src/index.ts         组装根:loadConfig → 各 createXxxModule → buildApp → 启停(唯一认识全部实现的地方)
└── src/modules/
    ├── shared/            地基:brief 枚举单源 · scene-rules(场合语义·前后端单一源) · AppError(无业务)
    ├── assets/            图片存取:ArtifactStore 端口 + 本地文件系统实现
    ├── understanding/     场景理解:SceneAnalysis + 分析器端口 + mock/off(判定实现在 shared/scene-rules)
    ├── references/        参考妆面检索:ReferenceImage + 提供器端口 + mock(自绘授权诚实)
    ├── makeup/            上妆引擎:Engine 端口 + Look/ResultText + narration + 输出校验 + mock 引擎
    ├── jobs/              Job 生命周期 + 流水线编排:状态机/仓库/队列/用例/控制器/JobView DTO
    ├── user/              账号:昵称+密码(scrypt 哈希) · 注册/登录核对/查档案 · JSON 落盘(无登录态,见 §10)
    ├── cabinet/           衣橱:用户自记化妆品(名称 + 自定义特性)· 归属校验 · JSON 落盘(见 §11)
    ├── weather/           当日天气:open-meteo 实拉(无 key) + WMO 码映射 + mock 兜底
    └── recommendations/   [空壳] 平价同款推荐端口(骨架未 wire)
```

依赖方向：`shared` 只被依赖；`assets / understanding / references / makeup` 相互独立、都被 `jobs` 编排。
跨模块协作**只经各模块 `index.ts`(public barrel)**，禁止直达模块内部文件；依赖图保持无环。

**跨模块「问一句」的规矩**（cabinet 起的头，以后照这个来）：cabinet 要确认 `userId` 指向真实用户，
才不至于把孤儿条目喂给推荐——但它**不 import user 模块**。做法是端口声明在 cabinet 自己的
`domain/ports`（`userExists`），实现由 **组装根 `src/index.ts`** 把 user 的 `getUser` 包一层传进
`createCabinetModule`。依赖图仍无环，模块间仍零 import。

**唯一的跨「端」共享**（understanding 起的头）：场合语义在 `shared/domain/scene-rules.ts`，
前端经 vite alias `@scene-rules` **直接执行后端这个源文件**（浏览器 mock 模式必须与真实后端
给出同一个判定，各抄一份会静默漂移）。代价是那个文件必须**零运行时依赖**（只许 `import type`），
`vue/vite.config.js` 需要 alias + `server.fs.allow` 放行 `../server`（本项目没有 workspace，
dev server 默认根是 `vue/`，不放行取不到）。**加共享文件前先问：真的两端都需要吗？**
色板这类「引擎实现细节」就不要放进来。详见 §2 与 `server/src/modules/shared/README.md`。

### 每个模块的固定规则（照做，别例外）

- 模块内四层：`domain ← application ← presentation`，`infrastructure` 只实现本模块 `domain/ports`；依赖单向向内，domain 不碰框架 / IO。
- `index.ts` = public barrel（跨模块能看到的只有它）；`compose.ts` = `createXxxModule` 组合根，是模块内**唯一装配点**。
- 一个 Zod Schema 作数据形状（shape）SSOT；**schema(形状) ≠ validator(行为)**——校验语义、错误码、清洗放 `domain/validators`。
- 错误统一 `AppError`（`shared`），代码不带 HTTP 状态；由 `shared/presentation/error-handler` 唯一映射成 HTTP。
- 换真实实现 = 实现端口 + 在本模块 `compose.ts` 按 `config.*` 开关分发，业务 / 控制器层不感知。

### 接缝地图（想换哪个能力，改哪）

| 想接真实能力 | 现有 mock（位置） | 要实现的端口 | 接线点 |
| --- | --- | --- | --- |
| 场景理解 → 视觉大模型 | `understanding/infrastructure/scene-analyzer/mock-scene-analyzer.ts` + 判定在 `shared/domain/scene-rules.ts` | `understanding/domain/ports/scene-analyzer.ts` | `understanding/compose.ts`（**已接通** `config.sceneAnalyzer`；`kind` 扩成 `'mock'\|'vision'\|'off'`，**留 `off` 当逃生门**） |
| 参考检索 → 网页 / 图库 | `references/infrastructure/reference-provider/mock-reference-provider.ts` | `references/domain/ports/reference-provider.ts` | `references/compose.ts`（**已接通** `config.referenceProvider`；`off` = 返回空列表且不声称来源） |
| 上妆引擎 → 参数化 / 第三方 API | `makeup/infrastructure/engine/mock-engine.ts` | `makeup/domain/ports/engine.ts`（2 成员：`name`/`generate`） | `makeup/compose.ts`（**尚未接线**：`createMakeupModule()` 还不收参数。`off` 对引擎没意义——没引擎就出不了成品，接真实引擎时再接） |
| 天气实拉 → 换源 | `weather/infrastructure/weather-provider/mock-weather-provider.ts`（离线示意） | `weather/domain/ports/weather-provider.ts` | `weather/compose.ts`（`config.weatherProvider`） |
| 平价推荐 → 规则引擎 | （空壳无 mock） | `recommendations/domain/ports/recommender.ts` | `recommendations/compose.ts` + `src/index.ts` 接入 |
| 衣橱存储 → 数据库 | `cabinet/infrastructure/json/`（无 mock，真实实现） | `cabinet/domain/ports/cosmetic-repository.ts` | `cabinet/compose.ts`（`config.dataDir`，同 user 的做法） |

---

## 2. shared（地基）

- **现状 [x]**：`domain/entities/brief.ts` = 枚举单源——`OCCASIONS`(interview/date/stage/family/daily) · `SKIN_TYPES`(5) · `SKIN_TONES`(light/light_medium/medium/tan/deep **5 档,缺省 `medium` 中间档**) · `WeatherInfo` · `MakeupBrief`；`ImageRef` + `EngineSourceImage`；`AppError`/`ErrorCode`。
- **现状 [x]**（场景语义单源）：`domain/scene-rules.ts` = 场合语义的**前后端单一源**——`SCENE_RULES`(场合→中文名/方向/标签/关键词) · `SCENE_MATCH_ORDER`(命中优先级) · `DEFAULT_OCCASION` · 纯函数 `describeScene(brief)`。它被 `understanding`（mock 分析器）、`makeup`（narration 取中文名）、**前端 `vue/src/api/mock.js`** 三处消费，消灭了此前各抄一份的漂移。
- **关键文件**：`brief.ts` · `scene-rules.ts` · `image.ts` · `app-error.ts` · `infrastructure/config.ts`（.env 读取，属组装关心，不进 barrel）· `presentation/error-handler.ts`。
- **待办 [ ]**：
  - [ ] 未来若要新增维度（如妆品风格偏好），先在 `brief.ts` 加枚举 + 同步 zod schema/validator/测试——**枚举只在这里定义一处**。
  - [ ] 加减**场合**时是两处：`brief.ts` 的 `OCCASIONS` + `scene-rules.ts` 的 `SCENE_RULES`/`SCENE_MATCH_ORDER`（漏配会编译不过 / 测试红），前端 `constants/options.js` 的 `OCCASION_OPTIONS` 也要跟着加（纯展示，无编译期保护）。
  - [ ] `scene-rules.ts` 是唯一跨端共享资产，**禁止加运行时 import / 顶层副作用**（前端会直接执行它）。`understanding.test.ts` 有正则扫源码钉住这条。
  - 无其它结构性待办（地基稳定，勿在 shared 放业务逻辑——`scene-rules` 是例外，见其上文件头说明：场合语义独立于引擎，且枚举本就单源于此）。

---

## 3. assets（图片存取）

- **现状 [x]**：`ArtifactStore` 端口（写输入文件 / 读产物）+ 本地文件系统实现（dataDir 下按类型分目录、rename 原子写）。
- **待办 [ ]**：
  - [ ] 接真实上妆引擎后确认产物写入策略：MockEngine 目前"把本人照片原样收编为 result"，真实渲染产出新文件——复查 `ArtifactStore` 是否需要按 job 隔离产物目录（避免多人 / 多任务串写）。

---

## 4. understanding（场景理解 —— 保「稳」优先）

- **现状 [x]**：`SceneAnalyzer` 端口；判定本身在 `shared/domain/scene-rules.ts` 的纯函数 `describeScene(brief)`——`brief.occasion` 优先（0.92）→ 否则 `sceneText` 关键词命中（0.72）→ 否则 `daily` 兜底（0.4 / 0.3）。`MockSceneAnalyzer` 只是包一层 `sleep(250)`（让前端轮询看到进度），`OffSceneAnalyzer` 不推断（`source:'off'` + `confidence:0`）。**`config.sceneAnalyzer` 已真接通** `mock` / `off`。
- **现状 [x]**（本轮修的短路）：此前 `if (brief.occasion)` 会把 `sceneText` **整个丢掉**——用户写满需求，只要点了场合 chip，方向就固定不动。现在两者同时生效：场合定基调，自由文字里的**修饰词**（低调/加浓/利落/温柔/提气色）追加 `tags` 并在 `direction` 后接一句；场合基准已有的标签整条跳过，不发散。**只改文案与 chip，不改 `label`、不动色板 → 妆效与从前一致。**
- **现状 [x]**：红线钉进测试——修饰词表**刻意不收「显白」**（红线 §13-3）；用户写了也不迎合，`narration` 另有一句正面回应。改修饰词表前先回去读红线。
- **测试**：`server/test/understanding.test.ts`（此前该模块零测试）。
- **待办 [ ]**：
  - [ ] （**可开关加分项，默认关**）视觉大模型读图：由真实照片 / 氛围图提升场景判定置信度。它出错可能让现场 demo 翻车，须默认 off；接缝在 `domain/ports/scene-analyzer.ts` + `understanding/compose.ts`（`kind` 扩成 `'mock' | 'vision' | 'off'`），**保留 `off` 当逃生门**。
  - [ ] `SceneAnalysis.confidence` 目前**零消费者**（算出来、传下去、没人读）：要么接 UI（低置信度时提示用户补一句），要么删字段。**别假设它在起作用。**
  - 注意：风景/氛围参考图**不驱动成片**，只作回显，任何改动不得让它变回风格主输入。

---

## 5. references（参考素材 —— 原创 / 授权红线）

- **现状 [x]**：`ReferenceProvider` 端口；mock 按场景 label 返回自绘样本，license 诚实标注、`sourceUrl` 置空（不抓网络图、无 example.com）。
- **待办 [ ]**：
  - [ ] **替换为可授权素材**：逐张换成 自绘 / 自有 / 可授权 来源，回填 `license` + 真实 `sourceUrl`（主办明文：侵犯第三方知识产权直接出局）。
  - [ ] （可选）参考妆面按 `skinTone` / 场合分层，让「参考」对深肤色用户同样有代表性——需先扩展 `ReferenceImage` 数据 + port 形状，评估后再动。

---

## 6. makeup（核心接缝 · 决定性投入所在）

- **现状 [x]**：`Engine` 端口（`name` + `generate(EngineInput)→EngineResult{ resultFilePath, mimeType, look }`）；`look` = `Look{ style, palette, zones }`；`engine-output.validator` 把关外部产物（路径/类型存在、坐标/比例 0..1、RGB 0..255、opacity 0..1、blur ≥0，非法 → `INTERNAL_ERROR`）；`MockEngine` 按 **occasion 基准风格 × skinTone 调深浅**（深肤色档加深、缺省 medium，不默认浅肤色审美）；`application/narration.ts` 组装「为什么这套」文案。
- **待办 [ ]（wow 的唯一来源 = 上妆像本人、且自然）**：
  - [ ] **拍板（阻塞下面两项）**：① 自研参数化渲染（关键点 + 局部调色合成，可控、原创强） vs ② 第三方上妆图像 API（快而稳，需核授权、原创叙事弱）。**选型方向 + 真实 API 实测规范见 `docs/plan/ai-engine-api-spike.md`（可整单派人）**——先按那里以 Perfect Corp Copy Makeup 为主（个人免企业、¥0 免费单元够 hackathon；美图需企业认证已放弃为主选），再回来勾这一项。
  - [ ] **人脸关键点检测 / 对齐**：真实照片 → 五官关键点（mediapipe 等），坐标才算得准。定位：`makeup` 新 infra（或独立子目录），产出喂给渲染；仍走 `Engine` 端口，`compose.ts` 分发，业务层不感知。
  - [ ] **参数化渲染**：把妆容画到照片像素（唇 / 眼影 / 底妆调色合成），保「素颜真实度」，不做夸张滤镜；实现后产物仍交 `engine-output.validator` 把关。
  - [ ] **保留 mock 分支作离线兜底**：演示永不因引擎崩掉（`config.makeupEngine` 分发，`mock` 常驻可选）。
  - [ ] 真实渲染变慢后，核对 jobs 前端等待体验（见 §7 最后一项）与 narration 文案是否贴合真实妆效。

---

## 7. jobs（Job 生命周期 + 流水线编排）

- **现状 [x]**：状态机 `queued → running → done | failed` + 步骤单调推进（`queued`0 → `scene_understand`20 → `reference_gather`40 → `makeup_generate`70 → `store_result`100）；`JobRepository`(JSON,rename 原子写) · `InMemoryJobQueue`(进程内串行) · 用例 `SubmitJob / RunPipeline / GetJob / GetJobResult` · `JobView` DTO（契约唯一真源 `domain/api/job-view.ts`）· `multipart.ts`(归口 face 1 张 / scene 0..6 / meta JSON) · `jobs.controller` · 错误码映射。
- **待办 [ ]**：
  - [ ] 队列重启即丢任务：**竞赛够用，明确不做持久化**；真要做也只是进程内文件化队列，别引外部中间件。
  - [ ] 接真实引擎后，跑一次端到端量级：若单任务秒级变几十秒，确认轮询 / 超时 / 前端 loading 体验扛得住（改动点在控制器 + vue 轮询逻辑，不是状态机）。

---

## 8. weather（当日天气实拉 · 已接线）

- **现状 [x]**（2026-09-10）：上游 **open-meteo**（无 key、免企业认证）：城市名 → `geocoding-api` 解析坐标 → `api/forecast` 取当日实况 + 当日 UV；`wmo.ts` 把 WMO 码转中文；`GET /api/weather?city=北京` 或 `?lat=&lon=` 返回 `WeatherView{ source, place, condition, temperatureC, humidityPct, uvIndex }`；`WEATHER_PROVIDER=open-meteo|mock` 分发（`weather/compose.ts`）；错误码 `LOCATION_REQUIRED` 422 / `CITY_NOT_FOUND` 404 / `WEATHER_UNAVAILABLE` 502 已进 `shared` 映射表。
- **失败口径（红线 §13-1 的落法）**：拿不到就 502，**绝不返回编造的天气冒充实时**；前端据此**整个不带 `weather` 提交**，不阻塞提交。`mock` 只能在**知情**的离线演示里用，响应带 `source:"mock"` 供 UI 标注「离线示意」。
- **前端接入 [x]**（2026-09-10）：`vue/src/api/weather.js` 调 `/weather`；上传页「当天天气」是城市输入 + 「拉取实时」按钮，返回值只取天气四字段填 `brief.weather`（`place`/`source` 是回显元信息，**不进 meta**——后端 weather schema 是 `.strict()`，多键会 422）；`source` 由后端**原样透传**给 UI 判断，前端不猜来源；拉取失败 / 标了 `mock` 只在说明行标提示色，**不阻塞提交**。mock 模式下不联网、回本地示意值。
- **手动预设已删 [x]**（2026-09-10）：**没有「手动预设」这条回落路**（原 `WEATHER_PRESETS` / `useWeatherPreset` 已移除）。
  理由与失败口径是同一件事：既声明不编造天气，就不该再让人手挑一个假天气混进 `brief`。代价是断网演示时
  提交的 `brief` 里**没有天气**——这是诚实的空，不是缺件；有网就实拉，无网就按本节待办把 `WEATHER_PROVIDER=mock` 写进现场 `.env`，让 UI 明说「离线示意」。
- **待办 [ ]**：
  - [ ] 演示前把 `WEATHER_PROVIDER` 写进现场 `.env`（有网 `open-meteo` / 无网 `mock`），别临场改代码。
  - [ ] （可选）按日期取非当日天气：`WeatherQuery.date` 已预留，当前只取当日实况。

---

## 9. recommendations（空壳 → 接线 · 省钱普惠）

- **现状 [~]**：端口 `recommender.ts` 已声明；`recommendations/compose.ts` 返回 `provider: null`，未接线。
- **输入建模 [x]（2026-09-10 拍板）**：用户「已拥有产品」= **cabinet 衣橱**（见 §11），不是硬编码列表、
  也不塞进 user 档案。推荐真正需要的只是「按 userId 查已拥有品」这一个能力，cabinet 的 `listByUser` 就是那个接缝。
  **代价要认**：衣橱的「特性」是完全自定义的自由键值，**没有稳定的「品类」锚点**——所以「缺什么补什么」这一句
  暂时只能靠 `brief.occasion + 肤质/肤色` 推，不能可靠断言「你已经有唇部了」。取舍理由见 `server/src/modules/cabinet/README.md`。
- **待办 [ ]**：
  - [ ] 规则引擎：`occasion + 肤质/肤色 + 已有品（cabinet.listByUser）` →「缺什么补什么」——**优先已有品，缺的推平价线**；输出诚实标注「品牌参考」，UI 不渲染成广告位。
  - [ ] 定 `RecommendationsProvider` 入参出参形状：入参加「已拥有品」（形状就取 cabinet 的 `CosmeticItemView[]`）；
    **出参要扩** —— `RecommendationItem` 现在只有 `{ id, name, note }`，撑不起「品牌参考 + 为什么推它」。本轮未动 `recommendations` 代码。
  - [ ] `compose.ts` 返回实例、`src/index.ts` 接入（拿 cabinet 的 `listByUser` 喂进来，粘法同 §1「跨模块问一句」）；前端结果页展示推荐区。

---

## 10. user（账号 + 密码 · 已接线）

- **现状 [x]**（2026-09-10）：`User{ id, nickname, passwordHash, createdAt }`；用例 `RegisterUser` / `AuthenticateUser` / `GetUser`；端点 `POST /api/users`（201）· `POST /api/users/login`（200）· `GET /api/users/:id`；错误码 `USER_NOT_FOUND` 404 / `NICKNAME_TAKEN` 409 / `INVALID_CREDENTIALS` 401 已进 `shared` 映射表；`JsonUserRepository` 落 `DATA_DIR/users/users.json`；`ScryptPasswordHasher` 存 `scrypt$<salt>$<key>`（明文不落库）。
- **已拍板（2026-09-10）**：**账号 + 密码**，不做轻量无密码身份；**但不做登录态**——登录只核对、返回 `UserView`，**不签发 token / 不建会话**，前端拿 `id` 自己存。
- **明确不做（本轮）**：找回密码 / 改密 / 注销 / 多机同步 / 账号与任务联动。
- **已知代价（要还再还）**：JSON 单文件是**全表读-改-写**，昵称唯一靠「先查后写」——并发注册会覆盖、且无数据库级唯一约束。要补就新实现一个 `UserRepository`（Node ≥22 可零依赖用 `node:sqlite`）在 `compose.ts` 换掉，用例/校验/路由/测试都不用动。
- **接缝（将来）**：
  - [ ] **任务归属用户**：`JobRecord` / `JobView` 加可选 `userId` →「我的妆造间」历史（动 jobs schema/实体/DTO 三处，**本轮未动 jobs**）。
  - [ ] **登录态**：要 token 就在 `AuthenticateUser` 里补签发（核对逻辑不动），守卫放 `presentation`。
  - [ ] **偏好并入档案**：skinType/skinTone/常用 occasion 预设、已拥有品清单 → 喂上传预填与 `recommendations`。

---

## 11. cabinet（衣橱 · 用户化妆品档案 · 已接线）

- **现状 [x]**（2026-09-10）：`CosmeticItem{ id, userId, name, attributes[{label,value}], createdAt, updatedAt? }`；
  用例 `AddCosmetic` / `ListCosmetics` / `UpdateCosmetic` / `RemoveCosmetic`；端点
  `POST /api/cabinet/items`（201）· `GET /api/cabinet/items?userId=`（200 `{items}`）·
  `PATCH /api/cabinet/items/:id`（200）· `DELETE /api/cabinet/items/:id?userId=`（204）；
  错误码 `CABINET_ITEM_NOT_FOUND` 404 / `CABINET_FULL` 409 已进 `shared` 映射表；
  `JsonCosmeticRepository` 落 `DATA_DIR/cabinet/items.json`（tmp+rename 原子写，同 user）。
- **三条拍板（2026-09-10）**：
  1. **归属靠客户端显式传 `userId`** —— 本轮无令牌、无会话（红线 §13-5），这是唯一可行的归属方式。
  2. **特性完全自定义** —— 只强制 `name`，其余是用户自填的「标签 + 值」自由键值对，**不给枚举**。
     表单给 品类/色号/质地 三个快捷 chip，但**那是约定，不是枚举**——用户仍可写任意标签。
  3. **独立模块，不塞进 user 档案** —— 衣橱是有自己生命周期的 CRUD 资源（增删改、逐条排序、
     将来可能要图片/保质期）；塞进 user 会撑大 `User` 实体和它的 JSON 单表，且每加一个字段都要动 user 的表。
- **不泄露存在性**：改/删若归属不符，报 `CABINET_ITEM_NOT_FOUND`（404）而**不是 403**——不区分
  「这条不存在」与「这条不属于你」。在无守卫的前提下，这是最低成本的一道正确性。
- **上限 `MAX_ITEMS_PER_USER = 100`**：JSON 单表是整表读-改-写，无上限时演示反复添加会越写越慢。
- **明确不做（本轮）**：化妆品拍照识别（红线 §13-5）、条目的图片 / 保质期、公开分享、条目去重合并。
- **前端 [x]**：`pages/CabinetView.vue`（名称 + 动态增删的特性行 + 常用标签 chip；列表可改可删，
  删除是两步确认）· `stores/cabinet.js` · `api/cabinet.js`；入口在主页 `HomeView` 的按钮。
- **接缝（将来）**：
  - [ ] **喂给推荐**：`src/index.ts` 把 `listByUser` 接到 recommendations（见 §9 待办）。
  - [ ] **存储换数据库**：新实现一个 `CosmeticRepository`，在 `cabinet/compose.ts` 换掉，用例 / 校验 / 路由 / 测试都不动。
  - [ ] **品类锚点**（若 §9 非做不可）：加一个**约定标签**常量（不是枚举），或让用户显式选品类——届时再拍一次。

---

## 12. 前端（vue/ —— 非模块目录，独立成板）

- **现状 [x]**：**登录页打头**（`/login` → 主页）→ 上传 → 生成 → 成片对比，衣橱页 `/cabinet` 由主页入口进；
  `UploadView` 表单齐（本人照 + 场合 chips + 肤质 chips + **肤色 5 档色卡** + 穿搭 tag + 天气组 + 自由文字 + 可选氛围图折叠）；
  `stores/{makeup,user,cabinet}.js` / `api/{makeup,weather,users,cabinet,mock}.js` 与 server 语义同源；浏览器纯 mock 模式可跑通。
- **登录门禁 [x]**（2026-09-10）：`router/index.js` 里一条 `beforeEach`——没身份一律先去 `/login`，登完回原路。
  ★ **这不是安全边界**：后端不签发 token、不建会话（红线 §13-5），所以前端拦不住也无需拦住谁，
  真正拦住「看/改别人衣橱」的是**后端的归属校验**。它只是别让人一进来就对着一堆「你是谁」的空表单发呆。
  本地只存 `{ id, nickname }`（`beauty-app.user`），**密码绝不落 localStorage、绝不进 store**；
  `logout()` 顺带 `makeupStore.reset()`——**身份边界就是现场照片的边界**（红线 §13-4 要求即用即删，不靠人记得手动清）。
- **天气去掉手动预设 [x]**（2026-09-10）：原先的「预设天气 chips」已删——**不能既说『绝不返回编造的天气冒充实时』，
  又让人手挑一个假天气提交**。现在只有一条路：填城市 → 实拉 `/api/weather`；拉不到就**整个不带 `weather` 提交**
  （后端 brief schema 里 `weather` 是 `.strict().optional()`，省掉是合法契约，不是绕过），天气永不阻塞提交。
  mock 模式回一份样例值并标 `source:'mock'`，UI 明写「离线示意」。
- **场合判定改调共享源 [x]**（2026-09-10）：`api/mock.js` 原先把后端的场合判定**又抄了一遍**（自己的
  `KEYWORD_RULES` + `OCC` 的 cn/direction/tags），改一边另一边静默漂移。现在 `detectScene()` 整个删掉，
  改调 `describeScene(brief)`——就是 `MockSceneAnalyzer` 调的同一个人，经 vite alias `@scene-rules`
  直读 `server/src/modules/shared/domain/scene-rules.ts`。配套：`vue/vite.config.js` 加 alias +
  `server.fs.allow: ['..']`（本项目无 workspace，dev server 默认根是 `vue/`，不放行取不到 `../server`）。
  ★ **构建过 ≠ dev 过**：这类跨根引用只在 dev 才暴露，改完必须 `npm run dev` 实开一次。
- **待办 [ ]**：
  - [ ] `api/mock.js` 里 `ENGINE_SPECS[x].base` 与 `TONE_MIX` **仍是 `MockEngine` 色板的拷贝**（知情保留）：色板是**引擎实现细节**，提进 `@scene-rules` 会让 shared 里躺一份「将来换真引擎就没人用」的死数据。正确时机是接真实引擎时由 `MockEngine` 导出快照，**不要**再去 shared 里加一张表。
  - [ ] **本地「妆造间」**：把生成历史存本地（localStorage / IndexedDB），“下次大事再备”；与账户 / 后端历史无关。
  - [ ] **分享卡导出**：canvas → PNG 导出成品对比图，作 demo 收尾彩蛋。
  - [ ] （可选加分）**语音讲解**「为什么给你推这套」——赛道「AI 能听能说」点题；成本可控再上（浏览器 SpeechSynthesis 起步）。
  - [ ] **演示照 2~3 张**（不同肤色 / 性别 / 光线）一键载入 + 全空态文案 + 离线兜底。
  - [ ] 接真实上妆后：结果页由 `zones` CSS 叠加平滑演进为「真图为主、zones 为辅」，两条路（浏览器 mock / 后端真引擎）都要通。

---

## 13. 红线（写进验收，任何人改动都不得破坏）

1. **demo 稳 > 一切**：引擎不稳 / 人脸检测失败 / 断网 / 设备故障 → 预设照 + mock + 录播三重兜底。
2. **IP / 原创**：素材、参考图、模板字体逐张记录来源；不抓网络图。参考素材必须 自绘 / 自有 / 可授权。
3. **肤色 / 肤质包容**：`skinTone` 5 档、缺省 `medium`（中间档），**不默认浅肤色审美**；上妆与推荐都按真实肤色走。
4. **肖像与隐私**：演示只用**已授权人物**；现场临时自拍采集最小化、即用即删、口头同意即可；不做任何真实用户数据的留存与上传。
5. **账号边界**：`user` 模块已有**账号 + 密码**（2026-09-10 起）——密码只存 scrypt 凭据，**明文永不落盘 / 进日志 / 回视图**；登录只核对、**不签发 token、不建会话**。仍**不做**：找回密码 / 改密 / 注销、多机同步、PostgreSQL / 队列削峰 / 云存储、教程内容库、购物记录导入、化妆品拍照识别、电商广告位；生产级工程化（鉴权、可观测性、配额）降级为「够干净够稳即可」。

---

## 14. 待拍板（阻塞项，需要 owner 决策后任务才能开工）

- [ ] 渲染方案 ① 自研参数化 vs ② 第三方 API（本周半天验证后拍板 → 决定 §6 的人脸关键点 / 渲染两单怎么派）。
- [ ] 参考素材替换来源与授权范围（谁能贡献自绘 / 可授权图）。
- [ ] （已完成）肤色档数 = 5 档、缺省 medium —— 不再改。
