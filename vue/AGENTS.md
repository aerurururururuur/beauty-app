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
| 改色号 / 产品目录 | ✏️ 2026-09-30：**内容和数据都在后端**——`products/overlay/<库>/`（手写层）+ `server/src/modules/products/domain/schemas/api/products-view.ts`（契约）；前端只有 `vue/src/api/products.js` 与 `vue/src/api/vanity.js` 两个传输/适配文件 |
| 改人设库（脸模） | `vue/src/api/personas.js`、`vue/src/stores/personas.js`、`vue/src/pages/Persona*.vue`、**后端那一族**：`server/src/modules/user/{domain,application,presentation}/**persona*`（数据与种子都在那边，见 §7.1） |
| 加接口 | `vue/src/api/index.js`、`vue/src/api/<域>.js`、`vue/src/api/use-mock.js`、`vue/src/api/mock.js`、对应 store、后端那个 `domain/api/*.ts` |
| 加 / 改共享组件 | `vue/src/components/<X>.vue` + 调用它的页面 + `vue/src/assets/styles/tokens.css`（+ 对应页面的 css） |
| 改样式 | `vue/src/assets/styles/{tokens,base,pages,flow}.css`，以及目标页面（页内 `scoped`） |
| 改动线 / 路由 | `vue/src/router/index.js`、`vue/src/App.vue`、`vue/src/components/AppSidebar.vue`、相关页面 |
| 核对后端契约 | `server/src/modules/*/presentation/routes/*.route.ts`（**6 个文件**，28 条路由；第 29 条 `GET /health` 在 `app.ts` 里）+ `server/src/modules/*/domain/schemas/api/*.ts` |

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
> 2. 走 `/create` → 选场景 → 人设库选一张脸 → 填信息 → `/result`，**重点看步骤是模型按你填的
>    需求现写的**（那一屏整套都来自后端这次会话，不是写死的模板），且页面上**没有**风格 chips；
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
/create 选场景 ──► /personas 挑一张脸(或 /personas/new 建一张) ──► /form 填信息 ──► /result 方案 + 成片
                                                                                      │
                                                              /vanity 数字美妆台 ◄────┘ 「去美妆台看产品」
```

★ **人设库那一屏的数据在服务端**（2026-09-30 落地到 `server` 的 `user` 模块，§7.1）：
一张脸（连照片）挂在账号下，**换台机器/换个浏览器登录同一个账号还在**——这就是那次改动的全部目的。
`/personas` 的增删改查 / 换照片 / 问卷建档**都走 HTTP**了，`localStorage` 那份已作废并由前端自行删除。

★ **`/form` 提交那一刻，「填的东西」真的交给后端 agent 了**（2026-09-30 接上的）：三次握手是
「建会话（带 `brief`）→ 传人设照片 → 发那句开场白」，之后方案与成片都由那次会话产出。
动线与端点见 §7.1。

### ★★ 数据从哪来：三档，改之前必须分清

这是本目录**最容易读错、也最容易写出「假开关」**的地方。桃妆的 13 屏背后是**三种完全不同**的数据源，
页面文案与注释必须与所在的那一档对得上：

| 档 | 谁 | `VITE_USE_MOCK=false` 会变吗 | 数据在哪 |
| --- | --- | --- | --- |
| **A. 真后端** | 账号（登录/注册/**资料：简介 + 头像**）、**我的化妆包**、**人设库**（含两个自建小库）、**开始设计那条链的会话**（方案 / 出图）、`/form` 上的**今日天气**、**产品库**（数字美妆台的目录 / 色号 / 产品性质） | 会（账号与化妆包）／**与它无关**（agent、人设库、天气与产品库，见下） | `api/users.js` 那 5 条 · `/cabinet/items` ×3 · `api/personas.js` 那 10 条 · `api/agent.js` 那 8 条 · `api/weather.js` 那 1 条 · `api/products.js` 那 2 条 |
| **B. 本地推导** | 设计链的**输入侧**（场景卡 / 表单定义） | ❌ **不会** | `api/design.js` · `api/kb/*` |
| **C. 策展演示内容** | 首页轮播/推荐/贴士/热点、灵感广场、`/mine` 的统计数字 | ❌ **不会** | `api/home.js` |

- **B 档不是 mock 分支。** 后端**根本没有** `/design/*` 这些路由（见 §7.1）。
  所以拨 `VITE_USE_MOCK` 对它**逐字无效**。场景卡与表单定义是前端的两张常量表
  （`api/design.js` 的 `SCENES` / `SCENE_FORMS`）——它们描述的是"要问用户什么"，
  **本来就不该有服务端**。
  ✏️ **2026-09-30：人设库从 B 档搬到了 A 档**（此前这里写着「`/personas/*` 后端根本没有
  ——本来就不该有服务端」）。它的数据现在真的在服务端、跨机器可见，
  **照片也一起**（见 §8-3 的重写）。所以那一屏的文案可以、也必须说「存在你的桃妆账号里」。
  ⚠️ 与 agent 那条同理：`api/personas.js` **刻意不给 mock 分支**（§8-7），
  **后端不起就没得看**——`VITE_USE_MOCK` 对它同样逐字无效，但结论从"本地没事"变成了
  "这条链现在也要后端"。
  ✏️ **同一天稍后：美妆台的「产品目录」那一半也搬到了 A 档**（此前它在这一行里）。
  它有两半是这个原因：目录那半先前是 `api/kb/{catalog,products,shades}.js` 三份**手写常量**，
  与后端 `products/` 里的同一批内容各存一份（同一件产品两个 id），2026-09-30 并成了一份，
  改由 `GET /api/products` 下发（见 §6.2）。**所以 `/vanity` 与 `/vanity/add` 从今天起也要后端**——
  这是本节新出现的失败模式：**后端不起，这两屏是整屏一句人话的错**，不是一份看起来正常的空目录。
  ⚠️ 同理，`api/products.js` **刻意不给 mock 分支**（§8-7）。
- **C 档也不是 mock 分支**，是**写好的一批演示内容**：没有别人的作品、没有真实的点赞数。
  ✏️ 2026-10-01：`/mine` 上的**昵称 / 简介 / 头像三格是真的**（走 A 档 `GET /users/:id`），
  所以那一屏现在是两档混着的——**桃妆号（按 id 推的）、三项统计、AI 档案标签是演示值**，
  别把整屏都当成真数据，也别把整屏都当成演示。
- ★★ **设计链不再走本地推导（2026-09-30 改的，与本节此前写法相反）。**
  `/form` 把填的东西拼成一份 `brief` 交给后端 agent，**方案（步骤 / 色号 / 产品 / 个性化）
  由 `propose_look` 在服务端展开**（`server/src/modules/styling`）。前端那一套本地展开
  （`getDesignResult` / `STEP_LOGIC` / `buildSteps` …）连同 `kb/styles.js` 的配方一起**删了**。
  ✏️ **2026-09-30 稍后：色值也搬走了。** 此前这里写着「`kb/shades.js` 留着，因为后端给的方案
  只带 `pid + code`、不带色值，颜色仍由前端的 `hexOf(pid, code)` 回填」。现在色号随产品库一起
  上了服务端（`styling/application/decorate-plan.ts` + `styling/domain/ports/shade-lookup.ts`），
  **方案的每一步自带 `hex`**（空串 = 没色块），前端只负责渲染，`kb/shades.js` 退役。
  ⇒ 这意味着**前端不再持有任何色值**：想改某个色号的颜色，改 `products/overlay/<库>/` 里的内容。
  ✏️ **2026-10-02：步骤改由模型自己写**（21 条配方降为**参考**，`read_style_recipe` 只给模型当范例）。
  于是 `plan.styleOptions` 与 `family` 一起下线，`/result` 上那排「换一个妆容风格」chips 与
  「换一版」按钮**整块删了**——想改风格走对话（"眼妆再淡一点"）。
  ⇒ 代价是实在的：**「生成」是真的要等**（最长 90 秒，§6.3 的 `AGENT_TIMEOUT_MS`）。
- ★ **这条链也不受 `VITE_USE_MOCK` 管**——但原因与 B 档不同：`api/agent.js` 是全仓
  **唯一刻意不给 mock 分支**的 api 模块（这条链在浏览器里复刻不了，§9「其他」那张表钉着）。
  所以 `VITE_USE_MOCK=true`（缺省）下它照样打真后端；后端那边配 `AGENT_LLM=mock` 时
  回的是 `DemoLlm` 那段**离线演示脚本**，链路仍然整条跑得通。

> ### ★★ 全项目唯一一条真的会出图的路径回来了（2026-09-30）
> 被替换掉的那个前端里，`/upload` → `/agent` 那条链能真的把妆容渲染到本人照片上——
> 搬迁时删掉了，现在**从 `/form` 这条动线接回来了**：
> `POST /agent/sessions/:id/render`（**会花钱**，按次计费）→ `GET …/renders/:seq` 那几张真图
> （✏️ 2026-10-01 起**一次确认出 3~7 张**：每个上妆步一张、逐步累积，最后一张才是成片）。
> 出图前**有一次确认**：服务端把「要出的是哪一套」写成确认框，用户点了才调引擎
> （见 `server/src/modules/agent/README.md`）。
> ★ **`/result` 上不再有任何标着「占位」的假图**：没出图时那一块**什么都不摆**，
> 只显示确认框；出了图就摆真图。**别为了"看起来完整"补一张假图回去**——那正是本仓最怕的形状。
> ⚠️ 缺省配置（`MAKEUP_ENGINE=mock`）下引擎**不产生账单**、把输入照片原样返回，
> 所以"离线也出得来图"这句话成立，但那张图**不是渲染结果**（见 `server/README.md`）。

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

> ✏️ 2026-09-30：**桃妆一处都不引 `@scene-rules`，但两条清单从今天起是同一套了。**
> 此前这里写着「桃妆的场景（聚会/约会/面试汇报/旅行/奇想）与后端那份 `SCENE_RULES`（面试/约会/上台/
> 见家长/日常）**不是同一套**，刻意没有合并」——**那段作废**。后端把桃妆那 5 个场合补进了
> `OCCASIONS`（5 → 8），`SCENE_RULES` 现在是 `Record<Occasion, …>`，两边**同名同义**：
> `party` / `date` / `interview` / `travel` / `fantasy` 是桃妆这 5 个，
> `stage` / `family` / `daily` 只经对话进来（桃妆没有对应的场景卡）。
> ⟹ **前端把 `sceneId` 直传给后端当 `occasion` 用**（`api/design.js` 的 `toBrief`），
> 不需要任何映射表——**别再建一张**。
> ✏️ alias 与 `server.fs.allow` **仍然都留着且仍然零引用**，因为 `server/test/scene-rules.test.ts`
> 读 `vite.config.js` 钉着这两样。**别看到没人引就去删 alias。**

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
   `/result?session=<会话 id>` 刷新后还得是同一份方案，`/personas/:id`、`/personas/quiz?photo=`
   同理。只放在 store 里，一刷新就没了，而 store 里那份本来就只是**这次会话的缓存**：
   `design.loadSession()` 拿地址栏那个 id 从服务端把同一次会话拉回来。
   ★ 2026-09-30：`/result` 的入参从「场景 + 风格 + 人设」三件套**收成一个 `?session=`**——
   方案改由后端产出之后，**只有服务端那一次会话能把同一份方案算回来**，
   本地已经没有可重算的推导了（§1）。`/result` 的刷新仍然可用，靠的是那一次 `loadSession`。
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

   ★ **`useQueryParam` 的 `fallback` 必须按各页给，别统一**：`/form` 的 `scene` 兜底是
   `'party'`（没带场景时也得能配出一套），其余各页是 `''`。统一会让那一屏失去兜底。
   ★ 2026-09-30：`/result` **不再读 `scene`**（它现在只读一个 `?session=`），所以
   「两屏都靠 `'party'` 兜底」那种说法已经过期——真正需要在意的只有 `/form` 一屏。
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
│   ├── users.js               # A 档：账号 5 条（注册 / 登录 / 读档案 / **改资料** / **头像**）+ `avatarSrc`（★ 桃妆 ID ↔ 后端 nickname 的映射只在这里）
│   ├── image.js               # 纯函数：`shrinkPhoto`（选的照片 → 长边 ≤640 的 dataURL）。✏️ 2026-10-01 从 personas.js 提出来，人设照片与账号头像共用
│   ├── cabinet.js             # A 档：/cabinet/items 四条。★ 只被 api/vanity.js 惰性引用
│   ├── mock.js                # A 档的假后端（账号（含资料）+ 本地化妆包）。只准惰性引入
│   ├── vanity.js              # A 档两半：产品目录走 products.js（惰性），化妆包走 cabinet.js（惰性）。★ 顶层零 import
│   ├── products.js            # A 档：产品库 2 条（§7.1）。★ 只被 api/vanity.js 惰性引用，刻意不给 mock 分支
│   ├── design.js              # B 档：**输入侧**的表单定义（SCENES / SCENE_FORMS）+ brief 拼装。★ 全本地
│   ├── agent.js               # A 档：设计链那条会话链的 8 条（§7.1）。★ 全仓唯一不给 mock 分支的 api 模块
│   ├── personas.js            # A 档：人设库 10 条（§7.1，含两个自建小库）。★ 与 agent.js 一样**刻意不给 mock 分支**
│   │                          #   照片走 dataURL（不是 multipart）；`shrinkPhoto` 从 `./image` 转出（调用点不改）
│   ├── weather.js             # A 档：`GET /weather` 那 1 条（`/form` 的今日天气）。★ 与 agent.js / personas.js 一样**刻意不给 mock 分支**
│   ├── home.js                # C 档：首页 / 灵感 / 我的 的策展内容。★ 全本地
│   └── kb/                    # B 档的数据：features / skintones / styles
│                              #   ⚠️ styles.js 的配方搬去了后端 `styling`（§1），现在只剩**配方名**
│                              #      被 `/form` 的「你想要的风格」chips 消费（`api/design.js` 的 `STYLE_FIELD`）——
│                              #      但**别删**：`server/test/styling-plan.test.ts` 拿它当"搬运前的原件"对表
│                              #   ✏️ 2026-09-30：catalog / products / shades 三份并进了后端
│                              #      `products/overlay/ysl-property/`，经 `GET /api/products` 下发（§6.2）
├── stores/
│   ├── user.js                # 「这次用的是哪个账号」。★ 在首屏链上（见 §6.3）
│   ├── design.js              # 设计链的**会话缓存**（brief / plan / 出图 / generating）。★ 方案由服务端给
│   ├── personas.js            # 人设库：草稿、缩图、增删改查 + 两个自建小库（`customFeatures` 等）。★ 引 `@/api/personas` **必须惰性**（§6.3）
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
        hint: String = ''       提示语。★ **由调用方给**，空串 = 用一句**不提 AI 的中性提示**
```
★ 这里的值永远由**用户确认**，不能把 `personas.analyze()` 的返回值当判定结果直接存（红线 §8-1）。
✏️ **2026-09-30：提示语从组件内写死改成了调用方传入。** 理由不是"灵活"，是**不说假话**：
本组件在两处被渲染——问卷建档页（那里可能真跑过读脸）与**详情改档页（根本没有分析这回事）**。
写死在组件里，详情页就会跟着宣称「AI 给的是建议档」——那句话在那一屏是**假的**，
而这个组件看不出区别。所以只有**真跑过读脸**的调用方（`PersonaQuizView` 读到 `readState === 'done'`）
才配传含「AI」的那一版；缺省那句只讲照片色差、请按真实情况选。

#### `FeaturePicker.vue` —— 面部特征多选（按分组铺）

```
props:  groups / features / modelValue（v-model 绑的是**选中的特征 id 数组**）
        library = []        本账号自建的那几条 { id, group, text }（来自 personas.customFeatures）
emits:  update:modelValue · add-feature（{ group, text }，★ text 是**纯原话**）· remove-feature（库行 id）
```
用在两处（问卷建档 / 详情改档），两处的数据都来自同一份 `kb/features.js`——别在页面里再抄一份标签。
★ 每组铺的顺序是：目录 chips → **自建 chips（每条角上带一个 `×`）** → `+ 自定义` → 展开的输入框。
★ **建 / 删都不在这里落库**：emit 出去，由页面转调 store，值回来才进 `modelValue`——
所以「加上」之后那一格**不会立刻亮**，亮起来说明服务端真收下了。
★ **还要画「选中了但不在库里」的原话**（存量人设里可能有 `分组/原话` 而库里没有对应行）：
不画就是**静默丢掉用户写过的话**（勾了看不见、也去不掉）。
★ 拼 `<分组 id>/<原话>` 的规则**只有两处**：本组件与 `kb/features.js` 的 `featureIdOf`
（本组件不 import `api/`，§3 第 4 条）——**别在页面里再拼第三次**。

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
★ 唯一的例外是 `/result` 的出图那一块：那里**什么都不摆**——因为 `.ph` 会让人以为"这张图待会儿会出现"，
而它到底出不出现取决于用户点不点确认（§8-4）。

---

## 6. 数据来源与惰性引入规则

### 6.1 三档数据（见 §1）在代码里的判别法

看见一个 `api/*.js` 函数，先问「它背后有没有 HTTP 路由」，答案在 §7.1 那张表里对。
**没有路由的那几档，函数里不该出现 `axios`、`useMock()`、`import('./mock')` 任何一个**
——出现了就是把本地推导写成了假后端，本仓最怕的那种。

★ **反过来也有一条**（2026-09-30 补）：**有路由的那一档，函数里不许出现"编一个结果出来"的兜底**。
`api/agent.js` 就是这一条的现场——它**刻意不给 mock 分支**：这条链会花钱、
要服务端真实状态，浏览器里复刻不出来。给它编一份假方案，就等于把「真的接上了」和
「看起来接上了」变得一模一样，而那正是本仓的头号 bug 类型。
✏️ **2026-09-30：`api/personas.js` 是第二条现场**（它从 B 档搬到 A 档的同一天）。
人设库的语义就是「存下来下次还能用」——**造一份本地的假**，正好把
「真的存到账号里了」和「看起来存下来了」变成一模一样。同理，读脸那条路
（`analyzePersonaFace`）**不许回落本地哈希兜底**：服务端没给建议就说"没读出来"（§8-1、§8-4）。
✏️ **2026-09-30 稍后：`api/weather.js` 是第三条现场**（`/form` 的今日天气）。
⚠️ 它的理由与前两条**不同**：天气不难复刻，是**不能**复刻——编一份天气混进 `brief`，
模型会照着它挑妆面，而用户看到的是一行像模像样的「晴 24℃」。离线路是**服务端**那条
`WEATHER_PROVIDER=mock`（它自报 `source`），不是前端补一份。

### 6.2 `api/vanity.js` 的两半（★ 2026-09-30 整节重写过）

**它此前是本仓最容易读错的一个文件**——一半接后端、一半本地，那张表已经整张作废。
现在两半**都走 HTTP**，分法只剩「是不是账号数据」：

| 部分 | 来源 | 是账号数据吗 |
| --- | --- | --- |
| 分类树 / 产品卡 / 色号 / 产品性质 | `GET /api/products`（经 `api/products.js`） | 不是（品牌内容，全账号同一份） |
| 「我拥有什么」（我的化妆包） | `/cabinet/items`（经 `api/cabinet.js`） | 是（按账号） |

✏️ 此前目录那半是 `kb/{catalog,products,shades}.js` 三份**手写常量**，与后端 `products/` 里的
同一批内容各存一份（同一件产品两套 id）。那三份已退役，内容并进了 `products/overlay/ysl-property/`。
由此产生的三条硬规矩：

- **全仓不许再另写一份产品数据或色值。** 唯一来源是 `GET /api/products`；改内容改
  `products/overlay/<库>/`（§0.2）。
- **目录不再是同步的。** `fetchCatalog()` 要等一个来回，所以 `stores/vanity.js` 第一次有了
  加载态（`catalogLoading` / `catalogLoaded` / `catalogError`）。**别把加载中渲染成"暂无产品"**
  ——那就是假开关（§9 美妆台清单）。
- **详情是预热的，不是每次点开现取**（✏️ 2026-09-30 稍后加）。进「全部产品」后
  `prefetchCategory` 按顺序把**当前分类**的详情取回（换分类即停），`prefetchDetail`（卡片
  `@pointerenter`）在鼠标划过时补一件——点下去就是缓存命中，信息面板不再"先塌一下再撑开"。
  ★ 代价要认：进页后会多几条后台请求（该分类每件约 2–5 KB，顺序发、可中止）；
  **整库 66 条的详情不许一次推下来**——那正是后端把详情单开一条路由的理由。
- ★ **`/vanity` 与 `/vanity/add` 从今天起依赖一个配好的后端。** 后端不起（或 `PRODUCTS_DIR`
  指空使这两条路由**不注册**）⇒ 这两屏是**整屏一句人话的错**，不是空列表。这是今天新出现的
  失败模式，已写进 §1 与 §9。**不要为了"看着正常"给 `api/products.js` 补 mock 分支**（§8-7）。

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
> ★★ **2026-09-30 又加了两处，四处都别改回去**：
> ① `stores/design.js` 引 `@/api/agent` **必须惰性**（它在原来的文件里就是 `import('@/api/agent')`）——
>    理由与 `stores/user.js` 引 `@/api/users` 一模一样，见那个 store 的文件头；
> ② `api/design.js` 的 `toBrief` 是**纯函数**，别顺手在里面引 `api/agent`。
>    `ResultView.vue`（懒加载路由）里那一条 `import { renderImageHref } from '@/api/agent'`
>    **是静态的、也是对的**——那一屏本来就是懒加载的，axios 落在它自己的分块里。
> ③ ★ **`stores/personas.js` 引 `@/api/personas` 必须惰性**（写成 `import('@/api/personas')`，
>    见那个 store 里的 `personasApi()`）。理由绕了一圈，但**每一环都是硬的**：
>    `stores/user.js` 为了 `logout()` 里的 `reset()` **静态引**了 `stores/personas.js`
>    ⇒ 它就在首屏链上 ⇒ 而 `api/personas.js` 自 2026-09-30 起**是一个 axios 模块**（它以前
>    是纯本地的，静态引进来也没事）⇒ 静态引 = axios 进首屏包。
> ④ `stores/user.js` 里那句「`api/personas` 不碰 axios」的注释**已经改掉了**——
>    别再照着旧注释把它改回静态 import。
> ⑤ ★ **`api/vanity.js` 里 `function productsApi() { return import('./products') }` 与它旁边
>    那条 `cabinet()` 同理**（2026-09-30 加）。产品库那半以前是 `kb/` 三份纯数据，
>    顶层静态引它们不碰 axios；现在 `api/products.js` 是 axios 模块，**必须惰性取**。
>    ⚠️ 同一天 `api/vanity.js` 的`fetchProductInfo` 也从同步变成了 `async`（详情走第二条路由），
>    所以它的**每个调用方都要处理 loading/失败**（见 §9 美妆台清单）。

⚠️ **这条没有任何工具能查出来**（本目录零 lint、零测试）。判别方法——`npm run build` 之后：

```bash
cd vue && npm run build
grep -l AxiosError dist/assets/*.js    # ★ 期望结果里**没有** index-*.js
```
（`grep -c` 在 0 命中时**退出码是 1**，所以列文件名比数个数好用——数个数那条看起来像报错，其实是你要的结果。）
axios 应该待在**另一个分块**里。2026-09-30（人设库接上后端之后）那次构建的实测结果：
`index-CsKrq8px.js` 142.81 kB（axios 命中 **0** 次）、`api-BphkFwOS.js` 50.35 kB（axios 在里面）、
`mock-B_f9ayll.js` 单独的假后端分块。
（`index` 从 118.57 涨到 142.81 kB 里，有一部分不是本轮：同日另一条线把 agent 会话链接进了 `/form → /result`。）
✏️ **同一天稍后（产品目录切后端那次）**：`index-Dkcfb1so.js` **108.55 kB**（axios 命中 0 次）、
`api-GzQ8PHCV.js` 50.41 kB（axios 在里面）。`index` 变小是**预期**的——
`kb/{catalog,products,shades}.js` 三份手写常量从首屏包里删掉了；产品库自己是一个惰性分块。
★ **分块名会变**（同一份代码今天叫 `use-mock-*`、明天可能叫 `api-*`，那是 rollup 给这个动态组
挑的名字，不是谁起的名）——**别按名字找，按「axios 在不在 `index-*` 里」判断**。
哪天它出现在 `index-*` 里了，就是有人写成了静态 `import`。

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

### 7.1 端点总表 —— 后端有 31 条，桃妆用 28 条

> ★★ **先看这张对照表再动手。** 「后端有这个端点」不等于「前端在用它」：
>
> | 模块 | 路由数 | 桃妆用了几条 |
> | --- | --- | --- |
> | `user` | 15 | **14** —— 账号 5 条（`api/users.js` 的注册 / 登录 / 查档案 / **改资料** / **取头像**）+ **人设库 10 条**（含下面那**两个自建小库**各 2 条） |
> | `cabinet` | 4 | **3**（`POST` · `GET` · `DELETE`）——`PATCH /cabinet/items/:id` 无人调用 |
> | `agent` | 8 | **8** —— 设计链那条会话（§1）+ `/images`（提交时传参考图）+ `/analyses`（`/result` 的读图按钮，会花钱） |
> | `products` | 2 | **2** —— 数字美妆台的目录（`GET /products`）与信息面板（`GET /products/:id`），见 ✏️（七） |
> | `weather` | 1 | **1** —— `/form` 的今日天气：手填城市（`?city=`）或「用当前位置」（`?lat=&lon=`），见 ✏️（六） |
> | `GET /health` | 1 | 0（部署探活用） |
>
> ★ 这 29 条里有 **3 条要 `VISION_ANALYZER=real` 才注册**（agent 的 `/images` `/analyses`
> 与 `POST /personas/analyze`）；另有 **2 条要 `PRODUCTS_DIR` 指到真库才注册**（`products` 那两条）。
> **缺省配置下它们根本不是 404 的"空接口"，是路由不存在**——
> 别拿"调一下试试"来判断这个部署有没有读图能力，判据是 `GET /personas` 回的那个
> `canAnalyzeFace`（§8-1）。
>
> ✏️ 2026-09-30（一）：此前这里写的是「cabinet 4 条 / 桃妆用 4 条」「桃妆只用 6 条」，
> **两处都不对**——`PATCH` 那条前端一个调用点都没有（见 §11-16）。
> ✏️ 2026-09-30（二）：agent 从 **0 条变 6 条**，总数从 5 条变 **11 条**——
> 设计链接上后端会话之后（§1），那 8 条里的 6 条真的有人调了。
> ✏️ 2026-09-30（三）：**人设库落地到服务端**（12 条 → **23 条**、11 条 → **17 条**）。
> 它做在 `user` 模块里（一份人设是挂在账号下的一张脸，归属校验直接问本模块的账号仓库），
> 所以 `user` 那个模块的行从 3 条变成 9 条。**这一改动的现场见 §1 与 §8-3。**
> ✏️ 2026-09-30（四）：**参考图接线**（17 条 → **19 条**）——`/images` 与 `/analyses`
> 各有人调了（`stores/design.js` 的 `submit` 与 `analyze`）。⚠️ 那两条要
> `VISION_ANALYZER=real` 才存在，缺省下 `analysisOffer` 整个键不出现、`/result` 上
> 那块连壳都没有。**这一改动的现场见 §8-3。**
> ✏️ 2026-09-30（五）：**「自建肤色档」与「自建特征」两个账号共用的小库**（**+4 条**：各 2 条）。
> ⚠️ **（三）与（四）那两个数字都不对**：（三）落人设库时漏算了自建肤色档那 2 条，
> （四）又在那个错的基数上继续加。**上面这张表是逐条数 `app.<method>(` 重数过的**：27 / 23，
> `user` 那行 **13 / 12**。两个小库**都没有单独的 `GET`**（搭 `GET /personas` 一起回，
> 同 `skinTones` 的理由）；两条 `DELETE` 的「还有人在用」判据见本节表下那条 ★。
>
> ✏️ 2026-09-30（六）：**`/form` 接上了天气**（23 条 → **24 条**）——`api/weather.js` 那 1 条，
> 调用点只有 `FormView` 的「查天气 / 用当前位置」，取四格填 `brief.weather`。
> ★ 它是**可选**的：拉不到照样提交，失败**不写 `design.error`**。★ 服务端标 `source:'mock'` 的
> 「离线示意」**既不摆也不进 brief**（判据是 `api/design.js` 的 `briefWeatherOf`）——
> 那条与 `weather` 模块 README 的「UI 要据此标注」不同，理由写在 §7.2 末。
>
> ✏️ 2026-09-30（七）：**产品库经 HTTP 接了出来**（24 条 → **26 条**）——`products` 模块
> 从**空**变有两条只读口，`api/products.js` 两条都调。**这是「产品数据合一」那件事的下半截**：
> 前端 `kb/{catalog,products,shades}.js` 三份手写常量退役、内容并进 `products/overlay/ysl-property/`，
> 所以这一改**同时**让 `/vanity` 从 B 档升到 A 档、也让方案色值搬去服务端（§1 与 §6.2）。
> ⚠️ 两条都**不收 `userId`、不校验归属**：产品库是品牌内容，形状与 `GET /weather` 同类。
> ⚠️ **`PRODUCTS_DIR` 指空 ⇒ 这两条根本不注册 ⇒ `/vanity` 两屏整屏报错。**
>
> ✏️ 2026-10-01（八）：**「编辑资料」接上了**（31 条 / 28 条）——`/mine` 上那个一直是死按钮的
> 按钮现在真的能用，后端那两条新路由（`PATCH /users/:id` · `GET /users/:id/avatar`）也就有人调了。
> ⚠️ 这一条**与（七）不同**：它没有把任何东西从 B/C 档搬上来，`/mine` 的统计与 AI 档案标签
> **仍然是策展值**（§1）。★ 做的范围由用户拍板：**只有简介 + 头像**（昵称不动、统计不做、
> 桃妆号不开放改）；界面是 **`MineView` 页内展开的面板**，**没有新开一屏、没加路由**。
>
> 其余 2 条没被调用的路由（`PATCH /cabinet/items/:id` · `GET /health`）
> **不是给人的菜单**：它们大多属于被替换掉的那个前端，
> 或者属于还没接上的能力。**别为了让某屏"看起来更真"随手接一条上去。**
> ⚠️ 唯一一条例外是**属于桃妆真在用的模块、只是还没有界面**的：
> `PATCH /cabinet/items/:id`（将来做「改名」时才有人调）。

| 方法 & 路径 | 请求 | 成功响应 | 桃妆 |
| --- | --- | --- | --- |
| `POST /users` | `{ nickname, password }` | **201** `UserView` | ✅ 注册 |
| `POST /users/login` | `{ nickname, password }` | **200** `UserView`；不符 **401** | ✅ 登录 |
| `GET /users/:id` | — | **200** `UserView` | ✅ `/mine` 读档案（简介 / 头像的真身，✏️ 2026-10-01 起有人调） |
| `PATCH /users/:id` | `{ bio?, avatar? }`（★ 二者**至少给一个**；`bio: ''` = 清空简介，`avatar: ''` = **删掉头像**；不给那一格 = **不动**） | **200** `UserView` | ✅ 「编辑资料」的保存（✏️ 2026-10-01 加） |
| `GET /users/:id/avatar` | — | 图片字节（`content-type` 随行里的 mime）；★ **没设过头像 → 404** `USER_AVATAR_NOT_FOUND` | ✅ `<img>` 的 src（✏️ 2026-10-01 加） |
| `GET /personas?userId=` | — | **200** `{ personas: PersonaView[], skinTones: SkinToneView[], customFeatures: CustomFeatureView[], canAnalyzeFace: boolean }` | ✅ 人设库列表（两类自建档搭它一起回） |
| `POST /personas` | `{ userId, name, relation, skinTone, features?, photo? }`（`photo` 是 dataURL，可省） | **201** `PersonaView` | ✅ 建档 |
| `PATCH /personas/:id` | `{ userId, name?, relation?, skinTone?, features?, photo? }`（★ `photo: ''` = **删掉照片**；不给这一格 = 不动） | **200** `PersonaView` | ✅ 改名 / 换照片 / 移除照片 |
| `DELETE /personas/:id?userId=` | — | **204** 无响应体 | ✅ 删除（服务端那份照片一起删） |
| `GET /personas/:id/photo?userId=` | — | 图片字节（`content-type` 随行里的 mime） | ✅ `<img>` 的 src |
| `POST /personas/analyze` | `{ userId, photo }`（dataURL） | **200** `{ skinTone }`（★ **后端**档 id） ★ **会花钱** | ✅ 读脸 —— **用户点了才发**（§8-1） |
| ⚠️ 上一条 | **服务端配 `VISION_ANALYZER=off`（缺省）时根本不注册 → 404** | | — |
| `POST /personas/tones` | `{ userId, name, hex }` | **201** `SkinToneView`；满 20 档 → 409 | ✅ 建一档自建肤色 |
| `DELETE /personas/tones/:id?userId=` | — | **204** 无响应体；还有人在用 → **409**，跨账号 → **404** | ✅ `×` 删档 |
| `POST /personas/features` | `{ userId, group, text }`（★ `text` 是**纯原话**，不带分组前缀） | **201** `CustomFeatureView`；满 50 条 → 409 | ✅ 建一条自建特征 |
| `DELETE /personas/features/:id?userId=` | — | **204** 无响应体；还有人存着 `分组/原话` → **409**，跨账号 → **404** | ✅ `×` 删一条 |
| `POST /cabinet/items` | `{ userId, name, attributes? }` | **201** `CosmeticItemView` | ✅ |
| `GET /cabinet/items?userId=` | — | **200** `{ items: [...] }` | ✅ |
| `PATCH /cabinet/items/:id` | `{ userId, name?, attributes? }`（二者至少给一个） | **200** `CosmeticItemView` | — 后端有，桃妆没调（见 §11-16） |
| `DELETE /cabinet/items/:id?userId=` | — | **204** 无响应体 | ✅ |
| `POST /agent/sessions` | `{ userId, ...brief 平铺 }` | **201** `AgentSessionView` | ✅ `/form` 提交第一步 |
| `GET /agent/sessions/:id?userId=` | — | **200** `AgentSessionView` | ✅ 刷新 `/result`（`loadSession`） |
| `POST /agent/sessions/:id/messages` | `{ userId, text }` | **200** `AgentTurnView` | ✅ **只有开场白那一次**（`submit`；✏️ 2026-10-02 起 `/result` 上没有输入框） |
| `POST /agent/sessions/:id/photo` | multipart：`face` + `userId` | **200** `AgentSessionView` | ✅ `/form` 提交第二步（**只这一次，见 §8-3**） |
| `POST /agent/sessions/:id/render` | `{ userId }` | **200** `AgentTurnView` ★ **会花钱** | ✅ 「确认生成」 |
| `GET /agent/sessions/:id/renders/:seq?userId=` | — | 图片字节流 | ✅ `<img>` 的 src（`renderImageHref`） |
| `POST /agent/sessions/:id/images` | multipart：`file` + `kind` + `userId` | **200** `AgentSessionView` | ✅ `/form` 提交时逐 `kind` 传一张参考图（**免费**，见 §8-3） |
| `POST /agent/sessions/:id/analyses` | `{ userId, kind }` | **200** `{ session, kind, status, notice? }` ★ **会花钱** | ✅ `/result` 的读图按钮 —— **用户点了才发**，`notice` 原样展示 |
| ⚠️ 上面两条 | **服务端配 `VISION_ANALYZER=off`（缺省）时根本不注册 → 404** | | — |
| `GET /products` | — （★ **不收 `userId`**：品牌内容，不挂账号） | **200** `{ groups, products: Card[], shades: { [id]: { label, shades[] } } }` | ✅ `/vanity` 与 `/vanity/add` 各拉一次（见 ✏️（七）） |
| `GET /products/:id` | — | **200** 详情（六维原文 + `wording` + 色号）；未知 id → **404** | ✅ 信息面板点开时才取（`stores/vanity.js` 的 `loadDetail`） |
| ⚠️ 上面两条 | **`PRODUCTS_DIR` 指空（库不存在）时根本不注册 → 404** | | — |
| `GET /weather` | `?city=` 或 `?lat=&lon=`（★ 二选一，都给是 422） | **200** `WeatherView` | ✅ `/form` 拉一次，取四格进 `brief.weather`（见 ✏️（六）） |

★ **`/images` 与 `/analyses` 是一对**（2026-09-30 接线，见 §8-3）：前者把 `/form` 收的
场景图 / 风格图送进会话（**免费**，每个 `kind` 只留一张 ⇒ 挑哪张由 `api/design.js` 的
`refImagesOf` 一处决定）；后者才是读它们，**会花钱**，所以**只有用户点那一下才发**。
★ 两者的判别标准是后端给的那个 `kind`（`face` / `scene` / `style`），不是"顺手多传一张"——
⚠️ `VISION_ANALYZER=off`（缺省）时这两条路由**根本不注册**，调它得到的是 404，
而不是"传上去了但没用"。
★ **`GET …/renders/:seq` · `GET /personas/:id/photo` · `GET /users/:id/avatar` 是仅有的三条
走 `<img>` 而不是 axios 的**：前两条带的是 `?userId=`，第三条连它都不带，三条都**没有任何 token**
（后端不签发凭据，§8-2）。所以它们在本节里长得不像别的那些。
⚠️ **也因此这三条 URL 都必须先补 `API_BASE` 再进 `<img :src>`**：dev 下 Vite 会把
`/personas/<id>/photo` 当成**前端路由** `/personas/:id` 处理，回的是 SPA 的 index.html
⇒ 破图/空白，**而且不报错**。拼这一步在 `api/personas.js` 的 `decoratePersona` 里
（同 `api/agent.js` 的 `renderImageHref`、`api/users.js` 的 `avatarSrc`），
页面拿到的是**能直接塞 `<img :src>` 的成品字符串**。
★ **头像这条还有一坑是它独有的**（✏️ 2026-10-01）：它的 URL **不带版本号**，
而 `/mine` 换完头像后 `src` 字符串不变 ⇒ Vue 不重设属性 ⇒ 浏览器**一次请求都不发**，
界面上还是旧那张（服务端的 `no-store` 挡的是缓存，挡不住"根本没再请求"）。
所以 `MineView` 在更新成功后给 URL 追加一个 `?v=<自增>`——**别把这个 nonce 当成多余的**。
★ **`POST /personas/analyze` 的响应不落任何库**——它是一次「建议」，
落档由用户确认后的 `POST /personas` 完成（§8-1）。
★ **两个自建小库（肤色档 / 特征）是「整账号共用一份」，不是挂在某份人设底下**：任何一张脸
都挑得到另一张脸建过的那条 —— **这正是它存在的理由**。两条 `DELETE` 的判据都是「**还有人在用**」：
肤色看人设行的 `skinTone` 那一格，特征看它的 `features` 里有没有 `分组/原话` **那一串**
（★ 是**字符串相等**，不是拿库行的 id 去查 —— 理由见 §7.2 末）。命中就 **409**，
**谁也不许顺手替用户把那条从人设里摘掉**（摘了就是那句话从他脸上消失且不报错）。

### 7.2 DTO 形状（JS 视角）

```js
// UserView（★ 永不含密码/凭据）   { id, nickname, bio, avatarUrl, avatarSource, createdAt }
// ✏️ 2026-10-01 加的后三格。★ `bio` / `avatarUrl` **恒在**（没有就是 `''`，不是 `undefined`）——
//   `undefined` 会让 `<textarea>` / `<img>` 在 Vue 里变成**非受控**，而那是静默的。
// ★ `avatarUrl` 是**裸路径** `/users/<id>/avatar`：**不含 `API_BASE`、也不含版本号**，
//   所以页面永远不要直接塞进 `<img :src>`，一律过 `api/users.js` 的 `avatarSrc()`（§7.1 那条 ⚠️）。
// ★ `avatarSource` 只有 `'none'` / `'stored'` 两个值（今天没有种子头像那种第三态）。
// ★ 这三格都是**账号资料**，与 `api/home.js` 无关——那个文件只剩桃妆号 / 统计 / AI 标签。
// CosmeticItemView               { id, userId, name, attributes:[{label,value}], createdAt, updatedAt? }

// AgentSessionView —— 设计链那一屏的全部状态（`stores/design.js` 收的就是它）
// ★ 下面是**桃妆实际读到的那几格**，不是全量（全量见 agent-view.ts，另有 lookSpec /
//   styleRead / hasStyleRef / hasSceneRef / consultedProducts / analysisOffer / 两个时间戳）
{
  sessionId, userId, brief,          // brief 是**回显**：前端填的那几格在这里读回来
  hasFace,                           // 有没有照片；false ⇒ 出不了图，服务端不会给 renderOffer
  lookDescription,                   // 「这套妆是什么」的**唯一**说法，由服务端 describeLook 生成
  plan,                              // ★ 方案：steps / palette / products / personalized（后端产出）
  pendingRender,                     // 模型提的、等用户点头（**与 renderOffer 互斥**）
  renderOffer,                       // 界面按状态自己摆的那个入口（`alreadyRendered` 决定按钮文案）
  renders: [{ seq, url, lookDescription, stepIds }],
  stepRenders,                       // ★ `{ 步骤 id: seq }` —— 每个上妆步对到「到这一步为止」那张图
}
// ✏️ 2026-10-02：**`plan` 的形状变了**——`steps[]` 只剩 `{ id, name, desc, tips }`（**不再带 products**），
//   色号只住在**计划级**的 `plan.products`（=「推荐产品」，每项 `{ pid, code, name, hex }`，`hex` 可为空串）；
//   `plan.meta` 只剩 `{ stepCount }`（`minutes` / `level` 随配方下线：模型现编的数字就是假数字）。
//   ⇒ 页面别再去每一步里找产品（`ResultView.vue` 读 `plan.products`，`snapshotDesign` 也只搬计划级那份）。
// ✏️ 2026-10-01：**一次确认出 3~7 张**（每个上妆步一张，逐步累积；最后一张 = 完整妆面 = 成片）。
//   `stepIds` 是**数组**：同一个区在这套妆里出现两次时（两次遮瑕）只出一张，那几步共用它。
// ★ **`stepRenders` 由服务端算**（`agent-view.ts` 的 `stepRendersOf`，取最后一轮，不落库）——
//   前端**不许**自己由步骤名推部位：「步骤名 → 区」那张表全仓只有服务端一份。
// ★ 护肤 / 妆前 / 防晒 / 定妆**永远不在里面**：那几步没有图 ⇒ `/result` 取不到就**整块不摆**，
//   **不许补 `.ph`**（§8-4：占位块会让人以为"这张待会儿会出现"）。
// AgentTurnView = AgentSessionView + { events, stopReason }（一轮的返回值）
//   ★ 这三个「发一句话 / 出图」的端点回的是它，而前端**一格都没读**那多出来的两格
//     （`design.js` 的 `adopt()` 把它们一起缓存着，没有害处，但别以为有人在用）。

// PersonaView —— 一份人设（`api/personas.js` 的 `decoratePersona` 收的就是它）
{
  id, userId, name,
  relation,        // 'self' / 'family' / 'friend'（白名单后端有，前端只渲染）
  skinTone,        // ★ **前端展示档 id**（`yellow-2` / `cool-fair` …），不是后端那套
  features,        // 面部特征 id 数组（白名单在 face-catalog）
  createdAt, updatedAt?,
  photoUrl,        // 空串 = 没有照片；否则**已经能直接塞 `<img :src>`**（见 §7.1 那条 ⚠️）
  photoSource,     // 'stored'（用户传的，走 `/personas/<id>/photo`）| 'static'（种子那张 SVG）
}
// ★ **派生展示字段后端不下发，由前端 `decoratePersona` 现算**：relationName / skinToneName /
//   skinToneHex / featureNames。理由是它们要的 `hex`/`desc`/中文名**只有前端 kb 有**——
//   后端自己也有一份肤色档（`SKIN_TONES` + skin-tones.json），但那是**另一套 id、另一套色值**。
//   后端下发它那份 ⇒ 用户在前端色点里挑的档和头像方块会是**两个颜色**，同屏可见的不一致。
//   跨端一致性由 `server/test/persona-vocabulary.test.ts` 对表钉住，不靠"两边各写一份"。
// ★ `canAnalyzeFace` 只在**列表**的响应里（`GET /personas`），POST/PATCH 回的单条没有那一格。
//   它是「这个部署能不能读脸」的**唯一**前端判据（§8-1）——别自己拿配置去推。
// SkinToneView / CustomFeatureView —— 两个**账号共用**的自建小库（只在 `GET /personas` 里回）
// SkinToneView      { id, name, hex }          ← 没有 userId：视图层剥掉了
// CustomFeatureView { id, group, text }        ← ★ 这里的 id **只是库行 id**，见下
// ★ 肤色那格线上叫 `skinTones`，特征这格叫 **`customFeatures`** —— 刻意不对称：“features” 单独一个词
//   在本仓已经是「人设自己那一格」（PersonaView.features）。
// ★ 两库里**只有用户自建的那些**：预置的 8 档肤色与 31 条特征在前端 kb（`stores/personas.js` 里
//   `allSkinTones` 才是「预置 + 自建」的合并视图，页面一律用它）。
// ★★ **`CustomFeatureView.id` （库行的 id）从来不出现在人设行里**：写进人设的还是
//   `<分组 id>/<原话>` 那一串（`kb/features.js` 的 `featureIdOf`），所以「还有人在用」是
//   **字符串相等**地查、不是按 id 查；这也意味着**改库行的 `text` 会让存量人设变成孤儿**——
//   所以只做 建 / 列 / 删，**不做改**（要改就删了重建）。
```

**桃妆碰的是上面这六个形状**（那四个 + 两个自建小库），加上第七个——`WeatherView`：

```js
// WeatherView（`GET /weather` 的响应，`FormView` 拉一次）
{ source, place?, condition?, temperatureC?, humidityPct?, uvIndex? }
// ★ 只有**中间那四格**进 `brief.weather`，而且是**逐格挑**出来的：
//   服务端 `startSessionSchema` 的 `weatherShape` 是 `.strict()`，多带 `source` / `place`
//   任何一个键，打回的是**整份 brief**（422），不是那一格。挑选点是 `api/design.js` 的 `briefWeatherOf`。
// ★ `source === 'mock'` = 服务端那条 `WEATHER_PROVIDER=mock` 的「离线示意」（编出来的值）。
//   **它既不摆也不进 brief**：`/form` 不标来源（用户定），而不标来源就没法把一份编出来的
//   天气诚实地摆成实况；摆了却不送，用户又会以为天气送到了。⚠️ `weather/README.md` 那条
//   「`source` 字段 UI 要据此标注」在桃妆**不适用**，因为桃妆根本不展示那一份。
```

**产品库那两个形状**（✏️ 2026-09-30 加，`api/products.js` 收的就是它们）：

```js
// CatalogView（`GET /products`，整库一次给）
{
  groups:   [{ id, label, children: [{ id, label }] }],   // 两组九类，树就是它
  products: [{ id, name, categoryId, categoryLabel, text, shadeCount, hasShades }],
  shades:   { [产品 id]: { label, shades: [{ code, name, hex, hexApprox, toneKey, tone }] } },
}
// ★★ 服务端用什么字段名,前端就照用（`label` / `categoryLabel` / `text`）——
//   这里**刻意不做 label→name 那类改名**：这次搬家的全部意义就是杀掉重复词汇表,
//   再架一张翻译表等于把它请回来。页面读的是服务端的名字。
// ★ `text` 是**卡片上那一行字**：服务端已经在「手写层那句」与「品牌资料首句」之间挑好了。
//   前端不再自己拼、也不再写 `p.texture || p.desc` 那种兜底。
// ★ `hasShades === false` ⇒ 界面照它写「无色号」（整件收进化妆包就好）。★ 全库 66 条里有 44 条
//   是这样（睫毛膏/护肤/防晒/眉笔/眼线…）——**别把它渲染成「色号待补」**，那是替品牌许了个
//   永远不会兑现的诺。
// ★ 没有色号的产品**不进 `shades` 字典**；判据一律用卡片上的 `hasShades`,
//   别在页面里拿 `shades[id]` 在不在来推同一件事（两处判它迟早会漂）。
// ★ `hex` 是**近似值**（`hexApprox: true`,YSL 不公布 HEX）。展示文案必须继续明说。

// ProductDetailResponse（`GET /products/:id`，信息面板点开时才取）
{ id, name, categoryId, categoryLabel, number, dimensions[], wording[], shades? }
// ★ `dimensions` = 品牌资料原文、`wording` = 手写补充，是**服务端的两处来源**；
//   怎么摆由页面定（§8-5）。今天全库 66 条里：33 条两段都有、23 条只有原文、
//   10 条只有补充、**0 条两段都没有**。
// ★ `number` 是 docx 里的编号,补录产品是 `null`——界面不摆这一格。
```

★ **`plan` 里**每一步带 `hex`（✏️ 2026-09-30 反过来重写过）：后端在展开方案时就用
`styling/domain/ports/shade-lookup.ts` 把 `pid + code` 解析成色值，前端只渲染。
**空串 = 没色块**（无编号的产品），不是"待回填"。

★ **顺便：前端从此不再持有任何色值。** 想改某个色号的颜色 ⇒ 改 `products/overlay/<库>/`。
这条同时废掉了旧版 §1 那条「色值只有前端有」的硬约定——它现在是**反的**。
★ **`pendingRender` 与 `renderOffer` 是二选一的两个字段**（`renderOffer` 只有在
「妆面单在 + 照片在 + 没有欠着的提议」时才出现，见 `server/.../session.ts` 的 `renderReadiness`）——
页面**只该读一个入口**（`design.js` 里那句 `pendingRender || renderOffer`），
两个都摆就会出现两个出图按钮。哪个按钮文案用 `renderOffer.alreadyRendered` 决定。
★ **`hasFace === false` 时两个字段都不会有**（服务端不摆一个点下去必失败的入口），
所以那一屏要**自己**说清「这次没带照片，出不了成片」——`ResultView` 里那句就是它。

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
| `USER_AVATAR_NOT_FOUND` | 404 | ★ **账号在、只是没设过头像**（`GET /users/:id/avatar`）。✏️ 2026-10-01：刻意**不复用**上面那个码——那句「桃妆账号不存在」摆在一个明明存在的账号上是**假话**。⚠️ 前端**不该**把这一条当成错误提示：没有头像时按 `avatarSource: 'none'` 渲染 `.ph` 就够了，别去请一个注定 404 的图 |
| `CABINET_ITEM_NOT_FOUND` | 404 | 「不存在」与「不属于你」**共用**，别去区分 |
| `PERSONA_NOT_FOUND` | 404 | 同上，人设那一族：「这份人设不存在」与「这份人设不是你的」**共用同一个码**（不外泄存在性） |
| `PRODUCT_NOT_FOUND` | 404 | 产品库里的 id 没了（`GET /products/:id`）。★ 产品库**不校验归属**，所以这是真的"没有这件产品"，不是"不是你的" |
| `CABINET_FULL` | 409 | 化妆包满了（§6.2 那个 100 行的代价） |
| `NICKNAME_TAKEN` | 409 | 昵称占用 |
| `INVALID_CREDENTIALS` | 401 | ID 或密码错，**不泄露账号是否存在** |
| `VALIDATION_ERROR` | 422 | 请求体非法 / 枚举越界 / 多给了一个键（`.strict()`） |
| `INTERNAL_ERROR` | 500 | 服务端内部错误 |

**前端不按 code 分支。** 现有代码一律只展示 `message`——后端给的 message 已经是准确的中文
（如「桃妆 ID 已被占用」）。除非你要做**特定 code 的特殊动线**（目前没有），否则别引入 code→文案的映射表。

★ **后端 message 用的是「页面上的词」，不是后端的领域词**（2026-09-30 对齐过一次）：

| 后端内部叫 | 给用户看的 message 里叫 | 为什么 |
| --- | --- | --- |
| `nickname` / 「昵称」 | **桃妆 ID**（账号称「桃妆账号」） | 登录页那一格就叫「桃妆 ID」（`LoginView`） |
| `cabinet` / 「衣橱」 | **我的化妆包** | 那一屏就叫「我的化妆包」（`VanityView`） |

- 这是**刻意的两套词**：`server/` 内部标识符、模块名、README 全篇仍然叫 `nickname` / `衣橱`，
  **只换用户看得见的那几句 message**。两边的理由写在
  `server/src/modules/{user,cabinet}/domain/validators/*.validator.ts` 的文件头。
- ⚠️ **别再改回去，也别"为了统一"去重命名模块。** 后端那几句之所以必须用页面的词，
  是因为前端把它们**原样**打在输入框旁边——它们就是 UI 文案（§3 第 2 条）。
- ⚠️ `server/src/modules/agent/**` 有自己的一套（`用户不存在:<id>`），**刻意不同步**——
  ✏️ 2026-09-30 起**前半句作废、后半句仍然成立**：那条路由现在有前端在调了（§7.1），
  但 agent 那几句 message 的读者仍然是**排查的人**，所以**照旧不同步**。
  理由见 `agent/README` 的「各写面向自己读者的文案」——**不要去把「用户不存在:<id>」改成页面用语**。

### 7.4 联调

```bash
cd vue && npm run dev          # :5173，/api 已代理到 :3000
# 另一个终端：cd server && npm run dev
```
**不创建 `.env` 也能跑通全流程**（默认 mock，见 §8-7）——⚠️ **2026-09-30 起这句话的范围变大了**：
以前它只覆盖 A 档的账号与化妆包，现在**连设计链那条会话链也一起覆盖**——
后端缺省 `AGENT_LLM=mock`，回的是 `DemoLlm` 那段离线演示脚本，`/form → /result` 整条走得通
（方案、确认框、出图都有，只是**成片不是真渲染**，见 `server/README.md`）。
★ 仍然不走网络的是 B、C 两档里那些"本来就不该有服务端"的东西：首页内容、
以及场景卡与表单定义这两张常量表。
✏️ **2026-09-30：人设库不再属于这一列。** 它整族都走 HTTP 了（那一条族共 10 条，见 §7.1），
**后端不起就看不到脸**——与设计链那条一样，`VITE_USE_MOCK` 对它也逐字无效
（因为它压根没有 mock 分支）。缺省配置下它照样能用：人设库那 10 条**与 `VISION_ANALYZER`
无关**，开不开读脸都在；只有 `POST /personas/analyze` 那一条跟着那个开关走。

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
   ✏️ **2026-09-30：读脸真的接上了，所以这一条从"原则"变成了"要维护的实现"。** 四条：
   ① **判据只有一个**：`GET /personas` 回的 `canAnalyzeFace`（= 服务端注入了没有读脸端口）。
      它是 `false` 时，问卷页**一个「AI」字都不出现**、也没有那个按钮；`VITE_USE_MOCK` / 前端
      任何本地判断都**不许**掺进来（这条读脸是服务端能力，前端推不出来）。
   ② **按需跑**：这是一次**会花钱**的多模态调用，**绝不放在 `onMounted` 里**，用户点了才发。
      期间要有**真的**等待态（`.analyze-state--busy` 那条脉冲以前零消费者，现在有了）。
   ③ **翻不出来就置空**：服务端回的是**后端**档 id（`warm_beige`），前端用
      `SKIN_TONE_FROM_BACKEND`（`api/design.js`）翻成展示档；**查不到时必须当成"没读出来"**，
      留空等用户自己选——**绝不兜一个默认档**，那正是本条要防的事。
      ★ 也别让它落到本地哈希兜底上：旧版那个 `analyzePortrait()` 已经删了（§11-16），
      **不许为了"离线也能演示"把它加回来**（§8-4）。
   ④ **只读得出肤色**：没有面部特征、也没有置信度（服务端那格契约只有 `skinTone`）。
      ⇒ **特征永远由用户自己勾**，文案不许说"AI 建议已预填"（旧版那句是半谎，见 §9）。

2. **密码只在请求体里出现一次。**
   不进 store、不进 `localStorage`、不进日志、不进 URL。
   `stores/user.js` 只持久化 `{ id, nickname }` 两个公开字段（键 `beauty-app.user`），**多出来的键一律丢弃**
   （`readStored()` 那道类型检查就是干这个的）。
   `api/users.js` 拿到 `UserView` 后**没有任何凭证可存**——后端不签发 token、不建会话。

3. ★★ **照片：桃妆的口径与旧版前端**不同**，别照旧文档改。**
   旧前端写的是「本人照片即用即删、一律不落盘」。**人设库那条故意不是这样**——它的功能就是
   「把一张脸存下来反复用」。所以今天的规矩是**分两类**：
   - **人设库的照片：存在服务端，跟着账号走，长期保留（没有 TTL）。**
     ✏️ **2026-09-30 用户拍板改了这条。** 此前它是本节最硬的一条：`/personas` 的增删改查、
     换照片、问卷建档**「一行 HTTP 都不许有」**。改掉它的**理由就是那个功能本身**——
     存在本机 `localStorage` 的代价是**换台机器/换个浏览器那张脸就没了**
     （`api/personas.js` 的文件头当年还写着"页面文案不许讲成已同步到你的账号"）。
     现在：照片以 **dataURL** 走 `POST/PATCH /personas`（**不是 multipart**，理由见 C2），
     字节落在服务端 `<DATA_DIR>/personas/photos/`，挂在账号下，跨机器可见。
     三件配套的事，只写在这一处：
     ① **本机旧数据是删掉重建的，不做迁移**（用户拍板）：`tz:personas:<userId>` 与
        `tz:personas:seedv:<userId>` 两把键由 `stores/personas.js` 在**服务端列表成功之后**
        一次性清掉——**拉不到列表就不许动本机数据**。服务端给一份**一模一样的** 5 份种子
        （逐格见 `server/.../persona-seeds.ts`；§11-14 那条"3 份没有照片"照旧成立）。
     ② ★ **这条与 agent 那条是两套口径，别混成一句话写给用户。**
        agent 会话的照片按 `AGENT_SESSION_TTL_HOURS`（缺省 24h）**真删**（`docs/architecture.md` §6）；
        人设照片**不删**，直到用户自己删掉这份人设——`DELETE /personas/:id` **连字节一起删**
        （详情页那句确认文案已经如实写了这一点）。
     ③ **对人说的是「照片与档案都存在你的桃妆账号里」**——这是 §8-4 的反面：以前不许这么说，
        是因为它**只在**这台浏览器里；现在可以说了，因为它是真的。
        ⚠️ 但**也不许**说成"已加密 / 只存在本地"之类：服务端就是**明文存着**。
        这正是这条红线当初的顾虑，用户知情并选择了它——**别再自作主张把它说轻**。
   - **其余任何预览图**（如 `FormView` 的信息图上传）：走 `URL.createObjectURL`，
     **每次都要有对应的 `revokeObjectURL()`**——移除时收一份，`onBeforeUnmount` 收剩下的。
     没接上就是每选一张图漏一份内存，而且 blob URL 会把文件一直钉在内存里。
   - ★✏️ **2026-09-30（用户拍板）：`/form` 收的参考图是第二个外发点。**
     走 `POST /agent/sessions/:id/images`（multipart 字段 **`file`** + `kind`，**不是**
     本人照片那条的 `face`），调用点只有 `stores/design.js` 的 `submit`。
     三条与上面那条不同的地方，只写在这一处：
     ① **每个 `kind` 只送一张**（后端槽只有一个，同类再传是覆盖）⇒ 挑哪张由
        `api/design.js` 的 `refImagesOf` **一处**决定，`submit` 与 `toBrief` 必须调同一个；
        没送上去的那些要在 `sceneText` 里照实说，**不许静默丢**。
     ② **送上去了 ≠ 读了**：读图走 `/analyses`，**会花钱**，只能由用户在 `/result` 点
        （`stores/design.js` 的 `analyze` + `ResultView` 那块按钮）。**绝不在提交时顺手读。**
     ③ **与人设照片是两套隐私口径**——别把「24h 真删」那句承诺挪过来套在参考图上。
     缺省 `VISION_ANALYZER=off` 时那两条路由不注册，`analysisOffer` 整个键不出现，
     `/result` 上那块连壳都没有（§7.1）。
   - ★ 存/传进去之前**必须先缩图**（`shrinkPhoto`，长边 ≤640 / q0.82，典型 40–90 KB）。
     ⚠️ **这一步留着，但理由换了**：以前是 localStorage 那 5 MB 配额
     （第一张手机照片就可能 `QuotaExceededError`，而且**不抛到界面上**：建档"成功"、刷新后人没了）；
     现在是 **JSON 体积 / 服务端那条 1 MiB 的网**（`persona.validator.ts` 的 `MAX_PHOTO_BYTES`）。
     ⚠️ 缩图**拿不到 canvas 时会原样返回原图**，那种 base64 可能几 MB ⇒ 所以服务端那道 422
     必须给一句人话（现在已经给了），而不是让用户对着一个失败的红叉猜。
     两道防线照旧一道都不能省：**缩图** → **超了当场报错**。

4. ★★ **不许把「本地算出来的 / 策展来的」讲成「真的」。**（这是本仓头号 bug 类型：假开关）
   配置错/缺失但照跑、返回 200、日志干净，**只有结果是错的**。桃妆的具体形状：
   - ★★ **2026-09-30：这条的前两项反过来了，别再照旧的写法写文案。**
     此前这里写着「`api/design.js` 的整套方案是本地推导，结果页不许写『AI 正在为你编排』」
     和「`stores/design.js` 的 `fields` 今天没有任何东西读它，不许声称『已根据你的描述调整』」
     ——**两条作废**：方案现在是**后端 agent 算的**，`fields` 也真的经 `toBrief()` 进了 `brief`
     （§1）。所以结果页上**可以**说方案是 AI 按你填的信息定的，
     「生成中…」**也是真的在等**（`generating` 不再是装饰，最长 90 秒）。
     ⚠️ 但**反过来也有一条红线**：**不许把服务端没做的事说成做了**。
     ✏️ **2026-09-30：这里举的例子换了，因为那个例子不再成立。** 此前写着
     「比如『已根据你的照片分析了肤色』——那条链今天没有接」。**读脸现在真的接了**
     （`POST /personas/analyze`，§7.1）：配了 `VISION_ANALYZER=real` 时它是一次真调用、
     真的会花钱。所以规矩不是"不许提 AI"，而是**精确到那一次调用有没有发生**：
     - 没配（缺省）⇒ 界面上**一个「AI」字都不出现**，也没有那个按钮（§8-1 ①）；
     - 配了但用户没点 ⇒ **同样不许说"AI 已分析"**（建议是用户点出来的，不是进页面就有的）；
     - 点了 ⇒ 可以说"AI 读出的**肤色档**建议已预填"，但**特征不预填**、也必须写清
       "照片有色差，请按真实情况确认"——**它仍然只是一个建议**（§8-1）。
   - ★ **占位图彻底退出 `/result`。** 那两张标着「占位」的 hero 块**删了**（§1 末）。
     没出图时那一块**什么都不摆**（只显示确认框），出了图就摆**真渲染的那张**。
     **不许**为了让页面"看起来完整"塞一张假图或 `.ph` 进去——那正是本节要防的形状。
     同理：不许把 `MAKEUP_ENGINE=mock` 下返回的那张图（**输入照片原样**）说成渲染结果。
   - **`snapshotDesign()`** 返回的是一份**本地 JSON 快照**，没有落到任何服务端。
     所以按钮文案是「已记下这一版」，**不是**「已保存到我的作品」——后者会让人以为换台机器还能看到。
     ⚠️ **这条今天仍然成立**（会话落在服务端 ≠ 这一版方案落进了"我的作品"库）。

5. **商业内容可辨认、不搬运。**
   产品性质**摘自品牌资料，不是我们采集的口碑**——转述时必须说清出处，
   **不许讲成用户口碑或中立评测**（§11-4）。
   ✏️ **2026-09-30：这一条的现场换过两次，都记在这。**
   ① 此前它读 `kb/products.js` 的 `voice` 字段，而 `VanityView.vue` 那一格的标签就写着
   「用户口碑」（那是条真的红线违反，§11-4 记着）。
   ② 现在内容并进了后端 `products/`，`voice` 这个字段名退役——它并进了六维里的
   **`feedback`**（不是新增第七维，见 `server/.../content.ts`）。
   ③ ✏️ **2026-10-01：信息面板改成一个列表**（用户拍板，此前是「品牌资料」+「我们补的」
   两个标题分两段）——一个 `key` 一行，品牌原文在前、手写层那句接在后面，
   标题只写「为什么选它」（**不再写「品牌资料」**：它现在盖着两处来源的话）。
   ⚠️ **明知故犯的代价**：同一行里混着两处来源，读的人分不出哪句是品牌说的——
   分两段本来就是为了这个。**别再自作主张把两个标题加回来**，但也别在别处
   （`/mine`、详情页文案）跟着把品牌宣称讲成我们的结论。
   ★ **空着也比硬贴强**：那两段都为空的条目**整块不渲染**（今天 66 条里 0 条如此,但形状要留）。
   ★ **只有真收了钱才写「赞助」**——少标一个字只是不够显眼，多标一个字是**虚假披露**。

6. **登录门禁不是安全边界。**
   `router/index.js` 的 `beforeEach` 只看本地那份 `{ id, nickname }`，**拦不住也不该假装能拦住谁**。
   真正的把关在后端（化妆包改/删一律校验归属，不属于你就报 404）。
   **别把这段代码写成「安全」的样子**，更别基于它做任何「用户只能看到自己的数据」的假设。

7. **演示模式（`VITE_USE_MOCK !== 'false'`）只覆盖账号与化妆包。**
   它假的是**账号与化妆包**（`api/mock.js`，化妆包落在 `localStorage` 的
   `beauty-app.mock-cabinet`，复刻「刷新后还在」；✏️ 2026-10-01 起**账号那块连资料一起假**——
   简介与头像落在 `beauty-app.mock-profile`，头像直接存 dataURL，因为演示模式没有那条取字节的路由）。
   ★ 资料这一半**是允许假的**，理由与化妆包相同：它就该是"存下来下次还在"，
   演示模式复刻的是**同一件事**（localStorage 而不是服务端）。
   ⚠️ 但它与人设库那条不同：**真实模式的头像字节确实在服务端**，所以别把这段当成"头像本来就不用后端"。
   ★ 演示模式**不校验密码**，也**刻意不存明文密码、不做假校验**——没有后端就没有 scrypt。
   ★ **别往里补假的方案、假的人脸分析结果**，那会让「看起来能用」和「真的能用」分不清。
   ✏️ **2026-09-30 订正了这句的范围**：此前写的是「B、C 两档与这个开关无关」，
   而设计链**从这天起是 A 档**（§1），所以它既不受这个开关管、
   **也不能靠它离线**——`api/agent.js` 没有 mock 分支，**后端不起就没得走**。
   要看离线演示，靠的是**后端那条**开关（`AGENT_LLM=mock` 的 `DemoLlm`），不是前端这条。
   ✏️ **同日稍后：`api/products.js` 是第四块「刻意的空白」**（前两块是 `agent` / `personas`、
   第三块是 `weather`）。数字美妆台的目录现在是品牌内容、由服务端下发，
   给它编一份本地目录正好把「真的接上了」和「看起来接上了」变得一模一样——
   **后端不起 ⇒ `/vanity` 两屏给一句人话的错，这是要的，不许兜底。**
   ✏️ **同一天稍后：人设库也从"与两个开关都无关"里出去了。** 它现在与设计链同一处境——
   走真后端、**刻意没有 mock 分支**，所以既不受 `VITE_USE_MOCK` 管，也不能靠它离线。
   ⚠️ **尤其别往 `api/mock.js` 里补一份假人设库**：那份假数据一定长得和真的一样，
   而它的坏法是**最贵的一种**——用户在 A 机器上建的脸在 B 机器上不见了，
   界面、日志、状态码全都是对的（本仓头号 bug 类型，§8-4）。
   仍然与两个开关都无关的：首页内容（C 档，加上 B 剩下那半张常量表）。

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

### 主链路：开始设计（**A 档 + 后端**，最容易被改坏的一条）

★★ **这一条现在要两个终端一起开**（`vue` 与 `server`），缺了后端 `/form` 提交就走不通——
`api/agent.js` 没有 mock 分支（§8-7）。缺省（`VITE_USE_MOCK` 不设 + 后端不给 `.env`）时
**整条链能离线走完**：后端回的是 `DemoLlm` 那段演示脚本，方案、确认框、出图都有，
**只是那张成片不是真渲染**（`MAKEUP_ENGINE=mock` 把输入照片原样返回）。

1. `/create` → 5 张场景卡；点任一张 → 进人设库且**已经切到挑人模式**（`?scene=&pick=1`）。
2. 挑一张脸 → `/form`。★ **`?persona=` 缺失或那份人设已删时必须回人设库**，
   不许停在一个没有依据的空壳表单上。
   ⚠️ **这两句话现在是异步的**（2026-09-30 人设改从服务端拉，「已删」要等服务端回答）：
   `FormView` / `PersonaDetailView` 的 `onMounted` 里那句 `personas.load()` **必须 `await`**。
   漏了 `await` 的坏法是**静默的**——列表还是空的，于是**每一张脸都会被判成「没有这份人设」**，
   用户被不声不响地踢回人设库（"点进去又弹回来"）。两处都要试：**一张静态图种子**与
   **一张自己传的**（后者的 `photoUrl` 是服务端 URL，还要看它有没有漏 `API_BASE`）。
3. 填信息：每个字段**「文字描述」与「上传图片」两个块同时摆着**（2026-09-30 起不再切页签），
   想填哪个填哪个、也可以都填；提交时两种都收（`collectFields` 的 `type` → `'both'`）。
   选一张图 → 移除 → **控制台里不应有 blob 泄漏**（这条只能靠肉眼看代码 `revoke` 有没有接上）。
   ★ 参考图是**第二个外发点**（§8-3）：同一格传两张、以及「风格」与别的格各传一张，
   提交后看服务端留下了几张——**每个 `kind` 只该有一张**（后端的槽就一个）。
   ✏️ 2026-09-30 起这一屏还有**今日天气**那一块（✏️（六）），本节唯一要新验的东西就是它：
   - 不填城市直接点「查天气」→ 只出提示、**不发请求**；填「上海」回车 → 出一行；
     填一个查不到的地名 → 后端那句人话落在**那一行下面**（不是底部那条 `ErrorNote`），
     且接着点「生成我的妆容」**照样提交成功**（天气是可选的，失败不许挡提交）；
   - 「用当前位置」→ 允许则出一行；**拒绝授权**则出「没拿到定位…」，同样不挡提交；
   - ★ 后端配 `WEATHER_PROVIDER=mock` 重启再查一次 → **那一行不出现**（也不进 `brief`）；
   - ★ 提交时看请求体：`weather` 是**四格**、**没有 `source` / `place`**（多一个键整份 422）。
4. 提交 → **这一次是真的在等**（最长 90 秒）。★ 重点看这四样：
   - 服务端日志里应当出现请求：建会话 → 传照片 →（**只有 `VISION_ANALYZER=real` 时**）逐 `kind` 传参考图 → 发开场白；
     ⚠️ 缺省是 `off`，那时那两条路由**根本没注册**（404），所以**一张都不该发**——发了就是把整次提交栽掉；
   - 跳过去之后 URL 是 **`/result?session=<一串 id>`**（不是旧那三个参数）；
   - **后端不起时**：提交后停在本页、给一句人话的错——**不许**默默跳到一个空方案的结果页。
5. `/result` 上该有：方案（步骤 / 色板 / **推荐产品** / 个性化卡）+ **一个出图确认框**，
   而且**没有任何标着「占位」的块**（§8-4）。
   ★ 色板与推荐产品**都在计划级**（侧栏那排色号 chips + 底下那份产品清单，两处同源 `plan.products`）；
   ⚠️ 两者**为空时整块不渲染**——摆一个只有标题的空壳，用户会以为颜色/产品丢了。
   ★ 还要有**读图那一块**（`VISION_ANALYZER=real` 才有，`off` 时连壳都不该有）：
   只列**真有图**的那几格，缺图那格整行不出现（摆了就是点下去必 422）；
   点一下**才**真读（会花钱）；「用户自己填过了」那格置灰并写出后端给的理由。
6. ★ **这一步是"看它不在"**：✏️ 2026-10-02 起页面上**没有**那排「换一个妆容风格」chips、
   也**没有**「换一版」按钮（`plan.styleOptions` 已随配方绑定一起下线，见 §1）。
   ⚠️ 真在页面上还能点到，说明你开的是旧的 `dist`/旧标签页——`npm run dev` 重来。
   ★ 顺带看 hero 里那格：**只有「N 个步骤」**，没有「约 N 分钟」「进阶」这类凭空来的数字（§8-4）。
7. **刷新 `/result`** → 还是同一次会话（地址栏那个 `?session=` 就是全部状态）。
   ★ 这条是 §3 第 6 条那个「走 query、可深链」的现场验证。
8. 步骤导航：滚动时**反向高亮**跟着走；点某一项**滚到那一步**（且不被路由的 `scrollBehavior` 抢掉）。
9. **点确认出图** → 真的调引擎 → ✏️ 2026-10-01 起**每个上妆步各出现一张图**（3~7 张，逐步累积）：
   步骤列表里那几步各自摆上自己那张「到这一步为止」，**护肤 / 妆前 / 防晒 / 定妆不摆空块**。
   ★ 缺省引擎下这些图**就是刚才传的照片原样**，别拿它们判断妆效（§8-4 末条）。
10. 「保存妆容」→ 按钮变成**「已记下这一版」**（★ 不许是「已保存到我的作品」，见 §8-4）。

### ★ 出图那条路（要花钱，单独走一遍）

后端 `.env` 里按级配，**每一级都比上一级更真、也更贵**：

| 配置 | 会发生什么 |
| --- | --- |
| 什么都不配 | `AGENT_LLM=mock` + `MAKEUP_ENGINE=mock`：脚本演、引擎把照片原样返回。**不花钱** |
| `AGENT_LLM=real` + `DASHSCOPE_API_KEY` | 真模型真的按你填的需求挑配方与色号。**花钱（按 token）** |
| 再加 `MAKEUP_ENGINE=image` | 真的把妆容渲染到脸上。★ **按次计费，这是全项目唯一真正花钱的一步** |

★ 三级都要走一遍的**理由**：只走 mock 时，"确认框点下去到引擎"这条链是通的，
但**没有任何东西证明真模型会照格式回话**——那件事只有 `real` 能回答（`server/README.md`）。
⚠️ 走 `image` 那一级之前**先确认自己在不在付费账户上**，并且**别连点两次确认按钮**。

### 人设库（A 档，真后端 + 照片在服务端——★ 这一节 2026-09-30 整体重写过）

> **这一节要两个终端一起开**（`vue` 与 `server`）：`api/personas.js` 没有 mock 分支（§8-7），
> 后端不起就整屏没数据。⚠️ **它跟 `VISION_ANALYZER` 无关**——那 10 条路由里只有
> `POST /personas/analyze` 跟着那个开关走，列表/建档/换照片照常。

1. `/personas` → 5 份种子人设；**首次进入就该补齐**（`PERSONA_SEED_VERSION`）。
2. ★★ **换一个浏览器 / 无痕窗口登录同一个账号 ⇒ 人设还在。**
   这条是这次改动的**全部目的**，也是唯一能证明它真的落地了的验证——
   它绿了，说明数据确实在服务端而不是"看起来像"。**别的都不算**。
3. ★ **本机旧数据该被清掉**：登录后在 devtools 里看 `localStorage`，
   `tz:personas:<userId>` / `tz:personas:seedv:<userId>` 两把键**应当已消失**。
   ⚠️ 但**拉不到列表时它们必须还在**（清理只发生在列表成功之后）——
   把后端停掉再进 `/personas`，键不该被删。
4. `/personas/new` → 两个上传入口（拍照 / 相册）驱动同一支隐藏 `input`；
   ★ **同一个文件连选两次也要能触发**（`useFilePick` 的 `pick()` 点之前清了 `input.value`）。
   `/personas/:id` 的「换一张照片」走同一条路，**两处都要试**。
5. 建档 → `/personas/quiz`：**读脸按钮只在 `canAnalyzeFace` 为真时出现**（见第 8 条）；
   肤色与特征**由用户自己选**；名字或肤色空着时「建好这个人设」要走不通。
   ★ 建档那一刻照片才上传（`stores/personas.js` 的 `create`）。
6. 详情页 → 换照片 → **只缩图、不碰建档草稿**（`shrinkOnly`，别借 `putDraftPhoto` 那条路）。
   ★ **照片这一格有三态**（没动过 / 换了一张 / 要删掉），它们在请求里是三种不同的东西：
   不传 `photo` / 传新 dataURL / 传**空串**。三态都要走一遍——「没动过」最容易写成
   "把现有照片再传一次"或者"传空串把照片删了"，而那两件事**都不会报错**。
7. 删除 → 先弹 `window.confirm`，取消不该删掉；确认后**服务端那份照片也一起删**。
8. ★ **读脸那一个开关**（要真配置才验得了，缺省那半边是"不许有"）：
   - **缺省（`VISION_ANALYZER=off`）**：问卷页**没有那个按钮**、左栏文案里**没有「AI」字**、
     肤色提示语是那句不提 AI 的。★ 这一屏是"假开关"最容易复发的地方，改文案时盯住它。
   - **配 `VISION_ANALYZER=real` + key 后重启**：按钮出现（**点了会花钱**），
     点完**只预填肤色**，特征仍然是空的；等待期间按钮禁用且有那句"正在读这张脸…"。
   - ⚠️ 无论哪种，**肤色档都还是用户最后确认的那个值**（§8-1）——读脸只是把选择框先填上。
9. ★ **大照片那道网**：传一张几 MB 的手机照片 → 要么缩图后存下，
   要么当场给一句人话（「照片太大了(最多 1024 KB)…」），**不该出现「保存成功、刷新后变回去」**。
10. **文案**：现在**可以**说照片与档案存在你的桃妆账号里（§8-3 改了口径）；
    ⚠️ 但**不许**说成"已加密"、也不许把 agent 那条「24h 真删」的承诺挪过来套在它头上——
    这两条是两套口径。

### 数字美妆台（**A 档两半**，✏️ 2026-09-30 从 A+B 升上来）

> ★ **这一节也要两个终端一起开**（与上面人设库同理）：目录现在走 `GET /api/products`，
> `api/products.js` 没有 mock 分支（§8-7）。**后端不起，这两屏就该整屏报错。**

1. `/vanity` → 「我的化妆包 / 全部产品」两个视图切换。
2. ★★ **把后端停掉，再进 `/vanity` 与 `/vanity/add`** ——
   要看到的是**整屏一句人话的错**（「没能连上服务器，请确认后端在跑。」之类）
   **加上一个「再试一次」**，**不是**空列表、不是「暂无产品」、更不是一直转圈。
   这是今天新出现的失败模式（§6.2），也是这一轮最容易做错的一处。
3. ★ **加载态与"暂无"必须分得开**：后端在跑、但慢的时候（devtools 里 throttling），
   请求没回来之前**不许出现「暂无产品」/「这一类都已经在你的化妆包里了」**——
   那句是结论，不是占位（§6.2）。`catalogLoading` 那一块就是它的现场。
4. 全部产品 → 挑一个色号 → 收进化妆包 → **刷新，它还在**（走 `/cabinet/items`）。
5. ★ **条数对表**：提前护理 25 / 妆前 6 / 底妆 8 / 眼妆 7 / 口红 11 / 提亮修容 3，**全库 66**。
   不对就是内容层（C1）出了问题，不是前端。
6. ★ **`hasShades === false` 的那 44 条要显示「无色号」**（`p.shadeCount` 那格读它），
   **不许出现「色号待补」**——那是替品牌许了个永远不会兑现的诺（§7.2）。
7. ★ **一件产品的第一个色号入库时，「整件」行要一起建出来**（§6.2）；
   丢掉最后一个色号后，**这件产品仍留在包里**。
8. ★ 收录一支有 10+ 色号的产品 → 每条特性**都不该超过 40 字符**
   （这是 §6.2 那个 422 陷阱的现场验证）；把包塞到 100 行以上 → 后端回 409，
   **页面要把那句人话原样显示出来**，不是静默失败。
9. ★ **信息面板是第二个异步点**（点开产品才取详情）：快速连点几件产品，
   面板要跟着切；**取不到时给一句人话**，不是空白面板。
   ★ **面板不该"闪一下"**：进「全部产品」后当前分类的详情已在后台顺序取回
   （`prefetchCategory`），划过卡片再补一件（`prefetchDetail`）——点开应当是缓存命中、
   面板**一次渲染**直接换成新内容，不出现「正在取…」那一帧（§6.2）。
   ★ ✏️ 2026-10-01：面板是**一个列表**（§8-5），**一个 `key` 只出现一次**——
   两边都有「质地/妆效」这类重叠 key，出现两遍就是合并那一步没走到。
   ★ 品牌原文（`dimensions`）在前、手写补充（`wording`）接在同一行后面；
   两处都为空的产品**整块不渲染**（今天 66 条里 0 条如此）。
10. ★ **化妆包卡片上的色点要有颜色** —— 这条验的是色号（含 `hex`）有没有随库一起下来。
11. 切到 `VITE_USE_MOCK=false` 再走一遍第 4 步，确认命中真后端。

### 第一层与登录（A+C 档）

1. 未登录时打开任意路径 → 落到 `/login`，地址栏带 `?redirect=`；登录后**回到原本那一页**。
2. 登录后再访问 `/login` → 直接进首页（不是"退不出去"）。
3. `/mine` → 「退出登录」→ 回登录页；★ 再登录另一个 ID，**化妆包与人设都该是新的**
   （`logout()` 里那两个 `reset()` 就是干这个的）。
4. `/` 与 `/inspiration`：数据是策展内容（C 档），**页面文案不许讲成"社区正在发生的事"**（§8-4）。
5. `/mine` 的统计数字（作品/粉丝/获赞）是演示值——**不许写给用户看说它们是真实统计**。
6. ★✏️ 2026-10-01 **编辑资料**（`/mine` 页内那个面板，走真后端——**这一屏要两个终端一起开**）：
   - 「编辑资料」展开面板 → 改简介 → 保存 → 刷新仍在；**换一个无痕窗口登录同一账号，简介与头像也还在**
     （这条与 §9 人设库第 2 条同理：它证明的是"真的存到账号里了"）。
   - ★ **只改简介时头像不许消失**，只换头像时简介不许被清空 —— 这是本次最容易写错的一处
     （"没传"被当成"清空"），错了**不报错**。
   - 头像三态各走一遍：没动过 / 换一张 / 点「删掉头像」。删掉之后再进 `/mine`，
     卡片上该回落成 `.ph` 占位块，**不是破图**（后者是 `avatarSrc` 漏拼 `API_BASE` 的典型样子）。
   - ★ **换完头像那一屏要立刻变新的**（不是刷新后才变）——那一条靠的是 `MineView` 里那个 `?v=` nonce
     （§7.1 那条 ★）。看不见变化就是它没了。
   - 传一张几 MB 的手机照片 → 要么缩图后存下，要么后端那句人话（「照片太大了…」）**原样**出现在面板里。
   - 把后端停掉再进 `/mine`：**演示统计照常显示**，档案那一块给一句人话的错——
     ★ **不许**拿 `api/home.js` 里的演示简介/头像顶上（那正是 §8-4 要防的形状）。
   - 切到演示模式（`VITE_USE_MOCK=true`）再走一遍上面几条：简介与头像应当落在本机 localStorage 里
     （`beauty-app.mock-profile`），刷新不丢（§8-7）。

### 其他

| 改动 | 牵动 |
| --- | --- |
| 加一个接口 | `api/<域>.js` 加函数（A 档要写 mock 分支，**惰性 import**）→ `api/mock.js` 补同形状假实现 → store 里包一层 → 页面调用 |
| ★ 那条链**在浏览器里复刻不了**（要服务端真实状态 / 会花钱） | **不要**给它加 mock 分支，改成页面明确说「不可用」 |
| ★ 那条链**能复刻但不许复刻**（天气） | 同样**不给 mock 分支**（`api/weather.js`）：一份假天气混进 `brief` 就是「看起来能用」。离线路是**服务端**那条 `WEATHER_PROVIDER=mock`，它自报 `source`（见 §6.1 末） |
| ★ 那份数据**本来就该在服务端**（产品库） | 同样**不给 mock 分支**（`api/products.js`）：内容已经住在 `products/`，前端再编一份就是把两套词汇表请回来——**这正是这次搬家要杀的东西**。后端不起 ⇒ 界面给一句人话的错（§6.2） |
| 加一个页面 | `pages/XxxView.vue` → `router/index.js` 加路由（**静态段排在动态段前**）→ `AppSidebar` 要不要高亮看 `meta.nav` → 需要门禁就别加 `meta.public` |
| 加一个 store | 放 `stores/`；`reset()` 要把自己那份收干净（含 objectURL 与 localStorage）并接进 `user.js` 的 `logout()`。★ 一旦 `stores/user.js` 要引它，**它就不能静态引 axios**（首屏链，§6.3） |
| 加一个图标 | `Icon.vue` 的 `ICONS`（**`vb` 要抄对**，见 §5.1） |
| 改色号 / 加产品 / 改产品性质 | **改 `products/overlay/<库>/`**（`products/overlay/ysl-property/`），然后**重跑导入器**——生成物一个都不许手改。**任何地方都不许另写一份 hex**；前端一行产品数据都没有了（§6.2、§7.2） |
| 改人设库 | 前端在 `api/personas.js`（HTTP + `decoratePersona`）与 `stores/personas.js`；**数据和种子都在后端**（`server/src/modules/user/**`，种子的 `PERSONA_SEED_VERSION` 也在那边）。★ 改 `skinTone` / `features` 的取值口径要**同时**动 `server/test/persona-vocabulary.test.ts` 对的那几张表——那正是它的用处。★ 改照片上限要动 `persona.validator.ts` 的 `MAX_PHOTO_BYTES` **和**路由的 `bodyLimit`（两个都要，见那段注释） |
| 动 `vite.config.js` | **必须 `npm run dev`**（alias / `fs.allow` 只在 dev 暴露问题） |
| 改设计链（场景 / 表单 / 方案） | 前端的**输入侧**在 `api/design.js`（`SCENES` / `SCENE_FORMS` / `toBrief`）；**方案本身在后端** `server/src/modules/styling` + `agent` 的 `propose_look`——✏️ 2026-10-02 起**步骤由模型自己写**（21 条配方只当参考），前端改不了（§1）。★ **色值也在那边**：`styling/application/decorate-plan.ts` + `shade-lookup.ts`，数据源是产品库 |
| 动 `agent` 那条链的**出图**部分 | ★ 先读 `server/src/modules/agent/README.md` 的确认回合那一节：**出图只有两个入口，都要用户点头**。前端这边唯一的调用点是 `stores/design.js` 的 `confirmRender()`，而它必须靠 `generating` 禁用按钮（连点 = 连扣费） |
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
     （✏️ 2026-09-30 前是 `kb/products.js` 的 `voice`，现在并进了产品库的 `feedback` 维），
     **不是我们采集的口碑**，§8-5 不许讲成用户口碑。**建议标签改成「品牌宣称」之类，值本身不用动。**
     ★ 这条**仍然没有拍板**，所以这次搬家**原样保留了那个标签**——改标签是文案决定，不是搬运工的事。
   - ~~（`kb/shades.js:178` 有一个色号叫「显白西红柿」，那是**品牌商品名**，我倾向不动——
     改商品名等于篡改产品数据。但这条也该由你定。）~~
     ✏️ **2026-09-30：那个色号随 `kb/shades.js` 并进了产品库**（`products/overlay/ysl-property/`），
     **名字原样保留**（同上：改商品名等于篡改产品数据）。想知道它在哪个文件里，
     grep「显白西红柿」。**这条仍然由你定，搬运工没动它。**
5. **`FormView` 的步骤条统一成 4 步**。源站的 `form.html` 写的是「1 选场景 / 2 填信息 / 3 生成方案」，
   少一步「选形象」，于是「2」在这一屏指填信息、在上一屏指选形象。这里统一成与
   create / personas / result 一致的 4 步。

### 零消费者 / 死按钮（**照源站保留**，不是漏收拾的）

6. **一批按钮与链接今天没有任何去处**，全部是照源站原样留的。**不是为了"下一步再做"，就是没有目的地**：
   - `LoginView`：「忘记密码？」(`href="#"`)、微信登录、手机号登录；
   - `HomeView`：搜索框、通知铃、右上头像、三处「更多 / 全部 / 查看全部」(`href="#"`)、
     贴士卡上的 `去试试` 按钮、**hero 的 5 个圆点**（源站 5 张 banner 只展示第一张，
     圆点既不可点也不轮播，是装饰）；
   - `MineView`：通知、设置、「重新测一测」。
   ★ **别把它们当成"顺手接一下"的机会**——接任何一个都等于自己发明一个目的地。
   要么问用户，要么留着。
   ✏️ 2026-10-01：**「编辑资料」从这份名单里出去了**——用户拍板要做（范围：只有简介 + 头像），
   现在它连着后端 `PATCH /users/:id`（§7.1 ✏️（八））。**剩下那三个照旧没有目的地。**
7. **`public/demo/` 下的两个 SVG 已无引用**（`demo-photo.svg` / `scenery.svg`），
   它们服务的是被删掉的 `/upload` 那条链。**先别删**——它们是源站素材，
   将来要重建"上传 → 出图"那条链时可能还要用。这是**已知的零消费者文件**，不是漏收拾的。
   （`public/assets/img/ph-*.svg` **不是**死文件：它们是种子人设的照片——
   ✏️ 2026-09-30 起指它们的是**后端**的种子表，见 §11-14。）
   ★ 2026-09-30：**"重建上传 → 出图"这件事做完了**，但走的是 `/form` 那条动线，
   与这两个 SVG 无关——它们**照旧零消费者**，照旧先别删（`kb/styles.js` 已经不是了，见 §4）。
8. **`/mine` 的统计与 `aiProfile` 标签是策展值**（C 档），不是真实统计（§8-4）。
9. ~~**`stores/design.js` 的 `fields` 与 `generating` 今天都没有读者**~~
   ✏️ **2026-09-30 作废，两条现在都有读者了**：`fields` 经 `toBrief()` 进了 `brief`（§8-4），
   `generating` 是真的在等（最长 90 秒）。**别再把它们当成"留着备用的空壳"删掉**——
   同理，`ResultView` 里那句 `:disabled="design.generating"` 现在防的是**真会重复扣费**的连点。

### 结构性事实

10. ~~**搬迁删掉了全项目唯一一条真的会出图的路径**~~
    ✏️ **2026-09-30 作废**：`/form → /result` 那条动线把它接回来了（§1 末、§9）。
    `/result` 上不再有占位块，出图前有确认框、出图后是真渲染的那张。
    ⚠️ 缺省配置下"出了图"仍然**不产生账单也不产生真渲染**（`MAKEUP_ENGINE=mock` 原样返回）。
11. ★ **`@scene-rules` 今天零引用**（§2）。alias 与 `fs.allow` 留着是因为后端测试读
    `vite.config.js` 钉着它们。✏️ **后半句"两套不同的东西、刻意没有合并"作废**——
    两条清单从 2026-09-30 起是同一套（§2）。
12. ★ **前端零测试基建**：`package.json` 里没有 vitest，全仓没有一个前端测试文件。
    所以**任何一个页面的回归只有「手工走一遍」这一条路**——改动前后别声称"测过了"。
    ★ 后端那一侧的跨端对表测试（`server/test/*.test.ts` 里读 `vue/src/**` 的那几条）
    **不能替代这一条**：它们钉的是内容与契约，**钉不住"这一屏跑不跑得起来"**。
13. **`api/mock.js` 只剩账号与化妆包两块。** 别为了"离线也能演示"往里补假的方案或假的人脸分析。
    ✏️ 2026-10-01：账号那块**含资料**（简介 / 头像，落在 `beauty-app.mock-profile`）——
    这不是"补了一份假的"，它复刻的正是真后端那份行为（见 §8-7）。
14. **`public/assets/img/` 下只有两张脸**（`ph-colleague.svg` / `ph-sister.svg`）——
    5 份种子人设里另外 3 份的 `photoUrl` 是空串，靠 `PersonaAvatar` 的「首字 + 肤色档底色」合成。
    这是设计如此，不是缺图。
    ✏️ **2026-09-30 起这两张 SVG 由后端的种子表指着**（`server/src/modules/user/domain/
    entities/persona-seeds.ts` 里那两个 `/assets/img/ph-*.svg`；路径是**前端 `public/` 下**的，
    服务端只存字符串、不存文件）。⇒ 改文件名/挪位置要**同时**改种子表，而
    `server/test/persona-vocabulary.test.ts` 会拿 `existsSync` 当场逮住漏改的那一边。
    **这 3 份空照片的种子照旧一个都不许补图**——它们走的正是新建人设时的默认态。
15. ★ **2026-09-30 定了两条新规矩，别再改回去**：
    （a）SFC 块顺序统一成 `<template>` → `<script setup>` → `<style>`。
    改之前**全仓 24 个文件都是 `script` 在前**（包括搬迁前就存在的那 5 个），这是**新规矩**、不是修搬迁的错；
    自检命令在 §9。
    （b）新增 `src/composables/`（5 个，见 §3 第 7 条）。它的**判据是「重复」或「红线集中」**，
    与 §4「页内私有的样式与小组件别拆出去」不冲突——别拿那句话当理由把 composables 删掉。
16. ★ **2026-09-30 删了两处镜像死代码，并订正了 §7.1 那张表**：
    （a）`api/cabinet.js` 的 `updateCosmetic` 与 `api/mock.js` 的 `mockUpdateCosmetic`
    全仓**零调用点**——桃妆没有任何界面能改一条已有条目的名称或特性。两处都已删除；
    后端 `PATCH /cabinet/items/:id` 本身不动，只是前端**刻意不留一个没人走的空壳**。
    （b）§7.1 原先写「cabinet 4 条 / 桃妆用 4 条」「桃妆只用 6 条」，实际是 **3 条 / 5 条**。
    （c）同一天稍后设计链接上了 agent，§7.1 的总数又变成 **11 条**（agent 占 6 条）。
    ★ 判据与本仓删「没有抛出点的错误码」是同一条（见 `server/.../app-error.ts` 的注释）：
    **一段永远不会执行的形状 = 假开关**。以后新加 `api/*.js` 函数时也照此办理——
    照有 HTTP 路由就镜像一份，等于自己养一批零消费者。
17. ★ **2026-09-30（三）：人设库落地到服务端时删掉的那一批，别照旧印象加回来**：
    （a）`api/personas.js` 里整套 localStorage 实现——`SEED_PERSONAS`、`storage`/`memStore`、
    `readPersonas`/`writePersonas`/`migrateSeeds`、两把键前缀常量、`PERSONA_SEED_VERSION`。
    （b）`getPersona(userId, id)`——**全仓零调用点**（store 一直用自己的 `getById`）。
    按同一条判据它不留空壳；后端也**刻意没有** `GET /personas/:id` 单条路由（§7.1 那张表里没有它）。
    （c）`analyzePortrait()`——那个**本地哈希**版的"读脸"。它给出的"建议"是编出来的，
    用户点一次拿到的是一档随手算出来的肤色，而界面上和真读脸长得一模一样（§8-4）。
    现在这条路是 `analyzePersonaFace()`（真调用、会花钱、配了才存在），**不许把它加回来兜底**。
    （d）`stores/personas.js` 的 `count`——零消费者（同 (b) 的判据）。
    （e）`humanize()` 里的 `QuotaExceededError` 那一支——不再往 localStorage 写，它是死分支。
    ⚠️ **`decoratePersona` 留着**（它算的 `skinToneHex`/`featureNames` 只有前端 kb 有，§7.2），
    **`shrinkPhoto` 也留着**（理由从配额换成了 JSON 体积，§8-3）——这两个别顺手一起删。
18. ★ **2026-09-30（七）：产品数据合一删掉的那一批，别照旧印象加回来**：
    （a）`vue/src/api/kb/catalog.js`、`kb/products.js`、`kb/shades.js` —— 三份手写常量，
    内容并进了后端 `products/overlay/ysl-property/`，经 `GET /api/products` 下发（§6.2、§7.1 ✏️（七））。
    （b）`api/design.js` 的 `hexOf` / `decoratePlan` 与 `import { SHADE_LIBRARY }`；`stores/design.js`
    的 `plan` 现在直接就是 `session.plan`（色值由服务端回填，§7.2）。
    （c）`api/vanity.js` 的 `decorateProduct` 与那套本地目录函数
    （`fetchVanityTree` / `fetchCategoryProducts` / `fetchCatalogProducts` / `fetchShades` /
    `fetchToneFilters` / `productById`）——并成了一个 `fetchCatalog()`。**`TONE_LABEL` 那张表也退役了**
    （色调中文名从每个色号自己的 `tone` 格取，`toneFiltersOf`），别加回来。
    （d）`VanityView.vue` 里 `activeShade.tone === '待补'` 那一块与 `.shade-detail--pending` 那条 CSS——
    占位色号生成器没了之后它**永远不会命中**（假开关家族）。
    ★ **留着不动的**：`kb/features.js` / `kb/skintones.js` / `kb/styles.js`（`features` 与 `skintones`
    仍是 B 档真数据；`styles.js` 被后端测试当"搬运前的原件"对表，§4）。**别顺手一起删。**
    ⚠️ **两个偏离已批准计划的地方，记在这**（做的时候改了主意，不是漏看）：
    ① **传输层不改字段名**：服务端的 `label` / `categoryLabel` / `text` 原样透给页面，
    不做 `label→name` 那类改名——改名表是这次要杀的"第二套词汇"，架一张回来就是自相矛盾；
    ② **信息面板成了第二个异步点**：详情走 `GET /products/:id`，`stores/vanity.js` 有
    `detailLoading` / `detailError`，`VanityView` 面板三态渲染。计划里写的是"仍同步"。
19. ★ **2026-10-02：步骤改由模型自己写（21 条配方降为参考）之后删掉的那一批，别照旧印象加回来**：
    （a）`stores/design.js` 的 `styleOptions` / `setStyle` / `regenerate`——配方不再是"一份可选清单"，
    `plan.styleOptions` 与 `family` 一起从 `PlanView` 下线。★ **`runTurn` 是同一天跟着它们一起死的**：
    它此前只有这两个调用点，而 `/result` 上**没有任何输入框**。`api/agent.js` 的 `sendAgentMessage`
    照旧留着（`submit` 还在用它发开场白）。
    （b）`ResultView.vue`：整块 `.style-switch`（那排「换一个妆容风格」chips）与 `onRegenerate` /
    `applyStyle`；每步的 `step-block__products`（**产品上移到计划级**）；hero 里 `minutes` / `level` 两格
    （模型现编的"约 30 分钟"就是假数字，§8-4）。
    （c）CSS：`.style-switch*`、`.style-chip*`（含 `--active`）、`.step-block__products`、
    `.product-line__step` 全部变成零消费者；`.product-line` 的网格少一列（`36px 1fr 80px`）。
    （d）`snapshotDesign` 不再搬 `minutes` / `level` / 每步的 `products`——快照里色号只住在**计划级** `products`。
    ★ 判据仍是 §11-16 那条（**一段永远不会执行的形状 = 假开关**）。
    ⚠️ **别把「换一版」当成"顺手接一下"的机会**（同 §11-6 那份名单）——想改风格走对话（§1）。
