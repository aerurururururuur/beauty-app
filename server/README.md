# 场景美妆后端(server/)

TypeScript + **四层清洁架构**的后端：domain ← application ← presentation，`infrastructure` 只实现 `domain/ports`。目前场景理解 / 参考检索 / 上妆引擎均为 mock，接口留作接缝，换真实实现不改业务层。

## 技术栈

- Node.js ≥ 22、TypeScript(ESM + NodeNext)
- Fastify 5(+ `@fastify/cors` / `@fastify/multipart`)
- zod(运行时校验的形状底座)
- Vitest(单测)

## 分层与目录

依赖单向向内，只有组装根 `src/index.ts` 认识所有实现；domain 不依赖框架 / IO。

```
presentation  →  application  →  domain
infrastructure ── 实现 ──►  domain/ports
```

```
src/
├── index.ts                        # 组装根:配置 → new 适配器 → new 用例 → 装配 → 启停
├── domain/
│   ├── entities/                   # 业务实体 + 纯函数(Job 状态机/进度、Scene、Look…)
│   ├── schemas/                    # ★ 形状/契约:zod 结构声明,无行为
│   ├── validator/                  # ★ 校验行为:输入/输出校验,语义错误码,数据清洗
│   ├── ports/                      # ArtifactStore / JobRepository / JobQueue /
│   │                               # SceneAnalyzer / ReferenceProvider / Engine
│   ├── errors/                     # AppError + ErrorCode(不带 HTTP 状态码)
│   └── api/                        # 对外 API 契约 / DTO(联调唯一真源)
├── application/
│   ├── usecases/                   # SubmitJob / RunPipeline / GetJob / GetJobResult
│   ├── narration.ts                # 面向用户的文案组装
│   └── mapping/job-view.mapper.ts  # 领域对象 → domain/api 的 JobView
├── presentation/
│   ├── controllers/                # jobs / health 路由(很薄)
│   ├── multipart.ts                # 归拢 face/scene/scene_text
│   ├── error-handler.ts            # 错误码 → HTTP 的唯一映射
│   └── app.ts                      # Fastify 装配;路由统一挂 /api 前缀
└── infrastructure/
    ├── config.ts                   # .env / 环境变量读取
    ├── file-system/artifact-store.ts   # 实现 ArtifactStore
    ├── json/job-repository.ts          # 实现 JobRepository(临时文件 + rename 原子写)
    ├── queue/in-memory-queue.ts        # 实现 JobQueue(进程内串行)
    ├── engine/mock-engine.ts           # 实现 Engine(返回 look.preview)
    ├── scene-analyzer/mock-scene-analyzer.ts      # 实现 SceneAnalyzer(关键词)
    └── reference-provider/mock-reference-provider.ts  # 实现 ReferenceProvider
```

### schema vs validator

- `domain/schemas` 只声明**形状**：字段结构、类型、`image/*`、长度上限——没有跨字段规则，不做动作。
- `domain/validator` 才是**做校验行为的对象**：被 presentation / application 调用，执行形状表达不了的业务规则并把失败映射成语义错误码，同时校验**输出**（外部引擎产物）。

| 校验器 | 位置 | 行为 |
| --- | --- | --- |
| `job-submit.validator.ts` | 输入 | 至少一个场景、数量上限、face 单张 → `FACE_REQUIRED` / `SCENES_REQUIRED` / `SCENES_MAX_EXCEEDED`；清洗 `sceneText` 后产出 `SubmitJobInput` |
| `job-id.validator.ts` | 输入 | 路径参数 `:id` 格式，非法抛 `VALIDATION_ERROR` |
| `engine-output.validator.ts` | 输出 | 把关引擎产物：成品路径/类型存在；`look.zones/palette` 若声明则坐标/比例 `0..1`、RGB `0..255`、`opacity 0..1`、`blur ≥ 0`，非法抛 `INTERNAL_ERROR`（任务置 failed） |

### Job 聚合与进度

状态机 `queued → running → done | failed`，步骤单调推进：

| step | progress |
| --- | --- |
| `queued` | 0 |
| `scene_understand` | 20 |
| `reference_gather` | 40 |
| `makeup_generate` | 70 |
| `store_result` | 100(done) |

## HTTP 契约(全部挂 `/api` 前缀)

契约类型唯一真源在 `src/domain/api/job-view.ts`。

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /api/jobs` | multipart：`face`(1 张)、`scene`(0..6)、`scene_text`(≤2000 字，可选)；`face` 必有，且 `scene` 或 `scene_text` 至少其一 → **202** `{ id, status, progress, step }` |
| `GET /api/jobs/:id` | 任务视图 `JobView`，轮询到 `status: done`；含 `scene` / `references` / `result` |
| `GET /api/jobs/:id/result` | 结果图片字节流(带 Content-Type) |
| `GET /api/health` | 存活检查 `{ ok, name, uptimeSec, now }` |

### 错误体(与错误码 → HTTP 映射)

统一 `{ error: { code, message, details? } }`：

| 错误码 | HTTP |
| --- | --- |
| `JOB_NOT_FOUND` | 404 |
| `JOB_NOT_READY` / `JOB_FAILED` | 409 |
| `FACE_REQUIRED` / `SCENES_REQUIRED` / `SCENES_MAX_EXCEEDED` / `INVALID_IMAGE_TYPE` / `VALIDATION_ERROR` | 422 |
| `INTERNAL_ERROR` | 500 |
| 框架级(如文件超限) | 保留原状态码(413) |

### 提交示例

```bash
curl -s -F "face=@../vue/public/demo/demo-photo.svg" \
     -F "scene=@../vue/public/demo/scenery.svg" \
     -F "scene_text=雪景 冷调 清透" \
     http://localhost:3000/api/jobs
```

## 配置(env)

`.env.example` → `.env`(已 ignore)：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATA_DIR` | `./data` | 任务记录 + 输入/产物文件目录 |
| `MAKEUP_ENGINE` | `mock` | `mock`(未来 `parametric`/`third-party`) |
| `SCENE_ANALYZER` | `mock` | `mock`(或 `off`) |
| `REFERENCE_PROVIDER` | `mock` | `mock`(或 `off`) |
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

`test/` 用内存假端口(`helpers/fakes.ts`)跑用例，外加 validator 形状/行为用例：

- `job-state.test.ts` — Job 状态机 / 步骤迁移
- `submit-job.test.ts` / `run-pipeline.test.ts` — 用例端到端(假端口)
- `schemas.test.ts` — 纯形状(结构/格式/长度/严格模式)
- `validator.test.ts` — 输入业务规则码 + 输出几何/颜色把关

## 换真实引擎怎么做

任选其一实现对应 port，再到 `src/index.ts` 换一行 new 即可，无需改动 domain / application / presentation：

- 真实上妆引擎：实现 `domain/ports/engine.ts` 的 `generate()`，产物仍交给 `validateEngineResult` 把关；
- 真实场景理解：实现 `scene-analyzer` 端口(视觉大模型)；
- 真实参考检索：实现 `reference-provider` 端口(网页/图库，需遵守授权条款并回填 `license`/`sourceUrl`)。
