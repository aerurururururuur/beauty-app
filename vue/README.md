# 场景美妆镜 · 前端（Vue 3）

以「风景为灵感」的 AI 上妆项目的 Web 前端：上传本人照片与一个场景（风景图 和/或 自由文字），后端识别场景并选配妆容渲染到照片。前端内置演示模式（mock），后端未就绪也能跑通「上传 → 提交 → 轮询进度 → 妆容对比」全流程。

## 技术栈

- Vue 3（Composition API + `<script setup>`）
- Vite 8
- Vue Router（3 个页面：首页 / 上传 / 结果）
- Pinia（跨页面状态：`stores/makeup.js`）
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

首页 `/` → 上传 `/upload`（本人照片必填 + 风景图/文字至少其一）→ 结果 `/result`（任务进度 + 原图 vs 妆容对比）

## 与后端联调

真实模式下前端请求（TS 后端 `server/`，契约见其 `domain/api`）：

- `POST /api/jobs`（multipart：`face` 必填、`scene` 0..N、`scene_text` 可选）→ `202 { id, status, progress, step }`
- `GET /api/jobs/:id` → `JobView`（轮询到 `done`；含 `scene` / `references` / `result`）
- `GET /api/jobs/:id/result` → 结果图片

开发时代理已配置：`/api` → `http://localhost:3000`（见 `vite.config.js`）。

Mock 模式下：
- 假流水线 `src/api/mock.js` 复刻上述 JobView 契约，模拟三段进度 + 参考妆 + `engine:'mock'` 的 look（色板/叠加区）。
- 妆容预览：前端用 `look.zones/palette` 做 CSS `mix-blend-mode: multiply` 叠加；真实引擎返回 `resultUrl` 成品图时直接展示。
- 示例素材：`public/demo/demo-photo.svg`（示例人像）、`public/demo/scenery.svg`（雪景）。

## 目录结构

```
src/
├── api/           # axios 实例、接口封装（makeup.js）、假后端（mock.js）
├── components/    # PhotoUploader / CompareSlider / TipBanner / LoadingOverlay / Icon
├── pages/         # HomeView / UploadView / ResultView
├── router/
├── stores/        # makeup 全局状态（本人照/场景/任务）
├── utils/         # 颜色工具
└── assets/styles/ # 设计令牌 + 全局样式
```
