# 场合美妆镜 · 前端（Vue 3）

为「重要场合」配得体妆容的 AI 上妆项目 Web 前端：上传**本人照片**，选择**场合**并补充肤质/肤色/穿搭/天气/自由文字，后端据此配妆容渲染到照片。前端内置演示模式（mock），后端未就绪也能跑通「上传 → 提交 → 轮询进度 → 妆容对比」全流程。

## 技术栈

- Vue 3（Composition API + `<script setup>`）
- Vite 8
- Vue Router（6 个页面：首页 / 上传 / 结果 / 衣橱 / 登录 / 对话定妆）
- Pinia（跨页面状态：`stores/{makeup,user,cabinet,agent}.js`）
- Axios（HTTP）
- 无 UI 组件库，自定义杂志感设计（暖象牙底 + 浆果红，见 `assets/styles/tokens.css`）

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173

### 配置

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 说明 |
| --- | --- |
| `VITE_USE_MOCK` | `true` 走本地 mock（默认，无需后端）；`false` 走真实后端 |
| `VITE_API_BASE` | 后端 API 基础路径，开发时经 Vite 代理到 `http://localhost:3000` |

> 注意：不创建 `.env` 时默认即 mock 模式（`VITE_USE_MOCK !== 'false'`），保证开箱即演示。

## 页面流程

首页 `/` → 上传 `/upload`（本人照片必填 + 选场合或写一句需求，可再补肤质肤色穿搭天气与可选氛围图）→ 结果 `/result`（任务进度 + 输入回显 + 原图 vs 妆容对比）

另一条独立的出图路径：首页 → 对话定妆 `/agent`（与 agent 聊着把妆面定下来 → 传一张本人照 →
**点一次「确认出图」才真的出图**）。★ 这条**不走 mock**（见下），且它是全项目唯一真的会花钱的动作。

上传页选项常量集中在 `src/constants/options.js`，value 与后端 `meta` 契约的枚举一致：

- **场合 5 个**：`interview` 面试 / `date` 约会 / `stage` 上台 / `family` 见家长 / `daily` 日常
- **肤质 5 个**：`dry`/`oily`/`combination`/`sensitive`/`neutral`
- **肤色 5 档**：`light` 浅 … `deep` 深（默认 `medium` 中档，色卡为本地肤底示意色，不默认浅肤色审美）
- **天气**：骨架先手动切换 4 个预设（实拉免费源是 roadmap W2），默认「晴 24°C / 湿度45% / UV3」

## 与后端联调

真实模式下前端请求（TS 后端 `server/`，契约见其 `domain/api`）：

- `POST /api/jobs`（multipart：`face` 必填、`scene` 0..N 可选、`meta` = 需求简报 JSON）→ `202 { id, status, progress, step }`
- `GET /api/jobs/:id` → `JobView`（轮询到 `done`；`inputs.brief` 回显；含 `scene` / `references` / `result`）
- `GET /api/jobs/:id/result` → 成品图片

开发时代理已配置：`/api` → `http://localhost:3000`（见 `vite.config.js`）。

Mock 模式下：

> ★ **例外：`/agent`（对话定妆）没有 mock。** 其余接口都有浏览器内假后端，对话这条路**刻意没有**——
> 它的状态在服务端一个真实的会话上，而「确认出图」是一条真的会花钱的路由，在浏览器里复刻一份只会
> 让"看起来能用"与"真的能用"分不清。所以 `VITE_USE_MOCK=true` 时对话页**明确显示「对话功能需要真实后端」**。
> 要试它：起后端（缺省 `AGENT_LLM=mock` + `MAKEUP_ENGINE=mock` 就是**离线、不花钱**的演示脚本），
> 再把 `.env` 里的 `VITE_USE_MOCK` 设成 `false`。契约见 `AGENTS.md` §7.2。

- 假流水线 `src/api/mock.js` 复刻上述 JobView 契约：按 `brief.occasion`（或文字关键词，兜底 daily）选场合，`skinTone` 调深浅——与 server mock 适配器同源。
- 妆容预览：前端用 `look.zones/palette` 做 CSS `mix-blend-mode: multiply` 叠加（`resultUrl` 为空时）；真实引擎返回 `resultUrl` 成品图时直接展示。
- 示例素材：`public/demo/demo-photo.svg`（示例人像）。氛围参考图非必填，示例可在结果回显中省去。

## 目录结构

```
src/
├── api/            # axios 实例、接口封装（makeup.js / cabinet.js / agent.js…）、假后端（mock.js）
├── components/     # PhotoUploader / CompareSlider / TipBanner / LoadingOverlay / Icon
├── constants/      # options.js：场合/肤质/肤色/天气可选项与中文名
├── pages/          # HomeView / UploadView / ResultView / CabinetView / LoginView / AgentView
├── router/
├── stores/         # makeup（本人照片/brief 表单/任务）、user、cabinet、agent（对话）
├── utils/          # 颜色工具
└── assets/styles/  # 设计令牌 + 全局样式
```

## 改代码之前

**[`AGENTS.md`](AGENTS.md)** 是本目录的**实现契约**：分层约束、共享组件 props/emit/slot、后端契约与错误码、
双轨 mock 规则、红线、以及「改一个字段要动哪几处」的清单。人接手和 AI 协作都以它为准——
本 README 只讲**怎么跑**，那里讲**怎么改**。
