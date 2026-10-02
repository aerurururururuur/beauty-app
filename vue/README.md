# 桃妆 · TAOZHUANG（Vue 3 前端）

一张脸的妆容设计站。13 屏：首页 / 灵感广场 / 我的 + 数字美妆台（试色、我的化妆包）+ 开始设计
（选场景 → 挑一张脸 → 填信息 → 交给后端 agent 出方案与成片）+ 人设库（脸模建档与问卷）。

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
| `VITE_API_BASE` | 后端 API 基础路径，开发时经 Vite 代理到 `http://localhost:3000` |

> ✏️ **2026-10-02：`VITE_USE_MOCK` 删了**（连同 `api/mock.js` / `api/use-mock.js`）。
> 前端**每一屏都走后端**，没有本地假数据这一档了。

## ★ 数据从哪来：三档，别混

这个前端**还是有一部分内容不走网络**。改代码或写文案之前先看清这一屏属于哪一档
（详见 [`AGENTS.md`](AGENTS.md) §1）：

| 档 | 谁 |
| --- | --- |
| **A. 真后端** | 登录 / 注册 / **资料（简介 + 头像）**、**我的化妆包**、**人设库**、**开始设计那条链的会话**（方案 / 出图）、**今日天气**、**数字美妆台的产品库**（目录 / 色号 / 产品性质） |
| **B. 本地推导** | 设计链的**输入侧**（场景卡 / 表单定义） |
| **C. 策展演示内容** | 首页 / 灵感广场 / 我的的展示内容 |

- ★ **2026-10-02：A 档现在真的是"A 档"了**——账号与化妆包以前还有个 `VITE_USE_MOCK` 的
  本地假后端可以切过去，那个开关连同 `api/mock.js` 一起删了。所以**只起前端等于没数据**。
- **B 档不是 mock**：场景卡与表单定义是前端两张常量表（`api/design.js` 的 `SCENES` / `SCENE_FORMS`）。
- ★ **2026-09-30：美妆台的产品目录也从 B 档搬到 A 档**（与上面人设库同一天）。
  它此前是 `api/kb/{catalog,products,shades}.js` 三份手写常量，与后端 `products/` 里的同一批内容
  各存一份（同一件产品两套 id）；现在并成了一份、由 `GET /api/products` 下发。
  ⚠️ 于是 **`/vanity` 与 `/vanity/add` 也要后端**：后端不起，这两屏是**整屏一句人话的错**，
  **不是**一份看起来正常的空目录。
- ★ **2026-09-30：人设库从 B 档搬到 A 档**（此前写着「落在本机 `localStorage`，换台机器就看不到」）。
  一份人设（**连照片**）现在挂在账号下、存在服务端，**换台机器 / 换个无痕窗口登录同一个账号还在**——
  照片落 `<DATA_DIR>/personas/photos/`，**长期保留、没有 TTL**，只有用户自己删掉那份人设才消失。
  ⚠️ 所以页面文案可以说「存在你的桃妆账号里」，**但不许**说「已加密」或「只存在本地」。
  ⚠️ 后端不起就整屏没数据（全目录没有 mock 分支）。
  它唯一跟着 `VISION_ANALYZER` 走的只有 `POST /personas/analyze`（读脸）那一条——见 §8-3。
- ★★ **2026-09-30：设计链改由后端 agent 产出，成片是真出图了。**
  `/form` 把填的东西拼成一份 `brief` 交给后端会话（建会话 → 传照片 → 发开场白），
  **方案（步骤 / 色号 / 产品 / 个性化）由服务端算**，`/result` 上出现的是它。
  出图前**有一次确认**（会花钱）；`/result` 上那两张标着「占位」的图**删了**——
  没出图时那里什么都不摆。
  ⚠️ 代价：**「换风格」从本地毫秒级变成一次 agent 回合（最长 90 秒）**，「生成」是真的要等。
  ⚠️ **这一条链不能靠前端离线**：前端没有 mock 分支。
  ✏️ **2026-10-02：后端也不再有"缺省就能演一遍"的档**——`DASHSCOPE_API_KEY` 必须填，
  方案与成片都真的走模型与引擎（**出图按次计费**）。

### 与后端联调

```bash
# 终端 1
cd vue && npm run dev          # :5173，/api 已代理到 :3000
# 终端 2
cd server && npm run dev       # 后端 :3000
```

★ **两个终端都要开**：设计链那条动线、**人设库**、**数字美妆台的产品库**现在都要走后端。
只起前端时，`/personas` 与 `/vanity` 整屏没数据，`/form` 提交会失败
（会停在本页并给一句人话的错，不会跳到一个空方案页）。
★ 后端那边**要配 `DASHSCOPE_API_KEY`**，否则它自己起不来（2026-10-02 起没有离线档）。

✏️ **2026-09-30 订正过两次，别照旧数字对**：后端 **29 条**路由里桃妆用 **26 条**
（`/users` ×2 · `/personas` ×10 · `/cabinet/items` ×3 · `/agent/sessions/…` ×8 ·
`/products` ×2 · `/weather` ×1）。完整对照表见 `AGENTS.md` §7.1。

## 目录结构

```
src/
├── api/            # 数据层。index.js（唯一的 axios）/ users / cabinet
│                   #   + design / home（本地，无 HTTP）
│                   #   + vanity（两半都走后端：目录经 products.js、化妆包经 cabinet.js，都惰性取）
│                   #   + personas / agent / weather / products
│                   #     ★ **这四个只走后端**：人设库、设计链、天气、产品库（全目录无 mock 分支）
│                   #   + kb/：面部特征、肤色档、风格名
│                   #         · ✏️ 2026-09-30：产品目录 / 色号 / 性质三份并进了后端 products/
│                   #         · styles.js（21 套风格配方）在前端**已零消费者**，但**别删**——
│                   #           后端那份是它的搬迁版，`server/test/styling-plan.test.ts` 拿它当原件对表
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
