# 时光试妆镜 · 前端（Vue 3）

AI 口红虚拟试色项目的 Web 前端，用 Vue 3 + Vite 构建，内置演示模式（mock），后端未就绪也能完整跑通「上传 → 选色 → 试色结果」全流程。

## 技术栈

- Vue 3（Composition API + `<script setup>`）
- Vite 8
- Vue Router 4/5（4 个页面：首页 / 上传 / 选色 / 结果）
- Pinia（跨页面状态）
- Axios（HTTP）
- 无 UI 组件库，自定义美妆风格（玫瑰渐变 + 圆角卡片）

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
| `VITE_API_BASE` | 后端 API 基础路径，开发时经 Vite 代理到 `http://localhost:8000` |

> 注意：不创建 `.env` 时默认即 mock 模式（`VITE_USE_MOCK !== 'false'`），保证开箱即演示。

## 页面流程

首页 `/` → 上传 `/upload`（自拍必填 + 色卡选填）→ 选色 `/lipstick` → 结果 `/result`（原图 vs 试色前后对比）

## 与后端联调

真实模式下前端请求：

- `GET /api/lipsticks` → 口红色号列表
- `POST /api/analyze`（multipart：`photo`、`color_card?`、`lipstick_id`）→ 试色结果

开发时代理已配置：`/api` → `http://localhost:8000`（见 `vite.config.js`）。

Mock 模式下：
- 口红数据：`src/data/lipsticks.js`（12 个热门色号）
- 试色效果：前端用 CSS `mix-blend-mode: multiply` 在唇部区域（50%, 46%）叠加唇色模拟
- AI 文案：`src/api/mock.js` 内置拍摄指导与试色解读模板

## 目录结构

```
src/
├── api/           # axios 实例、接口封装、mock
├── components/    # PhotoUploader / LipstickCard / CompareSlider / TipBanner / LoadingOverlay
├── data/          # 口红数据库样例
├── pages/         # 四个页面
├── router/
├── stores/        # tryon 全局状态
├── utils/         # 颜色工具
└── assets/styles/ # 设计令牌 + 全局样式
```
