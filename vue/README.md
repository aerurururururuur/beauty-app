# 桃妆 · TAOZHUANG（Vue 3 前端）

一张脸的妆容设计站。13 屏：首页 / 灵感广场 / 我的 + 数字美妆台（试色、我的化妆包）+ 开始设计
（选场景 → 挑一张脸 → 填信息 → 生成方案）+ 人设库（脸模建档与问卷）。

## 技术栈

- Vue 3（Composition API + `<script setup>`）
- Vite 8 · Vue Router 5 · Pinia 4（4 个 setup store：`user` / `vanity` / `personas` / `design`）
- Axios（**只有 `src/api/index.js` 认识它**）
- 无 UI 组件库，全手写 CSS（桃枝粉色系，见 `assets/styles/tokens.css`）

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

> 不创建 `.env` 时默认即 mock 模式（`VITE_USE_MOCK !== 'false'`），保证开箱即跑。

## ★ 数据从哪来：三档，别混

这个前端**大部分内容不走网络**。改代码或写文案之前先看清这一屏属于哪一档
（详见 [`AGENTS.md`](AGENTS.md) §1）：

| 档 | 谁 | `VITE_USE_MOCK=false` 会变吗 |
| --- | --- | --- |
| **A. 真后端** | 登录 / 注册、**我的化妆包** | ✅ 会（`/users`、`/cabinet/items`） |
| **B. 本地推导** | 开始设计那条链、人设库、美妆台的产品目录 | ❌ 不会（后端没有这些端点） |
| **C. 策展演示内容** | 首页 / 灵感广场 / 我的的展示内容 | ❌ 不会（没有真实用户数据） |

- **B 档不是 mock**：方案由 `api/kb/styles.js` 的 20 套风格配方当场展开，色值回查 `kb/shades.js`。
  所以「换一版」「换风格」没有等待、没有网络、也不花钱。
- **人设库存在本机浏览器**（`localStorage`，键 `tz:personas:<userId>`，**按账号隔离**），
  换台机器就看不到——页面文案必须如实这么说。
- ★ **今天没有真出图。** `/result` 上那两张图是标着「占位」的块，只有文字方案。
  本项目**唯一**能把妆容渲染到脸上的那条链（`/upload` → `/agent` → 确认出图，会花钱）
  随旧前端一起删掉了。

### 与后端联调

```bash
# 终端 1
cd vue && npm run dev          # :5173，/api 已代理到 :3000
# 终端 2
cd server && npm run dev       # 后端 :3000
```

再把 `.env` 里 `VITE_USE_MOCK` 设成 `false`。后端 16 条路由里桃妆只用 6 条
（`POST /users` · `POST /users/login` · `/cabinet/items` ×4），完整对照表见 `AGENTS.md` §7.1。

## 目录结构

```
src/
├── api/            # 数据层。index.js（唯一的 axios）/ users / cabinet / mock / use-mock
│                   #   + design / personas / home（本地三档，无 HTTP）+ vanity（目录本地、化妆包走后端）
│                   #   + kb/：产品目录、色号、性质、肤质档、面部特征、风格配方
├── components/     # 10 个纯展示组件（AppSidebar / FlowTopbar / Icon / LookCard / PersonaAvatar …）
├── composables/    # 5 个页面级复用逻辑（useQueryParam / useSceneQuery / useFilePick
│                   #   / useObjectUrls / useStepRail）。可引 store 与 api，但 components 不许引它
├── pages/          # 13 个页面
├── router/         # 13 条路由 + meta.nav + 登录门禁
├── stores/         # user / vanity / personas / design
└── assets/styles/  # tokens → base → pages → flow（★ 引入顺序有讲究）
```

> 每个 `.vue` 的块顺序统一为 `<template>` → `<script setup>` →（有的话）`<style scoped>`。
> 本目录没有 lint，写反了没人拦——自检命令见 [`AGENTS.md`](AGENTS.md) §9。

## 改代码之前

**[`AGENTS.md`](AGENTS.md)** 是本目录的**实现契约**：分层约束、数据三档的判别法、
共享组件的 props/emit/slot、后端契约与错误码、红线、以及「改一处要动哪几处」的清单。
人接手和 AI 协作都以它为准——本 README 只讲**怎么跑**，那里讲**怎么改**。

（这份 README 与 `AGENTS.md` 都是 2026-09-30 按桃妆重写的；在此之前它们描述的是已被替换掉的
「场合美妆镜」前端。）
