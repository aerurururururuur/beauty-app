# vue/ 前端协作契约（给 AI 与新接手的人）

> **这份文件是什么**：`vue/` 的**实现契约**——分层怎么切、共享组件怎么用、**哪些数据是真的、
> 哪些是本地造的**、后端契约长什么样、哪些红线一碰就废。读完它，你应该能直接改代码而不破坏约束。
>
> **和别的文档的关系**（冲突时按此优先级）：
> `docs/plan/roadmap.md` §13 红线 **>** 本文件 **>** `vue/README.md`（README 讲「怎么跑」，本文件讲「怎么改」）
> **>** 代码注释。
>
> ✏️ **2026-09-29：`docs/plan/*` 已冻结废弃，不要再去那里找权威。** 那些红线**约束本身仍然有效**
> （§8 就是它们的可执行转述，照 §8 做），但**文档不再维护**。**冲突时以代码 + 本文件为准**；
> §8 与代码打架了就来问，别去翻冻结的 plan 找答案。
>
> ✏️ **2026-09-30：这个前端已被换成「桃妆（TAOZHUAANG）」**，原来的「场合美妆镜」那 6 屏
> （`/upload` `/result` `/cabinet` `/agent` + 旧 `/` `/login`）连同 `stores/{makeup,agent,cabinet}.js`
> 一并删除，`src/` 现在是桃妆的家。**这不是一次文件搬迁**——它换掉了整个 IA，也换掉了
> **全项目唯一一条真的会出图的路径**（见 §1 末）。本文件已按新代码重写。
>
> **适用范围**：`vue/` 下的一切。后端**契约**看 `docs/architecture.md`、后端**怎么跑**看 `server/README.md`。
>
> **⚠️ 如果你是在聊天窗口里工作、手上只有对话上下文（读不到仓库文件）——先看 §0。**

---

## 0. 先读：你多半读不到这些文件

这份文档是写给**在聊天窗口里工作、手上只有对话上下文**的 AI 的，不是写给 IDE 文件树读者的。
先确认自己的边界：

- **能直接读仓库** → 跳过本节（但 §0.3 那条「冲突时以代码为准」仍然适用），从 §1 开始。
- **读不到文件** → 本文档里的表格、DTO、组件 props **全是摘要**。它们是为了让你看懂结构，
  **不是可以照抄的全文**。缺什么就让用户粘贴什么——
  **不要猜，不要「按常理推断」，更不要照着摘要自己补全字段。**

### 0.1 怎么开口要

一次要**一个文件、给全路径、说清楚要它干什么**：

> 我需要 `vue/src/api/vanity.js` 的**完整**内容，想确认「我的化妆包」是怎么落到
> `/cabinet/items` 的那些行上的，好照着加一个「移出整件」。麻烦把整个文件粘给我，
> 不要摘要——摘要会漏掉我正需要的那几行。

反例（别这样）：

- ❌「把整个仓库发我」——用户发不全，你也会被淹掉。
- ❌「给我看看 store」——哪个 store？四个文件里的哪一个？
- ❌ **拿到摘要就开始写代码。** 摘要少一个字段，你写出来的就是错的——而且在这种
  **没有测试、没有 TypeScript、没有 lint** 的前端里（§2），**没有任何东西会拦住这个错**，
  它会一路滑到用户手上。

### 0.2 最可能要用到的文件（照用途索要）

| 你要做的事 | 让用户粘贴 |
| --- | --- |
| 改设计链（场景 / 表单 / 方案 / 风格） | `vue/src/api/design.js`、`vue/src/api/kb/styles.js`、对应页面、`vue/src/stores/design.js` |
| 改色号 / 产品目录 | `vue/src/api/kb/shades.js`、`vue/src/api/kb/catalog.js`、`vue/src/api/kb/products.js`、`vue/src/api/vanity.js` |
| 改人设库（脸模） | `vue/src/api/personas.js`、`vue/src/stores/personas.js`、`vue/src/pages/Persona*.vue` |
| 加接口 | `vue/src/api/index.js`、`vue/src/api/<域>.js`、`vue/src/api/use-mock.js`、`vue/src/api/mock.js`、对应 store、后端那个 `domain/api/*.ts` |
| 加 / 改共享组件 | `vue/src/components/<X>.vue` + 调用它的页面 + `vue/src/assets/styles/tokens.css`（+ 对应页面的 css） |
| 改样式 | `vue/src/assets/styles/{tokens,base,pages,flow}.css`，以及目标页面（页内 `scoped`） |
| 改动线 / 路由 | `vue/src/router/index.js`、`vue/src/App.vue`、`vue/src/components/AppSidebar.vue`、相关页面 |
| 核对后端契约 | `server/src/modules/*/presentation/routes/*.route.ts`（**只有 4 个文件**，16 条路由）+ `server/src/modules/*/domain/schemas/api/*.ts` |

> `vue/src/api/kb/styles.js`（450 行）与 `vue/src/assets/styles/flow.css`（2713 行）是大文件，
> 可以只要**相关段落**，但必须说清是哪一段（「`SCENE_STYLES.party` 那一段」/「`.vanity-view--all` 那一块」），
> 且**收到后先核对它是否完整覆盖了你正要用到的上下文**——不完整就再要一次，别将就。

### 0.3 粘贴来的东西怎么用

- **路径 / 行号对不上是常态。** 用户可能只粘了片段，行号会漂。本文档里的 `file:line` 只用来指路，
  **不要当成「第 138 行一定是那句」去对用户断言**。
- **代码和这份文档冲突时，以代码为准**——用户手上跑的那个才是真相。并且**在回复里明说这个冲突**：
  > 你粘的 `kb/skintones.js` 里档位是 `yellow-1` 这种 id，但 AGENTS.md §8 红线 1 举的例子是
  > 后端的 `olive` / `warm_beige`。是文档旧了，还是这里改坏了？

  **别默默按其中一边往下写。** 这类冲突往往正是用户最需要知道的事。
- **用户说「就按文档来」也不等于文档是对的。** 这份文档**描述现状**，不是需求书。
  它和代码不一致时，正确的动作是问、然后**把文档改对**，不是照着一份过期的描述改代码。

### 0.4 你也跑不了验证命令（这条很重要）

§9 要求「改完必须 `npm run dev` 实开一次」——**聊天窗口里的你做不到这件事**。
那就**别声称改好了**。

正确做法：把 §9 的清单原样交回给用户，并**逐条说清哪些是你没验的**：

> 改完了，但下面这些我**没有也无法**验证，麻烦你在本地走一遍：
> 1. `cd vue && npm run dev`，实开一次；`npm run build` 不等于 dev 过（§6.4）；
> 2. 走 `/create` → 选场景 → 人设库选一张脸 → 填信息 → `/result`，**重点看换风格时
>    步骤的数量与顺序有没有跟着变**（那一屏的步数来自数据，不是写死的）；
> 3. `/vanity` → 收一个色号 → 刷新，看它还在不在（这条走 `/cabinet/items`，mock 模式下是本机假的）。
> 我改了 `api/vanity.js`、`stores/vanity.js`、`VanityView.vue` 三个文件；
> `api/cabinet.js` 我没动——如果提交后 404，就是那里。

**说清楚「改了哪几个文件」和「哪一处你没动但可能相关」，比说一句「已完成」有用得多。**
这个前端没有测试、没有类型检查（§2），用户是唯一的验证环节——
**你的交付物不是「代码写完了」，而是「用户知道该验什么」。**

---

## 1. 这个前端在做什么

**桃妆（TAOZHUANG）**——一张脸的妆容设计站。13 屏，两层 IA：

```
/login 登录(唯一不设防的一屏)
  │
  ├─ 第一层「浏览」  /            首页      ├─ 第二层「数字美妆台」 /vanity · /vanity/add
  │                 /inspiration 灵感广场  │  第二层「开始设计」   /create → /form → /result
  │                 /mine        我的      │  第二层「人设库」     /personas · /personas/new
  │                                       │                      /personas/quiz · /personas/:id
侧栏导航(components/AppSidebar.vue),高亮谁由路由的 `meta.nav` 决定(见 §4)
```

**这条链今天是这样的**：

```
/create 选场景 ──► /personas 挑一张脸(或 /personas/new 建一张) ──► /form 填信息 ──► /result 方案
                                                                                      │
                                                              /vanity 数字美妆台 ◄────┘ 「去美妆台看产品」
```

### ★★ 数据从哪来：三档，改之前必须分清

这是本目录**最容易读错、也最容易写出「假开关」**的地方。桃妆的 13 屏背后是**三种完全不同**的数据源，
页面文案与注释必须与所在的那一档对得上：

| 档 | 谁 | `VITE_USE_MOCK=false` 会变吗 | 数据在哪 |
| --- | --- | --- | --- |
| **A. 真后端** | 账号（登录/注册）、**我的化妆包** | ✅ 会 | `POST /users` · `POST /users/login` · `/cabinet/items` ×4 |
| **B. 本地推导** | 开始设计那条链（场景/表单/方案/风格）、人设库、美妆台的**产品目录**那一半 | ❌ **不会** | `api/design.js` · `api/personas.js` · `api/vanity.js` 上半 · `api/kb/*` |
| **C. 策展演示内容** | 首页轮播/推荐/贴士/热点、灵感广场、`/mine` 的统计数字 | ❌ **不会** | `api/home.js` |

- **B 档不是 mock 分支。** 后端**根本没有** `/design/*` 或 `/personas/*` 这些路由
  （见 §7.1 —— 后端全部 16 条路由，一条都不沾这两块）。所以拨 `VITE_USE_MOCK` 对它**逐字无效**。
  方案是 `kb/styles.js` 的 20 套风格配方**当场展开**的，颜色由 `pid + code` 回查 `kb/shades.js`。
  这意味着「换一版」「换风格」**没有等待、没有网络、也不花钱**。
- **C 档也不是 mock 分支**，是**写好的一批演示内容**：没有别人的作品、没有真实的点赞数。
  唯一一处**真数据**是 `/mine` 的昵称，它来自 A 档登录返回的那个 `nickname`。
- ★ **桃妆自己的那几条动线一条都不在这套 HTTP 契约上。** 后端确实有一个能真的出图、真的会花钱的
  `agent` 模块（8 条路由），但它按「会话」走（messages / photo / render），
  **桃妆这条「场景 → 表单 → 方案」要接上去是重写动线，不是替换数据源。**
  那件事没做之前，`api/design.js` 的本地推导**就是这一屏的真相**——不要假装它在联网。

> ### ⚠️ 搬迁的代价：全项目唯一一条真的出图路径被删掉了
> 被替换掉的那个前端里，`/upload` → `/agent` 那条链能真的把妆容渲染到本人照片上
> （`POST /agent/sessions/:id/render`，**会花钱**，且刻意没有 mock 轨）。桃妆没有这条链，
> 它的「结果页」是**文字方案**：步骤、用到的色号、个性化调整——**没有一张脸**。
> `/result` 上那两张图是**标着「占位」的块**，不是渲染结果。
> **想再要真出图，就得把 `agent` 那条链接回来或重走一遍**——这事得用户拍板，别顺手在前端造一张假图。

---

## 2. 技术栈与「这里没有什么」

Vue 3.5（Composition API + `<script setup>`）· Vite 8 · vue-router 5 · Pinia 4 · Axios ·
**无 UI 组件库**（桃妆的视觉全部是手写 CSS）

> ### ⚠️ 这里**没有**的东西（决定了你怎么验证改动）
> - **没有 TypeScript**——`.js` / `.vue`，类型契约靠注释和这份文档维持。
> - **没有测试框架**——`package.json` 里没有 test script，`vue/` 下没有一行测试。
> - **没有 ESLint / Prettier**——格式靠跟周围代码保持一致。
> - **没有 CI**。
>
> 结论：**改完没有任何自动护栏会拦住你。** 你唯一的验证手段是 §9 的手动清单，
> 而其中「`npm run dev` 实开一次」是**不可省略**的一步——见 §6.4。

别名（`vite.config.js`）：`@` → `src/`；`@scene-rules` → `../server/src/modules/shared/domain/scene-rules.ts`。

> ✏️ 2026-09-30：**桃妆也一处都不引 `@scene-rules`。** 它的场景清单（聚会/约会/面试汇报/旅行/奇想）
> 是**桃妆自己的产品概念**，与后端那份 `SCENE_RULES`（面试/约会/上台/见家长/日常）**不是同一套**，
> 刻意没有合并——合了会让「奇想」这种没有后端对应的场景挂在一个不存在的判定上。
> alias 与 `server.fs.allow` **都还留着**，因为 `server/test/scene-rules.test.ts` 读 `vite.config.js`
> 钉着这两样。**别看到没人引就去删 alias。**

---

## 3. 分层约束（硬规矩）

```
pages/  ──►  stores/  ──►  api/  ──►  axios 或 mock
  │                                     ▲
  ├───────►  composables/  ─────────────┘   （页面级复用逻辑；**可以**碰 store 与 api）
  │
  └───────►  components/（纯展示，谁也不碰）
```

`composables/` 与 `pages/` **同层**：它服务的是页面，所以允许引 store 与 api；
但它**不许**被 `components/` 引——纯展示那条线要一眼可查（见第 4 条）。

七条，逐条都有理由：

1. **只有 `api/` 认识 axios。**
   页面和 store 一律不 `import axios`、不发裸请求。新增端点 = 在 `api/<域>.js` 加一个导出函数。
   `api/index.js` 是 axios 的唯一住所（实例 + 错误解包 + `API_BASE`）。

2. **`api/` 不吞错、不编数据。**
   错误一律 `reject`。`api/index.js` 的响应拦截器已经把后端的 `{ error: { code, message } }` 解包成
   `Error.message`，**里面的正文就是给人看的中文**，直接展示即可。
   禁止 `catch` 之后返回一个假对象——那是「编造数据」，见 §8 红线 4。

3. **`stores/` 是跨页面状态的唯一住所。**
   只有页面内用得到的瞬时 UI 状态才留在页面的 `ref` 里（如 `FormView` 的 `inputs`、`ResultView` 的
   `activeStepId`）。四个 store 见 §4。

4. **`components/` 是纯展示组件。**
   props in / emit out / slot 出。**不 import store、不 import api、不发请求**。
   现有 10 个组件全部遵守（`AppSidebar` 连账号名都是 `nickname` 传进来的），新加组件也照此办理。

5. **mock 分支只出现在 `api/*.js` 里，且必须 `await import('./mock')` 惰性引入。**
   页面永远不知道自己在跟谁说话。理由与判别方法见 §6.3。

6. ★ **页面间传业务数据走 `query`，不走 store。**
   （**这条与旧版前端相反**，别照旧文档改。）理由：桃妆的参数**必须可深链**——
   `/result?scene=&style=&persona=` 刷新后还得是那一版方案，`/personas/:id`、`/personas/quiz?photo=`
   同理。只放在 store 里，一刷新就没了，而 store 里那份本来就只是**这次会话的缓存**：
   `design.buildResult()` 能从 URL 参数把同一个结果算回来。
   ⚠️ 唯一不在 query 里的是**登录后的 `?redirect=`**——那条是路由守卫留的，语义上属于 URL。

7. ★ **跨页面重复的逻辑、以及全仓唯一的红线实现点，归 `composables/`。**
   判据是**「重复」或「红线集中」，不是「整洁」**。这两条之外**一律不抽**——
   第 4 条那句「别为『整洁』把它们拆出去」说的就是这件事，两条不冲突：
   页内私有的样式与小组件留在页面里，跨页面重复的逻辑才进 `composables/`。

   现有的 5 条，各自的判据：

   | 文件 | 判据 | 是什么 |
   | --- | --- | --- |
   | `useQueryParam.js` | **重复 11 处**（7 个页面） | 读 `?query=` / `:param=` 上的字符串。导出 `useQueryParam(name, fallback)` 与 `useRouteParam(name, fallback)` |
   | `useSceneQuery.js` | **重复 5 处** | 设计链的 `{ sceneId, pick }`；规则「只有带了场景才进选人模式」原先抄了两份 |
   | `useFilePick.js` | **重复 + 红线** | 隐藏 file input 的「**先清空、再点**」（`pick({camera})`）；同一文件连选两次也要能触发 `change` |
   | `useObjectUrls.js` | **红线集中**（只 1 处也抽） | `URL.createObjectURL` 的 create/revoke 生命周期，卸载时自动收尾（§8-3） |
   | `useStepRail.js` | **自成一体**（约 40 行） | 结果页的步骤滚动高亮 + 锚点跳转，含 IntersectionObserver 的完整生命周期 |

   ★ **`useQueryParam` 的 `fallback` 必须按各页给，别统一**：`/form`、`/result` 的 `scene` 兜底是
   `'party'`，其余各页是 `''`。统一会让那两屏失去兜底。
   ★ **读单个字符串参数才用它**：`ResultView` 的 `applyStyle` 要**摊开整个 query** 再覆盖三个键，
   那种场合直接 `useRoute().query`，别硬套（那个文件里为此两条路并存，注释写了原因）。
   ⚠️ 抽之前先问「是不是只为整齐」——是就别抽。窄一点比多一层好。

**Pinia 写法**：四个 store 全是 setup store（`defineStore('x', () => {...})`）。
**可写状态直接改**（`user.error = '请输入桃妆 ID 与密码'`），只有需要多步逻辑或 async 的才包成 action。
这是现有约定，别改成「一切走 action」。

---

## 4. 目录与文件职责

```
vue/src/
├── main.js                    # createApp + pinia + router + 四份 css（★ 顺序有讲究，见 §5.2）
├── App.vue                    # 外壳：登录页走无侧栏的 .auth 骨架，其余是 .app + AppSidebar
├── router/index.js            # 13 条路由 + meta.nav + 一条 beforeEach 登录门禁（★ 不是安全边界，§8-6）
├── api/
│   ├── index.js               # axios 实例 + 错误解包拦截器；导出 API_BASE。★ 只有它认识 axios
│   ├── use-mock.js            # ★ 只有一行环境变量判断，刻意独立成文件（见 §6.3）
│   ├── users.js               # A 档：POST /users · POST /users/login（桃妆 ID ↔ 后端 nickname 的映射只在这里）
│   ├── cabinet.js             # A 档：/cabinet/items 四条。★ 只被 api/vanity.js 惰性引用
│   ├── mock.js                # A 档的假后端（账号 + 本地化妆包）。只准惰性引入
│   ├── vanity.js              # B+A 混合：目录那半是本地 kb，化妆包那半走 cabinet.js（惰性）
│   ├── design.js              # B 档：场景 / 表单定义 / 方案推导 / 风格候选。★ 全本地
│   ├── personas.js            # B 档：人设库，落在本机 localStorage，按 userId 隔离。★ 全本地
│   ├── home.js                # C 档：首页 / 灵感 / 我的 的策展内容。★ 全本地
│   └── kb/                    # B 档的数据：catalog / features / products / shades / skintones / styles
├── stores/
│   ├── user.js                # 「这次用的是哪个账号」。★ 在首屏链上（见 §6.3）
│   ├── design.js              # 设计链的一次会话缓存（方案 / 表单 / features / fields）
│   ├── personas.js            # 人设库：草稿、缩图、增删改查
│   └── vanity.js              # 美妆台：分类树、目录、我的化妆包、当前选中的产品与色号
├── composables/               # 页面级复用逻辑（5 个，见 §3 第 7 条）。★ 可引 store/api；components 不许引它
│   ├── useQueryParam.js       # 读路由上的字符串参数（+ useRouteParam）
│   ├── useSceneQuery.js       # 设计链的 { sceneId, pick }
│   ├── useFilePick.js         # 隐藏 file input 的「先清空、再点」
│   ├── useObjectUrls.js       # objectURL 的 create/revoke 生命周期
│   └── useStepRail.js         # 结果页步骤滚动高亮 + 锚点跳转
├── components/                # 10 个共享组件（见 §5.1）
├── pages/                     # 13 个页面，每个都是「一个大文件」（60 ~ 336 行）
└── assets/styles/
    ├── tokens.css             # CSS 变量：颜色 / 字体 / 圆角 / 阴影（70 行）
    ├── base.css               # reset + 骨架 + 侧栏 + 通用类（.btn / .tag / .ph …）
    ├── pages.css              # 第一层页面（首页 / 灵感 / 我的）
    └── flow.css               # 第二层动线页（美妆台 / 设计链 / 人设库）· 2713 行，最大的一份
```

`pages/` 不设子目录、不为单个页面抽组件——目前每个页面自成一个 `.vue` 文件，
**页内私有**的样式与小组件就写在同一个文件里（`scoped` 样式 + 页内 `function`）。别为「整洁」把它们拆出去。

★ 这条管的是**页内私有**的东西，**不是**「页面里什么都不许往外抽」——
跨页面**重复**的逻辑与全仓唯一的红线实现点归 `composables/`（§3 第 7 条）。
两者的界线是判据：**「重复」或「红线集中」才抽，「看着整齐」不抽。**

**13 条路由与它们的 `meta.nav`**（`AppSidebar` 的高亮键，写路由上是因为页面组件是懒加载的）：

| 路径 | `meta.nav` | 说明 |
| --- | --- | --- |
| `/login` | — | `meta.public`，唯一不设防的一屏 |
| `/` | `home` | 首页 |
| `/inspiration` | `inspiration` | 灵感广场 |
| `/mine` | `mine` | 我的 |
| `/vanity` · `/vanity/add` | `vanity` | 数字美妆台 / 添新宠 |
| `/create` · `/form` · `/result` | **不写** | 开始设计那条链，一个都不亮 |
| `/personas` · `/personas/new` · `/personas/quiz` · `/personas/:id` | `personas` | 人设库 |

★ **顺序**：静态段必须排在动态段前面——`/personas/new`、`/personas/quiz` 都注册在 `/personas/:id` 之前，
否则会被当成 `id='new'` 吃掉。

---

## 5. 共享组件与样式词汇表

### 5.1 组件契约（10 个，全部纯展示）

#### `Icon.vue` —— 图标

```
props:  name: String(必填)   size: Number|String = 20   color: String = 'var(--color-icon)'
```
`name` 取值表在文件内的 `ICONS` 对象里，**目前 29 个**：
`home brief bulb user wand moon palette faces search bell settings filter camera upload image
heart more lock eye check wechat phone plus clock sparkle plane arrowLeft arrowDown arrowRight`

加图标 = 往 `ICONS` 里加一条 `{ vb, d }`（`vb` 是这个图标自己的 viewBox，见下一条；描边写 `stroke="COLOR"`）。
**两处静默失败，都必须回表核一眼**：
- **取一个不存在的 `name` 不报错，静默渲染空白**（源站有 4 个这样的名字，见 §11-1）；
- **`vb` 写错不报错**，只会静默放大或缩小——每个图标的 viewBox 都不一样（12/14/16/18/20/24/28/40），
  必须逐个标对。

★ `d` 里写的是占位词 `COLOR`，渲染时换成 `currentColor`，再由根上的 `style.color` 驱动。
**不要改写成 `fill="var(--x)"`**——SVG 的 `fill`/`stroke` **属性**里吃不到 CSS 变量，
值非法会被整个忽略，图形变成默认黑。要 CSS 变量只能走 style。

#### `AppSidebar.vue` —— 全站侧栏（登录页不挂它）

```
props:  active: String = ''      高亮谁，取值来自路由的 meta.nav
        nickname: String = ''    账号名，由 App.vue 传进来（它自己不认识 store）
```

#### `FlowTopbar.vue` —— 第二层动线页的顶栏

```
props:  backTo: String = ''       返回目标路径；空 = 不显示返回
        title: String
        steps: Array = []         步骤条文案，★ 由调用方给
        activeStep: Number = 0    ★ 1 起算；0 = 一个都不高亮
```
★ **步骤条每一步都由调用方给**，因为各页步数本来就不一样（源站连相邻两屏都不一致，见 §11-3）。

#### `LookCard.vue` —— 作品卡（首页推荐 / 灵感瀑布流 / 我的作品共用）

```
props:  item: Object(必填)     需要 { title, coverUrl, author?, likes? }
        height: Number = 230   ★ 是**数据不是样式**：瀑布流的错落靠每张卡自己的封面高度产生
        label: String = '妆容封面'
```
`coverUrl` 为空时渲染 `.ph` 占位块，不是破图。

#### `PersonaAvatar.vue` —— 人设头像

```
props:  persona: Object(必填)   size: Number = 72
```
有照片用照片，没有则用**名字首字 + 肤色档底色**合成一个方块脸。
★ 那个底色是 `skinToneHex`（**真人肤色档**），不是装饰色——别为了好看换成品牌粉。
类名固定 `persona-card__avatar`，被首页预览卡（64）/ 人设卡（72）/ 表单页人设条（44）复用。

#### `SkinTonePicker.vue` —— 肤色档单选（8 档）

```
props:  tones: Array = []       来自 kb/skintones.js
        modelValue: String = '' v-model，选中档 id；空 = 未选
```
★ 提示语「照片难免有色差，AI 给的是建议档」是**产品要求**：这里的值永远由**用户确认**，
不能把 `personas.analyze()` 的返回值当判定结果直接存（红线 §8-1）。

#### `FeaturePicker.vue` —— 面部特征多选（按分组铺）

```
props:  groups / features / modelValue（v-model 绑的是**选中的特征 id 数组**）
```
用在两处（问卷建档 / 详情改档），两处的数据都来自同一份 `kb/features.js`——别在页面里再抄一份标签。

#### `ErrorNote.vue` —— 错误提示条

```
props:  text: String = ''   空串 = 整块不渲染（不是渲染一个空框）
```
★ 文案就是后端 `message` 的**原文**。前端**不按 `error.code` 分支**、不写自己的映射表。

#### `EmptyState.vue` —— 空状态

```
props:  text: String = '暂无内容'
```
★ **文案由调用方给**——不同列表的空态说法不一样（`/mine` 三个 Tab 各一句），别在这里写通用兜底。

#### `BrandMark.vue` —— 品牌标识：五瓣桃花

```
props:  size = 32   color = 'var(--color-peach)'   center = 'var(--color-rose)'
```

### 5.2 样式：四份 CSS + 设计令牌

`main.js` 里的引入顺序**有讲究，别调换**：

```
tokens（下面三份都吃它的变量）→ base（骨架/侧栏/通用类）→ pages（第一层页面）→ flow（第二层动线页）
```
后两份的选择器更具体，顺序反了会被 `base` 压掉。

**① 设计令牌**（`assets/styles/tokens.css`）——颜色、字体、圆角、阴影，**一律用变量，禁止写死色值**。
桃妆的色系叫**桃枝粉**：`--color-peach` / `--color-rose` 为主，另有 `--color-green` / `--color-aqua` 两个辅色。
（早先那份「暖象牙 + 浆果红」的 `--c-*` 令牌**已随旧前端一起删除**——看到 `--c-accent` 这类名字一定是过期的。）

**② 共用类**（`base.css`）：`.btn`(`--primary` / `--soft` / `--danger` / `--brand` / `--done`)、
`.tag`、`.ph`（占位块）、`.field`、`.topbar`、`.content`、`.icon-btn`、`.checkbox`、以及侧栏那一套 `.side-*`。

**③ 页面专属样式**写在 `pages.css` / `flow.css`，或页面自己的 `<style scoped>` 里。
`.ph` 占位块是这套设计里的重要一环：**桃妆所有还没图的地方都渲染 `.ph` 而不是破图**（§8-4）。

---

## 6. 数据来源与惰性引入规则

### 6.1 三档数据（见 §1）在代码里的判别法

看见一个 `api/*.js` 函数，先问「它背后有没有 HTTP 路由」，答案在 §7.1 那张表里对。
**没有路由的那几档，函数里不该出现 `axios`、`useMock()`、`import('./mock')` 任何一个**
——出现了就是把本地推导写成了假后端，本仓最怕的那种。

### 6.2 `api/vanity.js` 是全仓最容易读错的一个文件

它**一半接后端、一半本地**，两边必须在脑子里分开：

| 部分 | 来源 | 代表函数 |
| --- | --- | --- |
| 产品目录 / 分类树 / 色号库 / 产品性质 | **本地 `kb/`**（后端没有这些端点） | `fetchVanityTree` `fetchCategoryProducts` `fetchCatalogProducts` `fetchShades` `fetchProductInfo` |
| 「我拥有什么」（我的化妆包） | **真后端 `/cabinet/items`** | `fetchBag` `addProducts` `addShade` `removeShade` `removeProduct` |

**化妆包怎么落到那四条端点上**（改这个文件之前必须读这段）：

后端那条端点的模型是 `{ name, attributes: [{label, value}] }`，而 **`attributes` 单条值 ≤ 40 字符**。
所以**不能**把「我有的色号」拼成一条特性——小金条有 14 个色号，拼起来 50 多字，**一提交就 422，
而界面上看起来一切正常**（正是本仓的「假开关」类型）。于是按**色号粒度**落库，一件产品占若干行：

- 「整件」行 —— `attributes = [{label:'产品', value:<pid>}]`
- 「色号」行 —— `attributes = [{label:'产品', value:<pid>}, {label:'色号', value:<code>}]`

一件产品**恒有且只有一条「整件」行**——它是「这件在包里」的唯一凭据，所以丢掉最后一个色号时
产品仍留在包里。`ATTR_PRODUCT = '产品'` / `ATTR_SHADE = '色号'` 这两个字面值是本地与后端的**唯一**约定，
改名等于让已有数据读不出来。

⚠️ **已知代价，别当成 bug**：后端单用户上限 100 件（`MAX_ITEMS_PER_USER`），而这里一件 + N 色号 = N+1 行。
收录十几支口红的全部色号就会撞上限，后端回 `CABINET_FULL`(409) 并给人话 message，前端原样展示即可。

### 6.3 惰性引入（`api/use-mock.js` 为什么单独一个文件）

它**只是一个环境变量判断**，但它在**首屏链**上（`router 守卫 → stores/user → api`）。
如果它住在 `mock.js` 里，那几十 KB 的假后端会被打进首屏包，真实后端模式下白下载。所以：

> **任何 `api/*.js` 里的 mock 分支，必须写成 `await import('./mock')` 惰性引入。禁止静态 `import`。**
> 同理，`stores/user.js` 里 `@/api/users` 也是惰性引入的（否则 axios 被拽进首屏）。
> ★ **同一根绳子的另一头**：`api/vanity.js` 里那条 `function cabinet() { return import('./cabinet') }`
> 也**不许**写成文件顶部的静态 import —— `stores/vanity.js` 在首屏链上静态引 `api/vanity`，
> 静态引 `./cabinet` 就等于把 axios 拽进首屏包（它只在「我的化妆包」那一屏才用得上）。

⚠️ **这条没有任何工具能查出来**（本目录零 lint、零测试）。判别方法——`npm run build` 之后：

```bash
cd vue && npm run build
grep -l AxiosError dist/assets/*.js    # 期望：只列出 index-*.js 之外的某个分块
```
（`grep -c` 在 0 命中时**退出码是 1**，所以列文件名比数个数好用——数个数那条看起来像报错，其实是你要的结果。）
axios 应该待在**另一个分块**里。2026-09-30 那次构建的实测结果：
`index-Ci_tvZyZ.js` 142.37 kB（axios 命中 **0** 次）、`use-mock-D0sEYzJ8.js` 50.37 kB（axios 在里面）、
`mock-9P8snK9u.js` 单独的假后端分块。
★ 分块名叫 `use-mock-*` 而不是旧文档写的 `api-*`，是 rollup 给这个动态组挑的名字——**别按名字找，
按「axios 在不在 `index-*` 里」判断**。哪天它出现在 `index-*` 里了，就是有人写成了静态 `import`。

### 6.4 ⚠️ 构建过 ≠ dev 过

`vite.config.js` 里配了 `server.fs.allow: ['..']`（项目根目录没有 `package.json`，
dev server 默认只放行 `vue/`），而 `@scene-rules` 指向 `../server/`。
**动了 alias 或 `fs.allow`，必须 `npm run dev` 实开一次**，`npm run build` 通过说明不了任何事。
（2026-09-30 起前端没有活着的 `@scene-rules` 调用点，所以这条风险暂时压在「配置还在」上
——alias 一删就立刻重新成立。）

---

## 7. 后端契约

> **类型唯一真源在 `server/src/modules/*/domain/schemas/api/*.ts`。**
> 本节是给前端看的转述；两边对不上时，**以后端那个 `.ts` 为准**，并回来改这一节。

### 7.1 端点总表 —— 后端有 16 条，桃妆只用 6 条

> ★★ **先看这张对照表再动手。** 「后端有这个端点」不等于「前端在用它」：
>
> | 模块 | 路由数 | 桃妆用了几条 |
> | --- | --- | --- |
> | `user` | 3 | **2**（`POST /users` · `POST /users/login`）——`GET /users/:id` 无人调用 |
> | `cabinet` | 4 | **4**（全部） |
> | `agent` | 8 | **0** —— 那 8 条是「对话定妆」，桃妆没有那条动线（见 §1 末） |
> | `weather` | 1 | **0** —— 桃妆没有天气那一栏 |
> | `GET /health` | 1 | 0（部署探活用） |
>
> 这 10 条没被调用的路由**不是给人的菜单**：它们属于被替换掉的那个前端，
> 或者属于还没接上的能力。**别为了让某屏"看起来更真"随手接一条上去。**

| 方法 & 路径 | 请求 | 成功响应 | 桃妆 |
| --- | --- | --- | --- |
| `POST /users` | `{ nickname, password }` | **201** `UserView` | ✅ 注册 |
| `POST /users/login` | `{ nickname, password }` | **200** `UserView`；不符 **401** | ✅ 登录 |
| `GET /users/:id` | — | **200** `UserView` | — |
| `POST /cabinet/items` | `{ userId, name, attributes? }` | **201** `CosmeticItemView` | ✅ |
| `GET /cabinet/items?userId=` | — | **200** `{ items: [...] }` | ✅ |
| `PATCH /cabinet/items/:id` | `{ userId, name?, attributes? }`（二者至少给一个） | **200** `CosmeticItemView` | ✅ |
| `DELETE /cabinet/items/:id?userId=` | — | **204** 无响应体 | ✅ |
| `POST /agent/sessions` | `{ userId, ...brief 平铺 }` | **201** `AgentSessionView` | — |
| `GET /agent/sessions/:id?userId=` | — | **200** `AgentSessionView` | — |
| `POST /agent/sessions/:id/messages` | `{ userId, text }` | **200** `AgentTurnView` | — |
| `POST /agent/sessions/:id/photo` | multipart：`face` + `userId` | **200** `AgentSessionView` | — |
| `POST /agent/sessions/:id/render` | `{ userId }` | **200** `AgentTurnView` ★ **会花钱** | — |
| `GET /agent/sessions/:id/renders/:seq?userId=` | — | 图片字节流 | — |
| `POST /agent/sessions/:id/images` | multipart：`file` + `kind` + `userId` | **200** `AgentSessionView` | — |
| `POST /agent/sessions/:id/analyses` | `{ userId, kind }` | **200** `{ session, kind, status }` ★ **会花钱** | — |
| ⚠️ 上面两条 | **服务端配 `VISION_ANALYZER=off`（缺省）时根本不注册 → 404** | | — |
| `GET /weather` | `?city=` 或 `?lat=&lon=` | **200** `WeatherView` | — |

### 7.2 DTO 形状（JS 视角）

```js
// UserView（★ 永不含密码/凭据）   { id, nickname, createdAt }
// CosmeticItemView               { id, userId, name, attributes:[{label,value}], createdAt, updatedAt? }
```

**桃妆只碰这两个形状。** 另外几条（`AgentSessionView` / `AgentTurnView` / `WeatherView`）今天没有任何
调用点——**接 `agent` 那条链之前，先把它的契约从后端那份 `.ts` 重新读一遍**，别照 §7.1 的表格推。

★ **字段名对不上是 `api/users.js` 的全部要点**：桃妆登录页收的是「桃妆 ID」，
后端那个字段叫 `nickname`。两边是**同一个东西的两个名字**，映射**只写在这一处**——
换名字改这里，不要去改后端的 schema，也不要在 store 或页面里各拼一次。
后端对 `nickname` 的约束是 2–32 字（太短/太长会 422，message 已是人话）。

`attributes` 最多 12 条、标签去重；名称 ≤40 字；**单条特性值 ≤40 字符**；单用户上限 100 件（§6.2）。

### 7.3 错误体与错误码

统一 `{ error: { code, message, details? } }`。`api/index.js` 已把它解包成 `Error.message`。

| 错误码 | HTTP | 前端该怎么办 |
| --- | --- | --- |
| `USER_NOT_FOUND` | 404 | 账号没了（**这台浏览器存着的登录在服务端查无此人**） |
| `CABINET_ITEM_NOT_FOUND` | 404 | 「不存在」与「不属于你」**共用**，别去区分 |
| `CABINET_FULL` | 409 | 化妆包满了（§6.2 那个 100 行的代价） |
| `NICKNAME_TAKEN` | 409 | 昵称占用 |
| `INVALID_CREDENTIALS` | 401 | ID 或密码错，**不泄露账号是否存在** |
| `VALIDATION_ERROR` | 422 | 请求体非法 / 枚举越界 / 多给了一个键（`.strict()`） |
| `INTERNAL_ERROR` | 500 | 服务端内部错误 |

**前端不按 code 分支。** 现有代码一律只展示 `message`——后端给的 message 已经是准确的中文
（如「昵称已被占用」）。除非你要做**特定 code 的特殊动线**（目前没有），否则别引入 code→文案的映射表。

### 7.4 联调

```bash
cd vue && npm run dev          # :5173，/api 已代理到 :3000
# 另一个终端：cd server && npm run dev
```
**不创建 `.env` 也能跑通全流程**（默认 mock，见 §8-7）——但那只覆盖 A 档的账号与化妆包。
桃妆的 B、C 两档（设计链、人设库、首页内容）**根本不经过网络**，起不起后端都一样。

---

## 8. 红线（前端视角：代码里不能出现什么）

> 上游是 `docs/plan/roadmap.md` §13。这里只做**可执行的转述**。
> ✏️ 2026-09-29：那份 plan **已冻结**（见文件头），**这一节才是你要照着做的那份**。
> ✏️ 2026-09-30：第 3 条按桃妆的新口径重写过（**与旧版相反**），第 4 条是搬迁后新增的。

1. **不默认浅肤色审美。**
   肤色档**没有默认值**——`SkinTonePicker` 的 `modelValue` 空着就是「未选」，
   页面不许出现 `skin || 'yellow-1'` 这种兜底。
   色卡 `SKIN_TONES[].hex` 是真实肤底色，**不许调成「更白更好看」**。
   文案里**不出现「显白」**（⚠️ 今天有两处存量违反，见 §11-4，别照抄那两处的语气写新文案）。
   ★ **照片分析只给「建议档」，最终档位由用户确认**——`personas.analyze()` 的结果不能直接落档。

2. **密码只在请求体里出现一次。**
   不进 store、不进 `localStorage`、不进日志、不进 URL。
   `stores/user.js` 只持久化 `{ id, nickname }` 两个公开字段（键 `beauty-app.user`），**多出来的键一律丢弃**
   （`readStored()` 那道类型检查就是干这个的）。
   `api/users.js` 拿到 `UserView` 后**没有任何凭证可存**——后端不签发 token、不建会话。

3. ★★ **照片：桃妆的口径与旧版前端**不同**，别照旧文档改。**
   旧前端写的是「本人照片即用即删、一律不落盘」。**人设库那条故意不是这样**——它的功能就是
   「把一张脸存下来反复用」。所以今天的规矩是**分两类**：
   - **人设库的照片**：以 dataURL 存进 `localStorage`，键 `tz:personas:<userId>`
     （★ **按账号隔离**：共用电脑上「A 退出、B 登录」之后 B 不该看到 A 的脸）。
     **但绝不经任何网络、绝不上传**——`api/personas.js` 里没有一行 HTTP。
   - **其余任何预览图**（如 `FormView` 的信息图上传）：走 `URL.createObjectURL`，
     **每次都要有对应的 `revokeObjectURL()`**——移除时收一份，`onBeforeUnmount` 收剩下的。
     没接上就是每选一张图漏一份内存，而且 blob URL 会把文件一直钉在内存里。
   - ★ 存进去之前**必须先缩图**（`shrinkPhoto`，长边 ≤640 / q0.82，典型 40–90 KB）。
     手机照片转 base64 常有 3–6 MB，而 localStorage 配额通常只有 5 MB——
     第一张就可能 `QuotaExceededError`，而且它**不抛到界面上**：建档"成功"、刷新后人没了。
     三道防线一道都不能省：缩图 → `writePersonas()` **不吞异常** → 种子人设的照片走
     `public/` 下的静态 SVG（不进配额）。

4. ★★ **不许把「本地算出来的 / 策展来的」讲成「真的」。**（这是本仓头号 bug 类型：假开关）
   配置错/缺失但照跑、返回 200、日志干净，**只有结果是错的**。桃妆的四个具体形状：
   - **`api/design.js`** 的整套方案是本地推导，**后端没有 `/design/*`**。
     所以：结果页**不许**写「AI 正在为你编排妆容步骤」这类等待/进行中的文案
     （本地一次计算是毫秒级的，做假等待屏等于告诉用户刚才有台服务器在干活），
     也不许声称方案读了你填的信息（见下一条）。
   - ★ **`stores/design.js` 的 `fields` 今天没有任何东西读它。** 填信息页收上来的
     `{ key, type, text, images }` 只是存着，**方案完全由 `sceneId` / `styleId` / `features` 推导**。
     结果页**不许**声称「已根据你的描述调整」。留着这一格是为了接后端时有个明确的落点，
     **不是为了"看起来用了"**。
   - **`/result` 的前后两张图是标着「占位」的块**，不是渲染结果。本地方案算得出步骤与色号，
     算不出一张脸。不许摆假图、不许把 `.ph` 说成效果图（真出图见 §1 末）。
   - **`snapshotDesign()`** 返回的是一份**本地 JSON 快照**，没有落到任何服务端。
     所以按钮文案是「已记下这一版」，**不是**「已保存到我的作品」——后者会让人以为换台机器还能看到。

5. **商业内容可辨认、不搬运。**
   产品性质（`kb/products.js` 的 `voice` 字段）**摘自品牌资料，不是我们采集的口碑**——
   转述时必须说清出处，**不许讲成用户口碑或中立评测**（⚠️ `VanityView.vue:275` 今天的标签
   就是「用户口碑」，见 §11-4）。**空着也比硬贴强**：`productInfo.voice` 为空时整块不渲染。
   ★ **只有真收了钱才写「赞助」**——少标一个字只是不够显眼，多标一个字是**虚假披露**。

6. **登录门禁不是安全边界。**
   `router/index.js` 的 `beforeEach` 只看本地那份 `{ id, nickname }`，**拦不住也不该假装能拦住谁**。
   真正的把关在后端（化妆包改/删一律校验归属，不属于你就报 404）。
   **别把这段代码写成「安全」的样子**，更别基于它做任何「用户只能看到自己的数据」的假设。

7. **演示模式（`VITE_USE_MOCK !== 'false'`）只覆盖 A 档。**
   它假的是**账号与化妆包**（`api/mock.js`，化妆包落在 `localStorage` 的
   `beauty-app.mock-cabinet`，复刻「刷新后还在」）。
   ★ 演示模式**不校验密码**，也**刻意不存明文密码、不做假校验**——没有后端就没有 scrypt。
   ★ **别往里补假的方案、假的人脸分析结果**，那会让「看起来能用」和「真的能用」分不清。
   B、C 两档（设计链、人设库、首页内容）**与这个开关无关**，两种模式下逐字相同。

---

## 9. 改动的验证清单

> **⚠️ 你跑不了这些命令（在聊天窗口里工作）？** 见 **§0.4**——**不要声称已验证**，
> 把下面的清单原样交给用户，并说清你改了哪几个文件、哪一处没动但可能相关。

### 通用（每次都要）

```bash
cd vue && npm run dev     # ★ 必须实开。构建过 ≠ dev 过（见 §6.4）
```

**块顺序自检**（改了任何 `.vue` 之后跑；**无输出 = 全部合规**）：

```bash
cd vue && awk 'FNR==1 && $0!="<template>" {print "顺序不对: " FILENAME}' src/App.vue src/pages/*.vue src/components/*.vue
```

SFC 的块顺序**一律** `<template>` → `<script setup>` →（有的话）`<style scoped>`。
本目录**零 lint、零测试**（§2），没有任何工具会拦住写反的文件，所以只能靠这条命令主动验。
★ 它同时盯住「首行就是 `<template>`」——把一个空行或注释顶在最前面也会被它抓出来。

### 主链路：开始设计（B 档，最容易被改坏的一条）

**不联网也能走完**，`VITE_USE_MOCK` 两种模式行为相同（§1）。

1. `/create` → 5 张场景卡；点任一张 → 进人设库且**已经切到挑人模式**（`?scene=&pick=1`）。
2. 挑一张脸 → `/form`。★ **`?persona=` 缺失或那份人设已删时必须回人设库**，
   不许停在一个没有依据的空壳表单上。
3. 填信息：每个字段「文字 / 图片」两个页签**二选一显示，但提交时两种都要收**。
   选一张图 → 移除 → **控制台里不应有 blob 泄漏**（这条只能靠肉眼看代码 `revoke` 有没有接上）。
4. 提交 → `/result`。★ **重点看这三样**：
   - 步骤的**数量与顺序**来自数据（6~11 步不等，随风格变）——页面里不该出现写死的步骤名或步数；
   - 顶部「换一个妆容风格」点另一个 → **步骤列表整列重建**，URL 的 `?style=` 跟着变；
   - 「换一版」→ 换到候选池里的下一个，`?style=` 也跟着变。
5. **刷新 `/result`** → 还是同一版（三个 query 参数就是全部状态）。
6. 步骤导航：滚动时**反向高亮**跟着走；点某一项**滚到那一步**（且不被路由的 `scrollBehavior` 抢掉）。
7. 「保存妆容」→ 按钮变成**「已记下这一版」**（★ 不许是「已保存到我的作品」，见 §8-4）。
8. 两张 hero 图**写着「占位」**（见 §8-4）。

### 人设库（B 档，本机浏览器——文案必须如实说）

1. `/personas` → 5 份种子人设；**首次进入就该补齐**（`PERSONA_SEED_VERSION`）。
2. `/personas/new` → 两个上传入口（拍照 / 相册）驱动同一支隐藏 `input`；
   ★ **同一个文件连选两次也要能触发**（`useFilePick` 的 `pick()` 点之前清了 `input.value`）。
   `/personas/:id` 的「换一张照片」走同一条路，**两处都要试**。
3. 建档 → `/personas/quiz`：肤色与特征**预填成建议值**（可以改）；名字空着时「生成」要走不通。
4. 详情页 → 换照片 → **只缩图、不碰建档草稿**（`shrinkOnly`，别借 `putDraftPhoto` 那条路）。
5. 删除 → 先弹 `window.confirm`，取消不该删掉。
6. ★ **查存储按账号隔离**：`localStorage` 里的键是 `tz:personas:<userId>`。
   换个 ID 登录 → 人设库是**新的一份**，看不到上一个人的脸。
7. ★ **配额防线**：传一张几 MB 的手机照片 → **不该出现「保存成功、刷新后变回去」**。
   要么缩图后存下，要么当场给一句人话的错。
8. 页面/文案**不许说「已同步到你的账号」**（它只在这台浏览器里，见 §8-3）。

### 数字美妆台（A+B 档，唯一真的走网络的几屏之一）

1. `/vanity` → 「我的化妆包 / 全部产品」两个视图切换。
2. 全部产品 → 挑一个色号 → 收进化妆包 → **刷新，它还在**（走 `/cabinet/items`）。
3. ★ **一件产品的第一个色号入库时，「整件」行要一起建出来**（§6.2）；
   丢掉最后一个色号后，**这件产品仍留在包里**。
4. ★ 收录一支有 10+ 色号的产品 → 每条特性**都不该超过 40 字符**
   （这是 §6.2 那个 422 陷阱的现场验证）；把包塞到 100 行以上 → 后端回 409，
   **页面要把那句人话原样显示出来**，不是静默失败。
5. 切到 `VITE_USE_MOCK=false` 再走一遍第 2 步，确认命中真后端。

### 第一层与登录（A+C 档）

1. 未登录时打开任意路径 → 落到 `/login`，地址栏带 `?redirect=`；登录后**回到原本那一页**。
2. 登录后再访问 `/login` → 直接进首页（不是"退不出去"）。
3. `/mine` → 「退出登录」→ 回登录页；★ 再登录另一个 ID，**化妆包与人设都该是新的**
   （`logout()` 里那两个 `reset()` 就是干这个的）。
4. `/` 与 `/inspiration`：数据是策展内容（C 档），**页面文案不许讲成"社区正在发生的事"**（§8-4）。
5. `/mine` 的统计数字（作品/粉丝/获赞）是演示值——**不许写给用户看说它们是真实统计**。

### 其他

| 改动 | 牵动 |
| --- | --- |
| 加一个接口 | `api/<域>.js` 加函数（A 档要写 mock 分支，**惰性 import**）→ `api/mock.js` 补同形状假实现 → store 里包一层 → 页面调用 |
| ★ 那条链**在浏览器里复刻不了**（要服务端真实状态 / 会花钱） | **不要**给它加 mock 分支，改成页面明确说「不可用」 |
| 加一个页面 | `pages/XxxView.vue` → `router/index.js` 加路由（**静态段排在动态段前**）→ `AppSidebar` 要不要高亮看 `meta.nav` → 需要门禁就别加 `meta.public` |
| 加一个 store | 放 `stores/`；`reset()` 要把自己那份收干净（含 objectURL 与 localStorage）并接进 `user.js` 的 `logout()`。★ 一旦 `stores/user.js` 要引它，**它就不能静态引 axios**（首屏链，§6.3） |
| 加一个图标 | `Icon.vue` 的 `ICONS`（**`vb` 要抄对**，见 §5.1） |
| 改色号 / 加产品 | 只改 `kb/shades.js` / `kb/catalog.js` / `kb/products.js`——**任何地方都不许另写一份 hex**（`api/vanity.js` 文件头钉着这条） |
| 改人设库 | `api/personas.js` 的存储口径（键名前缀、缩图参数、种子版本）**改一样就要想清楚已有数据怎么办** |
| 动 `vite.config.js` | **必须 `npm run dev`**（alias / `fs.allow` 只在 dev 暴露问题） |
| 接 `agent` 那条链 | **= 重新设计动线**，不是换数据源（§1 末、§7.1） |
| 加组件 | 放 `components/`，props/emit/slot 契约更新进 §5.1；**不 import store / api** |
| 加一条 composable | 先过 §3 第 7 条的判据（**重复**或**红线集中**，不是「整齐」）；放 `composables/`，一个文件一个导出；**别被 `components/` 引到**——那会毁掉纯展示那条线 |

---

## 10. 命令

```bash
cd vue
npm install
npm run dev        # 开发 :5173（mock 默认开）
npm run build      # 生产构建（⚠️ 通过不代表 dev 能跑）。★ 构建完顺手验一次 §6.3 那条 grep
npm run preview    # 预览构建产物
```

```bash
cd server
npm run dev        # 后端 :3000
npm test           # 后端测试（前端零测试，跑它只为确认没动到契约）
npm run typecheck
```

---

## 11. 已知状态（别当成 bug 去「顺手修」）

### 本次搬迁的刻意出入（源站 ↔ 这里）

1. **源站有 4 个图标名在它的图标表里根本不存在**，`icon()` 对未知名字返回空串——
   **静默渲染空白，不报错**（假开关家族的一员）。已改成表里真有的：
   `heart40` → `heart`、`camera40` → `camera`、`upload40` → `upload`。
   ★ 这条是本节最值得记住的一条：**它同时说明了「没报错」不等于「画出来了」。**
2. **`.quick-item--active` 这条 CSS 规则是新加的**——源站与旧前端都**只应用了这个类、没有任何规则匹配它**
   （那个高亮状态一直是死的）。加在 `base.css` 里。
3. **`/mine` 的「退出登录」是后加的**，源站没有（它没有登录态、也就没有出口）。
   样式是页内 `scoped` 的 `.mine-foot`。
4. ★★ **两处文案与红线 §8-1 / §8-5 冲突，是照源站原样搬过来的，我**没有**擅自改**——
   要改请先拍板：
   - `api/home.js:50` 的贴士标题「**黄皮显白的口红色号**」——§8-1 明令文案里不出现「显白」。
   - `VanityView.vue:275` 的标签「**用户口碑** · …」——那个值摘自品牌资料库
     （`kb/products.js` 的 `voice`，如「熬夜蜡黄脸救星」），**不是我们采集的口碑**，
     §8-5 不许讲成用户口碑。建议标签改成「品牌宣称」之类，值本身不用动。
   - （`kb/shades.js:178` 有一个色号叫「显白西红柿」，那是**品牌商品名**，我倾向不动——
     改商品名等于篡改产品数据。但这条也该由你定。）
5. **`FormView` 的步骤条统一成 4 步**。源站的 `form.html` 写的是「1 选场景 / 2 填信息 / 3 生成方案」，
   少一步「选形象」，于是「2」在这一屏指填信息、在上一屏指选形象。这里统一成与
   create / personas / result 一致的 4 步。

### 零消费者 / 死按钮（**照源站保留**，不是漏收拾的）

6. **一批按钮与链接今天没有任何去处**，全部是照源站原样留的。**不是为了"下一步再做"，就是没有目的地**：
   - `LoginView`：「忘记密码？」(`href="#"`)、微信登录、手机号登录；
   - `HomeView`：搜索框、通知铃、右上头像、三处「更多 / 全部 / 查看全部」(`href="#"`)、
     贴士卡上的 `去试试` 按钮、**hero 的 5 个圆点**（源站 5 张 banner 只展示第一张，
     圆点既不可点也不轮播，是装饰）；
   - `MineView`：通知、设置、「编辑资料」、「重新测一测」。
   ★ **别把它们当成"顺手接一下"的机会**——接任何一个都等于自己发明一个目的地。
   要么问用户，要么留着。
7. **`public/demo/` 下的两个 SVG 已无引用**（`demo-photo.svg` / `scenery.svg`），
   它们服务的是被删掉的 `/upload` 那条链。**先别删**——它们是源站素材，
   将来要重建"上传 → 出图"那条链时可能还要用。这是**已知的零消费者文件**，不是漏收拾的。
   （`public/assets/img/ph-*.svg` **不是**死文件：它们是种子人设的照片，见 `api/personas.js`。）
8. **`/mine` 的统计与 `aiProfile` 标签是策展值**（C 档），不是真实统计（§8-4）。
9. **`stores/design.js` 的 `fields` 与 `generating` 今天都没有读者**：
   `fields` 是留给真后端的落点（§8-4），`generating` 恒为 `false`。
   两个都**故意**留着并写了注释，不是漏收拾的。

### 结构性事实

10. ★★ **搬迁删掉了全项目唯一一条真的会出图的路径。** 现在没有任何一屏能把妆容渲染到脸上
    （§1 末）。`/result` 的两张图是占位块。**要真出图，得先把 `agent` 那条链接回来。**
11. ★ **`@scene-rules` 今天零引用**（§2）。桃妆的场景与后端那份 `SCENE_RULES` 是**两套不同的东西**，
    刻意没有合并。alias 与 `fs.allow` 留着是因为后端测试读 `vite.config.js` 钉着它们。
12. ★ **前端零测试基建**：`package.json` 里没有 vitest，全仓没有一个前端测试文件。
    所以**任何一个页面的回归只有「手工走一遍」这一条路**——改动前后别声称"测过了"。
13. **`api/mock.js` 只剩账号与化妆包两块。** 别为了"离线也能演示"往里补假的方案或假的人脸分析。
14. **`public/assets/img/` 下只有两张脸**（`ph-colleague.svg` / `ph-sister.svg`）——
    5 份种子人设里另外 3 份的 `photoUrl` 是空串，靠 `PersonaAvatar` 的「首字 + 肤色档底色」合成。
    这是设计如此，不是缺图。
15. ★ **2026-09-30 定了两条新规矩，别再改回去**：
    （a）SFC 块顺序统一成 `<template>` → `<script setup>` → `<style>`。
    改之前**全仓 24 个文件都是 `script` 在前**（包括搬迁前就存在的那 5 个），这是**新规矩**、不是修搬迁的错；
    自检命令在 §9。
    （b）新增 `src/composables/`（5 个，见 §3 第 7 条）。它的**判据是「重复」或「红线集中」**，
    与 §4「页内私有的样式与小组件别拆出去」不冲突——别拿那句话当理由把 composables 删掉。
