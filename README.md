# 场合美妆镜 · Occasion Makeup

> 为「重要场合」配一张得体妆容的 AI 上妆应用：上传**本人正面照**，告诉我们要去往的**场合**（面试 / 约会 / 见家长 / 上台 / 日常…），再补上**肤质 / 肤色 / 穿搭 / 当天天气**，AI 依据「场合 × 你的脸」去参考真实妆面，为照片配一套妆容并渲染出来。
>
> 立项语境：欧莱雅黑客马拉松 · 赛道 3「无界体验家」· 受众路径 A「重要场合体面平等」。详见 [`docs/plan/roadmap.md`](docs/plan/roadmap.md)。

当前为**可运行骨架**：场景理解 / 参考图检索 / 上妆引擎均为 mock 实现，接口与分层已按可替换接缝留好，换真实实现不改业务层。

## 业务流程

```
本人照片 ─┐                    occasion 面试/约会/见家长/上台/日常
          ├─► ① 场合理解 ─► ② 按场合检索参考妆 ─► ③ 按肤质肤色配妆并渲染 ─► ④ 返回结果
需求简报  ┘      scene             references            engine               result
(brief)        (label)
```

- **需求简报 brief**：`occasion` + `sceneText`(自由文字) + `skinType` + `skinTone` + `dress` + `weather`，经 multipart 的 `meta`(JSON) 传入。
- **肤色 5 档** `light…deep`，缺省默认 `medium`（中间档）——不默认「浅肤色」审美，按真实肤色调色。
- 0..6 张**氛围参考图**（`scene`）保留为可选：不驱动成片，仅回显（未来视觉读景的接缝）。

异步任务流水线，进度以 `queued → scene_understand(20) → reference_gather(40) → makeup_generate(70) → store_result(100)` 推进，前端轮询可见。

## 仓库结构

| 目录 | 说明 |
| --- | --- |
| `server/` | 后端，TypeScript + **四层清洁架构**（详见 [server/README.md](server/README.md)） |
| `vue/` | 前端，Vue 3 + Vite + Pinia（详见 [vue/README.md](vue/README.md)），内置离线 mock 演示 |

## 快速开始

需要 Node.js ≥ 22。

```bash
# 1) 后端(默认 :3000)
cd server
npm install
npm run dev

# 2) 前端(默认 :5173)
cd ../vue
npm install
npm run dev
```

浏览器打开 http://localhost:5173 。

- 前端默认 **mock 模式**（`VITE_USE_MOCK` 未设为 `false`），无需后端即可演示完整流程；
- 连真实后端：复制 `vue/.env.example` 为 `vue/.env` 并设 `VITE_USE_MOCK=false`，开发时代理把 `/api` 转发到 `:3000`。

一个最小联调（提交「面试 + 小麦肤色」的简报）：

```bash
curl -s -F "face=@vue/public/demo/demo-photo.svg" \
     -F "scene=@vue/public/demo/scenery.svg" \
     -F 'meta={"occasion":"interview","sceneText":"正式终面 干练得体","skinType":"combination","skinTone":"tan","dress":"西装·藏青","weather":{"condition":"晴","temperatureC":24,"humidityPct":45,"uvIndex":3}}' \
     http://localhost:3000/api/jobs          # → 202 { id, status, progress, step }
curl -s http://localhost:3000/api/jobs/<id>  # 轮询到 done,断言 scene.label==='interview'
curl -s -o out.bin http://localhost:3000/api/jobs/<id>/result
```

## 后端架构要点

依赖单向向内，只有组装根 `server/src/index.ts` 认识全部实现：

```
presentation(controllers/HTTP)  →  application(usecases)  →  domain(业务)
infrastructure ──实现──►  domain/ports   (文件存储 / 仓库 / 队列 / mock 引擎…)
```

`domain/` 内部按「类别」细分，各管一事：

| 子目录 | 职责 |
| --- | --- |
| `entities/` | 领域实体与纯函数（Job 状态机、brief 枚举单源、Scene/Reference/Look 等） |
| `schemas/` | **形状/契约**：zod 结构声明（字段格式、类型、长度），无行为 |
| `validator/` | **校验行为**：真正执行输入/输出校验，转成语义错误码并清洗数据 |
| `ports/` | 端口接口：ArtifactStore / JobRepository / JobQueue / SceneAnalyzer / ReferenceProvider / Engine |
| `errors/` | AppError + ErrorCode（不携带 HTTP 状态码） |
| `api/` | 对外 API 契约 / DTO 类型（前后端联调的唯一真源） |

> **schema vs validator**：schema 只描述「长什么样」；validator 才是被上层调用、做校验动作的对象——跨字段业务规则、语义错误码、输出（引擎产物几何/颜色）把关都在这层。

**换真实实现只换 adapter**：真实上妆引擎、视觉大模型场景理解、真实网页/图库参考检索，都只需实现对应 port，业务与 HTTP 层不感知。

## 文档

- [docs/环境搭建-Windows版.md](docs/环境搭建-Windows版.md) — Windows 小白装环境指南（Node.js/VS Code/Git）
- [server/README.md](server/README.md) — 后端分层、HTTP 契约、错误码、命令、测试
- [vue/README.md](vue/README.md) — 前端页面、mock 与联调、目录
- [docs/plan/roadmap.md](docs/plan/roadmap.md) — 产品规划源文档（本次对齐的判定）

## 测试

```bash
cd server && npm test    # Vitest,内存假端口 + validator 用例
```

## 当前是骨架：不做 / 留作接缝

真实妆容渲染引擎、视觉大模型场合理解、真实参考图检索（须逐张回填授权来源，不抓网络图）、天气自动拉取、用户系统与鉴权、削峰队列与多机/云存储。
