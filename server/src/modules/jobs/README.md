# modules/jobs —— Job 生命周期 + 流水线编排

**骨架的「编排者」**：承接 HTTP、驱动整条异步流水线（场景理解 → 参考图 → 上妆引擎 → 收产物），并把任务状态安全推进到 done/failed。跨模块依赖最多，但方向保持单向、无环。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/job.ts` | ★ Job 状态机纯函数：`queued → running → done|failed`、步骤单调推进（queued0→scene_understand20→reference_gather40→makeup_generate70→store_result100）、`advanceTo/startJob/finishJob/failJob/recordScene/recordReferences/displayInputs` 等 |
| `domain/entities/error.ts` | `JobError`（jobs 持有，与 makeup 的 ResultText 分开归属） |
| `domain/schemas/job-submit.ts` | ★ 形状 SSOT：`jobSubmitSchema`（face/scene/metaRaw）+ `metaSchema`（brief 形状：occasion/肤质肤色/穿搭/天气/自由文字，`.strict()`）+ 上限常量 |
| `domain/schemas/job-id.ts` | `jobIdSchema`（`:id` 形状） |
| `domain/validators/*` | **校验行为**：`validateSubmitJob`(meta JSON 解析+业务码+清洗→`SubmitJobInput`) · `validateJobId` · `validate.ts`(zodIssuesMessage) |
| `domain/ports/job-repository.ts` / `job-queue.ts` | 仓库 / 队列端口（本模块持契约） |
| `domain/api/job-view.ts` | ★ 对外契约 DTO：`JobView/SubmitJobResponse/ErrorBody…`（联调唯一真源） |
| `application/usecases/*` | `SubmitJob` / `RunPipeline` / `GetJob` / `GetJobResult` |
| `application/mapping/job-view.mapper.ts` | 领域对象 → JobView |
| `presentation/multipart.ts` | 归口 `face`(1) / `scene`(0..6) 文件 + `meta`(JSON) 标量 |
| `presentation/controllers/jobs.controller.ts` | `registerJobsRoutes`：薄路由层 |
| `infrastructure/json/job-repository.ts` | 临时 JSON 仓库 + rename 原子写 |
| `infrastructure/queue/in-memory-queue.ts` | 进程内串行队列（重启丢） |
| `index.ts` | public barrel（jobs 是编排者，跨模块注入都在 `jobs/compose.ts` 收口） |
| `compose.ts` | `createJobsModule({ dataDir, artifactStore, sceneAnalyzer, referenceProvider, engine })` → `{ jobs, queue, runPipeline, … }` |

## 依赖 / 被依赖

- 依赖：`shared` / `assets` / `understanding` / `references` / `makeup`（全部经 barrel，`shared` 的 config/error-handler 由 `src/index.ts` 深路径取用）。
- 被依赖：无（最外层编排者，被 `src/index.ts` 直接装配）。

## 现状与改法

- **现状**：状态机/仓库/队列/用例/控制器已全通，45 个单测覆盖。
- **明确不做**：队列持久化（重启丢可接受）、外部中间件——竞赛无削峰需求。
- **待办**：接真实引擎后核对端到端耗时；若单任务由秒级变几十秒，确认轮询/超时/前端 loading 扛得住（改动点在 controller + vue 轮询，不动状态机）。
- **怎么改契约**：改 `domain/api/job-view.ts`（DTO）+ `domain/schemas`（形状）+ validator（行为），三处成套，别漏。
