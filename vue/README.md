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
| `VITE_USE_MOCK` | `true` 走本地 mock（默认，无需后端）；`false` 走真实后端 |
| `VITE_API_BASE` | 后端 API 基础路径，开发时经 Vite 代理到 `http://localhost:3000` |

> 不创建 `.env` 时默认即 mock 模式（`VITE_USE_MOCK !== 'false'`），保证开箱即跑。

## ★ 数据从哪来：三档，别混

这个前端**还是有一部分内容不走网络**。改代码或写文案之前先看清这一屏属于哪一档
（详见 [`AGENTS.md`](AGENTS.md) §1）：

| 档 | 谁 | `VITE_USE_MOCK=false` 会变吗 |
| --- | --- | --- |
| **A. 真后端** | 登录 / 注册、**我的化妆包**、**人设库**、**开始设计那条链的会话**（方案 / 出图 / 换风格） | 账号与化妆包 ✅ 会（`/users`、`/cabinet/items`）；人设库与设计链**与这个开关无关**，两种模式下都打后端 |
| **B. 本地推导** | 设计链的**输入侧**（场景卡 / 表单定义）、美妆台的产品目录、方案里的色值回填 | ❌ 不会（这几样本来就不该有端点） |
| **C. 策展演示内容** | 首页 / 灵感广场 / 我的的展示内容 | ❌ 不会（没有真实用户数据） |

- **B 档不是 mock**：场景卡与表单定义是前端两张常量表，产品目录与色值回填也只在前端 kb 里。
- ★ **2026-09-30：人设库从 B 档搬到 A 档**（此前写着「落在本机 `localStorage`，换台机器就看不到」）。
  一份人设（**连照片**）现在挂在账号下、存在服务端，**换台机器 / 换个无痕窗口登录同一个账号还在**——
  照片落 `<DATA_DIR>/personas/photos/`，**长期保留、没有 TTL**，只有用户自己删掉那份人设才消失。
  ⚠️ 所以页面文案可以说「存在你的桃妆账号里」，**但不许**说「已加密」或「只存在本地」。
  ⚠️ `api/personas.js` 与 `api/agent.js` 一样**刻意不给 mock 分支**：后端不起就整屏没数据。
  它唯一跟着 `VISION_ANALYZER` 走的只有 `POST /personas/analyze`（读脸）那一条——见 §8-3。
- ★★ **2026-09-30：设计链改由后端 agent 产出，成片是真出图了。**
  `/form` 把填的东西拼成一份 `brief` 交给后端会话（建会话 → 传照片 → 发开场白），
  **方案（步骤 / 色号 / 产品 / 个性化）由服务端算**，`/result` 上出现的是它。
  出图前**有一次确认**（会花钱）；`/result` 上那两张标着「占位」的图**删了**——
  没出图时那里什么都不摆。
  ⚠️ 代价：**「换风格」从本地毫秒级变成一次 agent 回合（最长 90 秒）**，「生成」是真的要等。
  ⚠️ **这一条链不能靠前端离线**：`api/agent.js` 是全仓唯一**刻意不给 mock 分支**的 api 模块。
  想离线看一遍，得让**后端**起在缺省配置上（`AGENT_LLM=mock` 那段演示脚本），
  此时方案与确认框都有，**但那张成片不是真渲染**（`MAKEUP_ENGINE=mock` 把输入照片原样返回）。

### 与后端联调

```bash
# 终端 1
cd vue && npm run dev          # :5173，/api 已代理到 :3000
# 终端 2
cd server && npm run dev       # 后端 :3000
```

★ **两个终端都要开**：设计链那条动线与**人设库**现在都要走后端。只起前端时，
`/personas` 整屏没数据（它没有 mock 分支），`/form` 提交会失败
（会停在本页并给一句人话的错，不会跳到一个空方案页）。
`VITE_USE_MOCK` 只在你要验**账号与化妆包**时才需要设成 `false`。

后端 23 条路由里桃妆用 17 条（`/users` ×2 · `/personas` ×6 · `/cabinet/items` ×3 ·
`/agent/sessions/…` ×6），完整对照表见 `AGENTS.md` §7.1。

## 目录结构

```
src/
├── api/            # 数据层。index.js（唯一的 axios）/ users / cabinet / mock / use-mock
│                   #   + design / home（本地，无 HTTP）+ vanity（目录本地、化妆包走后端）
│                   #   + personas 与 agent（★ **刻意都没有 mock 分支**：人设库与设计链只走后端）
│                   #   + kb/：产品目录、色号、性质、肤质档、面部特征
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
