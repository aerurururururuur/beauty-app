# 场景美妆 · 开发路线图（按模块 · 可派单）

> 定位一句话：让「得体地出现在明天那场面试 / 约会 / 重要场合」，不再是有化妆导师、有预算、有底气之人的特权
> （欧莱雅美妆科技黑客松 · 赛道 3「无界体验家」 · 受众 = 路径 A「重要场合体面平等」 · 初赛提交 2026-10-20）。
>
> 本文件是**给协作者的代码任务板**：按 `server/src/modules/*` 拆模块，任务可直接认领、做完跑门禁即可。
> 产品叙事 / 观众画像 / 提交材料叙事不入此文件；赛道背景与红线见文末「红线（写进验收）」。
>
> 状态（2026-09-09）：server 已按模块拆好、typecheck + 45 用例 + 真实 e2e 全绿；场景理解 / 参考检索 / 上妆引擎均为 mock，
> 接口留作接缝。以下 `[x]` 为已完成，`[ ]` 为可认领的剩余工作。

---

## 0. 给提交者的门禁（每条任务合并前都要绿）

```bash
cd server
npm run typecheck   # tsc --noEmit
npm test            # 45 用例全绿
# 动了 HTTP / 流水线语义时,另做一次真实 e2e:
#   PORT=3199 DATA_DIR=./data-e2e npm run dev
#   curl -F "face=@../vue/public/demo/demo-photo.svg" -F 'meta={"occasion":"interview","skinTone":"tan",...}' http://127.0.0.1:3199/api/jobs
#   → 轮询 /api/jobs/:id 到 done;GET /api/jobs/:id/result 取回成品图字节
cd ../vue && npm run build   # 只改了前端才需要
```

错误码 → HTTP、契约字段、curl 示例的权威描述见 `server/README.md`，别在别处再维护一份。

---

## 1. 模块总览

```
src/index.ts         组装根:loadConfig → 各 createXxxModule → buildApp → 启停(唯一认识全部实现的地方)
└── src/modules/
    ├── shared/            地基:brief 枚举单源 · ImageRef/EngineSourceImage · AppError(无业务)
    ├── assets/            图片存取:ArtifactStore 端口 + 本地文件系统实现
    ├── understanding/     场景理解:SceneAnalysis + 分析器端口 + mock(occasion/关键词 → 方向)
    ├── references/        参考妆面检索:ReferenceImage + 提供器端口 + mock(自绘授权诚实)
    ├── makeup/            上妆引擎:Engine 端口 + Look/ResultText + narration + 输出校验 + mock 引擎
    ├── jobs/              Job 生命周期 + 流水线编排:状态机/仓库/队列/用例/控制器/JobView DTO
    ├── weather/           [空壳] 天气拉取端口(骨架未 wire)
    └── recommendations/   [空壳] 平价同款推荐端口(骨架未 wire)
```

依赖方向：`shared` 只被依赖；`assets / understanding / references / makeup` 相互独立、都被 `jobs` 编排。
跨模块协作**只经各模块 `index.ts`(public barrel)**，禁止直达模块内部文件；依赖图保持无环。

### 每个模块的固定规则（照做，别例外）

- 模块内四层：`domain ← application ← presentation`，`infrastructure` 只实现本模块 `domain/ports`；依赖单向向内，domain 不碰框架 / IO。
- `index.ts` = public barrel（跨模块能看到的只有它）；`compose.ts` = `createXxxModule` 组合根，是模块内**唯一装配点**。
- 一个 Zod Schema 作数据形状（shape）SSOT；**schema(形状) ≠ validator(行为)**——校验语义、错误码、清洗放 `domain/validators`。
- 错误统一 `AppError`（`shared`），代码不带 HTTP 状态；由 `shared/presentation/error-handler` 唯一映射成 HTTP。
- 换真实实现 = 实现端口 + 在本模块 `compose.ts` 按 `config.*` 开关分发，业务 / 控制器层不感知。

### 接缝地图（想换哪个能力，改哪）

| 想接真实能力 | 现有 mock（位置） | 要实现的端口 | 接线点 |
| --- | --- | --- | --- |
| 场景理解 → 视觉大模型 | `understanding/infrastructure/scene-analyzer/mock-scene-analyzer.ts` | `understanding/domain/ports/scene-analyzer.ts` | `understanding/compose.ts` |
| 参考检索 → 网页 / 图库 | `references/infrastructure/reference-provider/mock-reference-provider.ts` | `references/domain/ports/reference-provider.ts` | `references/compose.ts` |
| 上妆引擎 → 参数化 / 第三方 API | `makeup/infrastructure/engine/mock-engine.ts` | `makeup/domain/ports/engine.ts`（2 成员：`name`/`generate`） | `makeup/compose.ts`（`config.makeupEngine`） |
| 天气实拉 → 免费源 | （空壳无 mock） | `weather/domain/ports/weather-provider.ts` | `weather/compose.ts` + `src/index.ts` 接入 |
| 平价推荐 → 规则引擎 | （空壳无 mock） | `recommendations/domain/ports/recommender.ts` | `recommendations/compose.ts` + `src/index.ts` 接入 |

---

## 2. shared（地基）

- **现状 [x]**：`domain/entities/brief.ts` = 枚举单源——`OCCASIONS`(interview/date/stage/family/daily) · `SKIN_TYPES`(5) · `SKIN_TONES`(light/light_medium/medium/tan/deep **5 档,缺省 `medium` 中间档**) · `WeatherInfo` · `MakeupBrief`；`ImageRef` + `EngineSourceImage`；`AppError`/`ErrorCode`。
- **关键文件**：`brief.ts` · `image.ts` · `app-error.ts` · `infrastructure/config.ts`（.env 读取，属组装关心，不进 barrel）· `presentation/error-handler.ts`。
- **待办 [ ]**：
  - [ ] 未来若要新增维度（如妆品风格偏好），先在 `brief.ts` 加枚举 + 同步 zod schema/validator/测试——此文件是唯一改点。
  - 无其它结构性待办（地基稳定，勿在 shared 放业务逻辑）。

---

## 3. assets（图片存取）

- **现状 [x]**：`ArtifactStore` 端口（写输入文件 / 读产物）+ 本地文件系统实现（dataDir 下按类型分目录、rename 原子写）。
- **待办 [ ]**：
  - [ ] 接真实上妆引擎后确认产物写入策略：MockEngine 目前"把本人照片原样收编为 result"，真实渲染产出新文件——复查 `ArtifactStore` 是否需要按 job 隔离产物目录（避免多人 / 多任务串写）。

---

## 4. understanding（场景理解 —— 保「稳」优先）

- **现状 [x]**：`SceneAnalyzer` 端口；mock 读 `brief.occasion`，否则 `sceneText` 关键词命中（面试/约会/上台/见家长…），再否则 `daily` 兜底 → `SceneAnalysis{ label, direction, tags, confidence, source }`；`config.sceneAnalyzer` 已留 `mock` / `off` 分发缝。
- **待办 [ ]**：
  - [ ] （**可开关加分项，默认关**）视觉大模型读图：由真实照片 / 氛围图提升场景判定置信度。它出错可能让现场 demo 翻车，须默认 off；接缝在 `domain/ports/scene-analyzer.ts` + `understanding/compose.ts`。
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
  - [ ] **拍板（阻塞下面两项）**：① 自研参数化渲染（关键点 + 局部调色合成，可控、原创强） vs ② 第三方上妆图像 API（快而稳，需核授权、原创叙事弱）。
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

## 8. weather（空壳 → 接线）

- **现状 [~]**：端口 `WeatherProvider{ name, fetch(WeatherQuery)→Promise<WeatherInfo> }` 已声明；`weather/compose.ts` 返回 `provider: null`，**未在 `src/index.ts` 接入**；`brief.weather` 目前由前端手动预设回显。
- **待办 [ ]**：
  - [ ] 实现一个免费天气源 provider（无 key 优先，如 open-meteo；**离线 mock 兜底**），在 `weather/compose.ts` 返回实例、`src/index.ts` 接入，让 `brief.weather` 从「手动预设」升级为「自动拉取」。
  - [ ] 前端：上传页可带城市 / 定位 → 调后端填 `brief.weather`；天气源挂了仍回落到手动预设（不阻塞提交）。

---

## 9. recommendations（空壳 → 接线 · 省钱普惠）

- **现状 [~]**：端口 `recommender.ts` 已声明；`recommendations/compose.ts` 返回 `provider: null`，未接线。
- **待办 [ ]**：
  - [ ] 规则引擎：`occasion + 肤质/肤色 + 已拥有产品` →「缺什么补什么」——**优先已有品，缺的推平价线**；输出诚实标注「品牌参考」，UI 不渲染成广告位。
  - [ ] 输入建模拍板：用户「已拥有产品」从哪来（骨架可本地手选 / 硬编码列表，别建账户体系）→ 再定 `RecommendationsProvider` 入参出参形状。
  - [ ] `compose.ts` 返回实例、`src/index.ts` 接入；前端结果页展示推荐区。

---

## 10. 前端（vue/ —— 非模块目录，独立成板）

- **现状 [x]**：三页动线（上传 → 生成 → 成片对比）；`UploadView` 表单齐（本人照 + 场合 chips + 肤质 chips + **肤色 5 档色卡** + 穿搭 tag + 天气组 + 自由文字 + 可选氛围图折叠）；`stores/makeup.js` / `api/{makeup,mock}.js` 与 server 语义同源；浏览器纯 mock 模式可跑通。
- **待办 [ ]**：
  - [ ] **本地「妆造间」**：把生成历史存本地（localStorage / IndexedDB），“下次大事再备”；与账户 / 后端历史无关。
  - [ ] **分享卡导出**：canvas → PNG 导出成品对比图，作 demo 收尾彩蛋。
  - [ ] （可选加分）**语音讲解**「为什么给你推这套」——赛道「AI 能听能说」点题；成本可控再上（浏览器 SpeechSynthesis 起步）。
  - [ ] **演示照 2~3 张**（不同肤色 / 性别 / 光线）一键载入 + 全空态文案 + 离线兜底。
  - [ ] 接真实上妆后：结果页由 `zones` CSS 叠加平滑演进为「真图为主、zones 为辅」，两条路（浏览器 mock / 后端真引擎）都要通。

---

## 11. 红线（写进验收，任何人改动都不得破坏）

1. **demo 稳 > 一切**：引擎不稳 / 人脸检测失败 / 断网 / 设备故障 → 预设照 + mock + 录播三重兜底。
2. **IP / 原创**：素材、参考图、模板字体逐张记录来源；不抓网络图。参考素材必须 自绘 / 自有 / 可授权。
3. **肤色 / 肤质包容**：`skinTone` 5 档、缺省 `medium`（中间档），**不默认浅肤色审美**；上妆与推荐都按真实肤色走。
4. **肖像与隐私**：演示只用**已授权人物**；现场临时自拍采集最小化、即用即删、口头同意即可；不做任何真实用户数据的留存与上传。
5. **不做**（竞赛红线内的帮倒忙）：账户 / 多机同步、PostgreSQL / 队列削峰 / 云存储、教程内容库、购物记录导入、化妆品拍照识别、电商广告位；生产级工程化（鉴权、可观测性、配额）降级为「够干净够稳即可」。

---

## 12. 待拍板（阻塞项，需要 owner 决策后任务才能开工）

- [ ] 渲染方案 ① 自研参数化 vs ② 第三方 API（本周半天验证后拍板 → 决定 §6 的人脸关键点 / 渲染两单怎么派）。
- [ ] 参考素材替换来源与授权范围（谁能贡献自绘 / 可授权图）。
- [ ] （已完成）肤色档数 = 5 档、缺省 medium —— 不再改。
