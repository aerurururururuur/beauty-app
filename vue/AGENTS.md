# vue/ 前端协作契约（给 AI 与新接手的人）

> **这份文件是什么**：`vue/` 的**实现契约**——分层怎么切、共享组件怎么用、后端契约长什么样、哪些红线一碰就废。
> 读完它，你应该能直接改代码而不破坏约束。
>
> **和别的文档的关系**（冲突时按此优先级）：
> `docs/plan/roadmap.md` §13 红线 **>** 本文件 **>** `vue/README.md`（README 讲「怎么跑」，本文件讲「怎么改」）
> **>** 代码注释（注释解释「为什么这样写」，是很好的补充，但不覆盖上述）。
>
> ✏️ **2026-09-29：`docs/plan/*` 已冻结废弃，不要再去那里找权威。** 那些红线**约束本身仍然有效**
> （§8 就是它们的可执行转述，照 §8 做），但**文档不再维护**——`roadmap.md` 里描述的模块与端点
> （如 `jobs`）可能已经不存在了。**冲突时以代码 + 本文件为准**；§8 与代码打架了就来问，
> 别去翻冻结的 plan 找答案。
>
> **适用范围**：`vue/` 下的一切。后端**契约**看 `docs/architecture.md`、后端**怎么跑**看 `server/README.md`；跨端共享资产看 `server/src/modules/shared/domain/scene-rules.ts` 的文件头。
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

> 我需要 `vue/src/stores/makeup.js` 的**完整**内容，想确认 `brief` computed 里放字段的写法，
> 好照着加一个 `hairStyle`。麻烦把整个文件粘给我，不要摘要——摘要会漏掉我正需要的那几行。

反例（别这样）：

- ❌「把整个仓库发我」——用户发不全，你也会被淹掉。
- ❌「给我看看 store」——哪个 store？几个文件里的哪一个？
- ❌ **拿到摘要就开始写代码。** 摘要少一个字段，你写出来的就是错的——而且在这种
  **没有测试、没有 TypeScript、没有 lint** 的前端里（§2），**没有任何东西会拦住这个错**，
  它会一路滑到用户手上。

### 0.2 最可能要用到的文件（照用途索要）

| 你要做的事 | 让用户粘贴 |
| --- | --- |
| 加 / 改 brief 字段 | `vue/src/constants/options.js`、`vue/src/stores/makeup.js`、`vue/src/pages/UploadView.vue`、`vue/src/pages/ResultView.vue`、`server/src/modules/shared/domain/entities/brief.ts` |
| 加接口 | `vue/src/api/index.js`、`vue/src/api/<域>.js`、`vue/src/api/mock.js`、对应 store、后端那个 `domain/api/*.ts` |
| 加 / 改共享组件 | `vue/src/components/<X>.vue` + 调用它的页面 + `vue/src/assets/styles/{tokens,main}.css` |
| 改样式 | `vue/src/assets/styles/tokens.css`、`main.css`，以及目标页面（样式多为页内 `scoped`，见 §5.2） |
| 改动线 / 路由 | `vue/src/router/index.js`、相关页面、`vue/src/stores/user.js` |
| 场合判定相关 | `server/src/modules/shared/domain/scene-rules.ts`（**要整份**，它不长，而且一个字都不能漏——见 §6.2） |
| 核对契约 | `server/src/modules/*/domain/api/*.ts`（结果页与对话页那份是 `agent/application/agent-view.ts` 的 `AgentSessionView`）+ `docs/architecture.md` §5。✏️ 2026-09-29：`jobs/domain/api/job-view.ts` 已随模块删除 |

> 两个大文件（`AgentView.vue` 718 行、`UploadView.vue` 530 行）可以只要**相关段落**，
> 但必须说清是哪一段（「从 `<script setup>` 到 `</script>`」/「template 里 `PhotoUploader` 那一段」），
> 且**收到后先核对它是否完整覆盖了你正要用到的上下文**——不完整就再要一次，别将就。

### 0.3 粘贴来的东西怎么用

- **路径 / 行号对不上是常态。** 用户可能只粘了片段，行号会漂。本文档里的 `file:line` 只用来指路，
  **不要当成「第 138 行一定是那句」去对用户断言**。
- **代码和这份文档冲突时，以代码为准**——用户手上跑的那个才是真相。并且**在回复里明说这个冲突**：
  > 你粘的 `stores/makeup.js` 里 `skinTone` 默认是 `light`，但 AGENTS.md §8 红线 1 写的是必须 `medium`。
  > 是文档旧了，还是这里改坏了？

  **别默默按其中一边往下写。** 这类冲突往往正是用户最需要知道的事。
- **用户说「就按文档来」也不等于文档是对的。** 这份文档**描述现状**，不是需求书。
  它和代码不一致时，正确的动作是问、然后**把文档改对**，不是照着一份过期的描述改代码。

### 0.4 你也跑不了验证命令（这条很重要）

§9 要求「改完必须 `npm run dev` 实开一次」——**聊天窗口里的你做不到这件事**。
那就**别声称改好了**。

正确做法：把 §9 的清单原样交回给用户，并**逐条说清哪些是你没验的**：

> 改完了，但下面这些我**没有也无法**验证，麻烦你在本地走一遍：
> 1. `cd vue && npm run dev`，实开一次——`@scene-rules` 这类跨根引用只在 dev 暴露问题（§6.4）；
> 2. 上传页选「面试」→ 提交 → 结果页轮询到 done；**重点看 `hairStyle` 有没有出现在回显卡片里**；
> 3. 再设 `VITE_USE_MOCK=false` 连后端走一遍同样的动线。
> 我改了 `stores/makeup.js`、`UploadView.vue`、`options.js` 三个文件；`ResultView.vue` 的
> `hasEcho` 我没动——如果回显卡片整块不显示，就是这里。

**说清楚「改了哪几个文件」和「哪一处你没动但可能相关」，比说一句「已完成」有用得多。**
这个前端没有测试、没有类型检查（§2），用户是唯一的验证环节——
**你的交付物不是「代码写完了」，而是「用户知道该验什么」。**

---

## 1. 这个前端在做什么

「场合美妆镜」——上传**本人正面照** + 说清楚**要去什么场合**，AI 配一套得体妆容渲染出来。

一条主链路（4 屏）：

```
/login 登录 ──► / 首页 ──► /upload 上传(填需求简报) ──┬──► /result 结果(妆面 → 确认出图 → 前后对比)
                                                      │
                                          /cabinet 衣橱(用户自己的化妆品，独立支线)
                                          /agent   对话定妆(聊着把妆面定下来 → 确认出图)
```

✏️ **2026-09-29：`/upload` 与 `/agent` 现在是同一条路。** 上传页提交之后做的是
「开会话(带 brief)→ 传照片 → 发一句话」，也就是从 `/agent` 那条链进去的——`jobs` 那条
表单流水线已删。**全项目只剩一条出图路径**，而它**没有 mock 轨**：照片与每一句话都真的
发给后端，最后那一下「确认出图」是**全项目唯一真的会花钱**的动作（要用户点一次确认才发生）。
所以 `VITE_USE_MOCK=true` 下这条链**整个不可用**——上传页提交按钮禁用、结果页如实报错。
见 §6.3 与 §7.2。

`/upload` 收的**需求简报 brief** 是全局最有价值的数据结构——它随开会话请求**平铺**发出去
（`{ userId, ...brief }`，不是嵌一个 `brief` 键），落到会话的 `brief` 上：

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `occasion` | `interview`/`date`/`stage`/`family`/`daily` | 场合，风格主判据 |
| `sceneText` | ≤2000 字 | 自由文字需求，可**替代** occasion 作风格信号 |
| `skinType` | `dry`/`oily`/`combination`/`sensitive`/`neutral` | 肤质（持妆策略） |
| `skinTone` | `light`/`light_medium`/`medium`/`tan`/`deep` | 肤色 5 档，**缺省 `medium`** |
| `dress` | ≤80 字 | 穿搭一句话（风格 + 主色） |
| `weather` | `{condition?, temperatureC?, humidityPct?, uvIndex?}` | **整块可省**，拉不到就不带 |

**双轨运行**是最容易改坏的地方：

| 模式 | 触发 | 数据来自 |
| --- | --- | --- |
| mock（默认） | `VITE_USE_MOCK !== 'false'` | `src/api/mock.js`（浏览器内假后端，不联网）——**只剩账号与衣橱** |
| 真实 | `VITE_USE_MOCK=false` | Fastify 后端 `server/`，经 Vite 代理 `/api` → `:3000` |

★ **出图那条链是例外：它没有 mock 轨**（`api/agent.js` / `api/makeup.js`），所以 mock 模式下
**上传页与对话页都用不了**。这不是漏的，理由见 §6.3。

**两条轨必须给出同一个判定结果**——这是 `scene-rules` 单一源存在的全部理由，见 §6。

---

## 2. 技术栈与「这里没有什么」

Vue 3.5（Composition API + `<script setup>`）· Vite 8 · vue-router 5 · Pinia 4 · Axios · **无 UI 组件库**（自定义杂志感设计）

> ### ⚠️ 这里**没有**的东西（决定了你怎么验证改动）
> - **没有 TypeScript**——`.js` / `.vue`，类型契约靠注释和这份文档维持。
> - **没有测试框架**——`package.json` 里没有 test script，`vue/` 下没有一行测试。
> - **没有 ESLint / Prettier**——格式靠跟周围代码保持一致。
> - **没有 CI**。
>
> 结论：**改完没有任何自动护栏会拦住你。** 你唯一的验证手段是 §9 的手动清单，
> 而其中「`npm run dev` 实开一次」是**不可省略**的一步——见 §6 的「构建过 ≠ dev 过」。

别名（`vite.config.js`）：`@` → `src/`；`@scene-rules` → `../server/src/modules/shared/domain/scene-rules.ts`（特殊，见 §6）。

---

## 3. 分层约束（硬规矩）

```
pages/  ──►  stores/  ──►  api/  ──►  axios 或 mock
  │                                       ▲
  └───────►  components/（纯展示，谁也不碰）┘
```

六条，逐条都有理由：

1. **只有 `api/` 认识 axios。**
   页面和 store 一律不 `import axios`、不发裸请求。新增端点 = 在 `api/<域>.js` 加一个导出函数。

2. **`api/` 不吞错、不编数据。**
   错误一律 `reject`。`api/index.js` 的响应拦截器已经把后端的 `{ error: { code, message } }` 解包成
   `Error.message`，**里面的正文就是给人看的中文**（如「昵称已被占用」），直接展示即可。
   禁止 `catch` 之后返回一个假对象——那是「编造数据」，见 §8 红线。

3. **`stores/` 是跨页面状态的唯一住所。**
   只有页面内用得到的瞬时 UI 状态（如 `error`、`weatherLoading`、`sceneMsg`）才留在页面的 `ref` 里。

4. **`components/` 是纯展示组件。**
   props in / emit out / slot 出。**不 import store、不 import api、不发请求**。
   现有 5 个组件全部遵守，新加组件也照此办理。

5. **mock 分支只出现在 `api/*.js` 里。**
   页面永远不知道自己在跟谁说话。

6. **页面间传业务数据只经 store。**
   `ResultView` 靠 `store.sessionId` 拿会话 id，而不是 query / params。
   （例外：URL 语义上确实该有的东西才进 query——目前只有登录后的 `?redirect=`。）

**Pinia 写法**：全部是 setup store（`defineStore('x', () => {...})`）。
**可写状态直接改**（`store.occasion = 'date'`），只有需要多步逻辑或 async 的才包成 action。
这是现有约定（见 `pages/UploadView.vue:39`、`stores/makeup.js`），别改成「一切走 action」。

---

## 4. 目录与文件职责

```
vue/src/
├── main.js                    # createApp + pinia + router + 两份全局 css
├── App.vue                    # 只有 .app-shell + <router-view> + 页面淡入过渡
├── router/index.js            # 7 条路由 + 一条 beforeEach 登录门禁（★ 不是安全边界，见 §8）
├── api/
│   ├── index.js               # axios 实例 + 错误解包拦截器；导出 API_BASE
│   ├── use-mock.js            # ★ 只有一行环境变量判断，刻意独立成文件（见 §6）
│   ├── makeup.js              # ✏️ 2026-09-29：表单那条路的**编排层**——开会话(带 brief)+传照片+发一句；函数全转发给 agent.js
│   ├── weather.js             # GET /weather（mock 模式回离线示意值）
│   ├── users.js               # POST /users · POST /users/login
│   ├── cabinet.js             # 衣橱 CRUD 四个端点
│   ├── agent.js               # ★ 对话定妆六条端点。**唯一没有 mock 分支**的模块（见 §6.3）
│   └── mock.js                # ★ 假后端（账号 / 本地衣橱）。只准惰性引入。✏️ 2026-09-29：假任务流水线整段删了
├── stores/
│   ├── makeup.js              # 需求简报表单 + 本人照 + **会话 id**。★ 全项目最核心的 store
│   ├── user.js                # 「这次演示用的是哪个账号」——不是登录态
│   ├── cabinet.js             # 衣橱列表与增删改
│   └── agent.js               # 对话定妆：服务端视图（权威）+ 本地气泡。★ api 只能惰性引（见 §6.3）
├── constants/options.js       # 场合/肤质/肤色选项 + 中文名映射（纯展示，判定逻辑不在这里）
├── utils/color.js             # rgbToHex / rgbCss / rgbLuminance。✏️ 2026-09-29：零引用（见 §11）
├── components/                # 5 个共享组件（见 §5）
├── pages/                     # 6 个页面，每个都是「一个大文件」（196~718 行）
└── assets/styles/
    ├── tokens.css             # CSS 变量：颜色/字体/圆角/阴影
    └── main.css               # reset + 全局类（.page/.card/.btn/.caps/.tag …）
```

`pages/` 不设子目录、不为单个页面抽组件——目前每个页面自成一个 `.vue` 文件，
**页内私有**的样式与小组件就写在同一个文件里（`scoped` 样式 + 页内 `function`）。别为「整洁」把它们拆出去。

---

## 5. 共享组件与样式词汇表

### 5.1 组件契约

#### `Icon.vue` —— 图标（唯一一个被所有页面用的组件）

```
props:  name: String(必填)   size: Number|String = 20
```
`name` 取值表在文件内的 `paths` 对象里，**目前 11 个**：
`arrowLeft` `arrowRight` `camera` `upload` `check` `swap` `sparkle` `cabinet` `user` `edit` `trash`

加图标 = 往 `paths` 里加一条 `<path d="…"/>` 字符串（24×24 viewBox，`fill="none"`、描边走 `currentColor`）。
**取一个不存在的 name 不报错，静默渲染空白**——所以改 `name` 时务必回 `paths` 核对一眼。

```vue
<Icon name="upload" :size="16" />
```

#### `PhotoUploader.vue` —— 照片上传 / 预览 / 点选+拖拽

```
props:  modelValue: String = ''        预览图 URL（v-model）
        label: String = '上传照片'
        sub: String = '点击或拖拽图片'
        height: String = '220px'
emits:  update:modelValue(url)   预览 URL（objectURL）
        change(file)             真实 File ★ 提交要用的是这个
```
内部只接受 `image/*`（非图片静默丢弃）。已有预览时**会自己 revoke 旧的 objectURL**。

⚠️ **它的 `modelValue` 只是预览 URL，不是数据。** 真正的 File 必须靠 `@change` 接住：

```vue
<PhotoUploader v-model="store.portraitUrl" @change="onFacePicked" />
<!-- onFacePicked(file) 里做 store.portraitFile = file -->
```

#### `LoadingOverlay.vue` —— 全屏遮罩 loading

```
props:  text: String = '试色生成中…'
```
`position: fixed; inset: 0`，本身不含显示逻辑——**由调用方 `v-if` 控制**。
用法：`<LoadingOverlay v-if="store.submitting" text="正在提交…" />`

#### `CompareSlider.vue` —— 前后对比滑杆（结果页主角）

```
props:  defaultPos: Number = 50       初始分割位置(%)
slots:  #before   顶层（被裁切的那张，一般是原图）
        #after    底层（一般是妆容后）
```
自带鼠标 + 触摸事件、`原图/妆容` 角标、`aspect-ratio: 3/4` 容器。
槽内容建议直接放 `<img>`——内部对 `:deep(img)` 做了 `object-fit: cover`。
（✏️ 2026-09-29：原先这里举的例子是「`#after` 里放一个 `<div class="fx">` 包住 img + 色块叠加层，
见 `pages/ResultView.vue`」——**那个例子做不到了**，结果页重写后 `#after` 里只有一张 `<img>`，
叠加层靠的 `look.zones` 不在会话视图里（见 §7.2）。要做叠加层得先让服务端把 `look` 透出。）

#### `TipBanner.vue` —— 提示条

```
props:  tips: Array = []     每项形如 { text }
        title: String = 'AI 拍摄指导'
```
> ⚠️ **当前零引用**（写这份文档时查证）。要么它有主了，要么该删——`tips` 的结构也和页面里散落的
> `sceneMsg` / `weatherNote` 提示不是一回事。**动它之前先问一句**，别默默删掉。

### 5.2 样式：两条路

**① 设计令牌**（`assets/styles/tokens.css`）——颜色、字体、圆角、阴影，**一律用变量，禁止写死色值**：

```
--c-bg #f5f0e9   暖象牙背景        --c-ink #2a1e22      主文字（墨黑）
--c-surface #fffdfb 卡片           --c-ink-soft #6e5b62 次级文字
--c-surface-2 #efe8df 次级面板     --c-ink-faint #a6999e 弱化文字
--c-line / --c-line-strong        发丝线
--c-accent #b23a48 浆果红(主色)    --c-accent-deep / --c-accent-soft
--c-gold #c7a17a
--font-display 衬线标题   --font-body 正文   --font-mono
--radius-sm 6  --radius 10  --radius-full 999   --shadow-soft
```

**② 全局工具类**（`main.css`，页面里直接用，**不要重定义**）：

| 类 | 用途 |
| --- | --- |
| `.page` | 页面容器（`max-width: 440px` 居中，竖排 padding） |
| `.page-header` + `.back-btn` `.title` `.spacer` | 顶栏：返回按钮 + 标题 + 弹簧 |
| `.card` + `.card-title` `.card-sub` | 卡片 |
| `.caps` | 小号大写字母标签（`10px` + 字距），栏目 kicker 用 |
| `.btn` + `.btn-primary` `.btn-ghost` `.btn-block` | 按钮 |
| `.text-link` / `.tag` | 文字链接 / 小标签 |

> **⚠️ 不在全局的那几个（别照这张表去找）**：`.hint`（脚注）、`.text-input`、`.field-label`、
> `.field-tip`（含 `.warn`）**都不在 `main.css` 里**，而是各页面 `scoped` 样式里各有一份——
> 到 2026-09-29 为止这**四个各 3 份**（`CabinetView` / `LoginView` / `UploadView`；`.hint` 那份
> 在 `HomeView` 而不是 `UploadView`——它那边叫 `.opt-hint`，是另一个类）。
> （2026-09-16 记的是 `.hint`/`.text-input` 各 4 份，`ResultView` 重写时它自己那份没了。）
> `.spacer` 同理：全局只有 `.page-header .spacer` 一条，页面里单用的 `.spacer` 是页内自己定义的。
>
> **加新页面时不要再抄下一份**——要么先把它们提进 `main.css`（几处一起删，属小重构），
> 要么用页内自己的类名。`AgentView` 走的是后一条：它的多行输入框叫 `.draft`、脚注叫 `.foot-note`，
> 与那几份**形状相近但刻意不同名**——同名会让人以为它们是同一套控件。
> **把它们提进 `main.css` 是单独一件事，别混进功能改动里做。**

---

## 6. 双轨（mock）规则 —— 最容易改坏的地方

### 6.1 `api/use-mock.js` 为什么单独一个文件

它**只是一个环境变量判断**，但它在**首屏链**上（`router 守卫 → stores/user → api`）。
如果它住在 `mock.js` 里，那几十 KB 的假后端会被打进首屏包（实测 **+24 kB gzip**），
真实后端模式下白下载。所以：

> **任何 `api/*.js` 里的 mock 分支，必须写成 `await import('./mock')` 惰性引入。禁止静态 `import`。**
> 同理，`stores/user.js` 里 `@/api/users` 也是惰性引入的（否则 axios 被拽进首屏）。
> ★ **同一根绳子的另一头**：`stores/agent.js` 也**不许静态 `import '@/api/agent'`**——
> `stores/user.js` 会静态引 agent store 来做 `logout()` 清理，而 `user.js` 在首屏链上。
> 它照 `user.js` 引 `@/api/users` 的先例，在 `agentApi()` 里惰性引。反过来它**也不许引
> `stores/user.js`**（成环），所以 `userId` 一律由页面逐次传进去。
> ⚠️ **这条没有任何工具能查出来**（本目录零 lint、零测试）：`npm run build` 的产物里
> `index-*.js` 与 `api-*.js` 是**两个分块**（axios 不在首屏那块）就是它还活着的证据；
> 哪天它们并成一块了，就是有人写成了静态 `import`。

### 6.2 场合判定的**唯一源**

`server/src/modules/shared/domain/scene-rules.ts` 是**本项目唯一跨端共享资产**。
前端经 Vite alias `@scene-rules` **直接执行后端那个源文件**——浏览器 mock 模式与真实后端
必须给出同一个判定，各抄一份会静默漂移。

> ✏️ **2026-09-29：前端现在一处都不引它了。** 唯一的调用点是 `api/mock.js` 那条假任务流水线
> （`describeScene(brief)`），随 `jobs` 一起删了；`ENGINE_SPECS` / `TONE_MIX` 那两份**知情拷贝**
> 也一并没了。alias 与 `server.fs.allow` **都还配着**，服务端那条读 `vite.config.js` 的测试也还在
> ——**下面两条规矩照旧生效**，前端再引它的时候自动重新有用。别看到"没人引"就去删 alias。

**因此有两条硬规矩：**

1. **绝对不要在前端再抄一份关键词表 / 中文名 / 方向 / 标签。**
   历史上抄过一回，结果是一边改了另一边静默漂移——这正是这个单一源存在的理由。
   前端要中文名就取 `SCENE_RULES[label].cn`，要判定就叫 `describeScene()`。
2. **`scene-rules.ts` 里禁止任何运行时 `import` / 顶层副作用**（只允许 `import type`，编译期会被擦除）。
   往里加一句 `import fs from 'node:fs'`，前端构建会以很难懂的方式炸掉。
   `server/test/scene-rules.test.ts` 有正则扫源码钉着这条。

### 6.3 其他 mock 规矩

- ★ **`api/agent.js` 是全项目唯一没有 mock 分支的 api 模块——这是有意的，不是漏的。**
  对话的状态在服务端一个真实的 `messages[]` 上，而「确认出图」是一条**真的会花钱**的 HTTP 路由；
  在浏览器里复刻一份，复刻出来的既不是那条路由、也不检验那条循环，只会让"看起来能用"与
  "真的能用"分不清。所以 `VITE_USE_MOCK=true` 时**页面明确显示「对话功能需要真实后端」**，
  不给假对话（`AgentView.vue` 顶部那道 `isMock` 判断）。**别为了"统一"给它补一个 mock。**
- `api/mock.js` 返回的对象必须与真实 HTTP 响应的**形状逐字段一致**（`UserView` / `CosmeticItemView`）。
- 演示模式**不校验密码**——没有后端就没有 scrypt 表。它刻意不存明文密码、也不做假校验。
- 演示模式的衣橱存 `localStorage`（键 `beauty-app.mock-cabinet`），复刻「刷新后还在」的行为。
- ✏️ **2026-09-29：`api/mock.js` 只剩账号与衣橱两块。** 假任务流水线（`mockCreateJob` / `mockGetJob`
  / `STEP_AT` 时间轴 / 场合判定 / 色板 / 参考图那几组）**整段删了**——表单那条路已改走 agent 会话链，
  而那条链**刻意没有 mock**(见上一条)。
  ⚠️ 所以 `VITE_USE_MOCK=true` 时**出图那条链明确不可用**(上传页的提交按钮禁用、结果页如实报错)，
  **不再有假结果可回放**。别为了"离线也能演示"把那条假流水线加回来。

### 6.4 ⚠️ 构建过 ≠ dev 过

跨根引用（`@scene-rules` 指向 `../server/`）**只在 dev 才暴露问题**——
`vite.config.js` 里专门配了 `server.fs.allow: ['..']`（本项目根目录没有 `package.json`，
dev server 默认只放行 `vue/`）。动了 `vite.config.js` 的 alias 或 `fs.allow`，
**必须 `npm run dev` 实开一次**，`npm run build` 通过说明不了任何事。
（✏️ 2026-09-29 起前端没有活着的 `@scene-rules` 调用点，所以这条风险暂时压在"配置还在"上
——alias 一删就立刻重新成立。）

---

## 7. 后端契约

> **类型唯一真源在 `server/src/modules/*/domain/api/*.ts`。**
> 本节是给前端看的转述；两边对不上时，**以后端那个 `.ts` 为准**，并回来改这一节。

### 7.1 端点总表（全部挂 `/api`）

> ✏️ **2026-09-29：`/jobs` 那三个端点整段删掉了**（模块已删）。**出图现在只有一条路**——
> 下面 `/agent/sessions/*` 那几行。上传页(`/upload`)提交之后走的就是它，不再有"表单流水线"。

| 方法 & 路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /weather` | `?city=北京` 或 `?lat=&lon=` | **200** `WeatherView` |
| `POST /users` | `{ nickname, password }` | **201** `UserView` |
| `POST /users/login` | `{ nickname, password }` | **200** `UserView`；不符 **401** |
| `GET /users/:id` | — | **200** `UserView` |
| `POST /cabinet/items` | `{ userId, name, attributes? }` | **201** `CosmeticItemView` |
| `GET /cabinet/items?userId=` | — | **200** `{ items: [...] }` |
| `PATCH /cabinet/items/:id` | `{ userId, name?, attributes? }`（二者至少给一个） | **200** `CosmeticItemView` |
| `DELETE /cabinet/items/:id?userId=` | — | **204** 无响应体 |
| `POST /agent/sessions` | `{ userId, occasion?, sceneText?, skinType?, skinTone?, dress?, weather? }` —— ✏️ 2026-09-29 起**可以随请求带一份初始 brief**（表单提交那条路要用）。★ **简报字段是平铺的，不是嵌一个 `brief` 键**（服务端把 `shared` 的 `briefFields` 展开，`weather` 是它自己的可选成员），多一个键就 422。不带 brief 的调用与新增之前逐字相同 | **201** `AgentSessionView`（新会话里**一条消息都没有**）。★ 用户不存在 → **404**（服务端 2026-09-16 起校验），`stores/agent.js` 不特判、如实报错——它意味着**这台浏览器存着的登录在服务端已查无此人** |
| `GET /agent/sessions/:id?userId=` | — | **200** `AgentSessionView`；会话不在 / 不属于你 → **404**（不区分，免得能被枚举） |
| `POST /agent/sessions/:id/messages` | `{ userId, text }`（≤1000 字） | **200** `AgentTurnView`（含 `stopReason` + `events`） |
| `POST /agent/sessions/:id/photo` | multipart：`face`(1 张，字段名就是 `face`)、`userId` | **200** `AgentSessionView` |
| `POST /agent/sessions/:id/render` | `{ userId }` | **200** `AgentTurnView`；★ **全项目唯一真的会花钱的端点**。✏️ 2026-09-16 起它有**两个入口**（模型提的 `pendingRender` / 界面自己摆的 `renderOffer`），**前端不必区分**，请求体逐字相同。**422** 有四个真实原因：①没有妆面 ②没有照片 ③上一轮欠着的**不是**出图请求 ④✏️同一个会话**正在出图**时又点了一次（服务端的进程内锁）|
| `GET /agent/sessions/:id/renders/:seq?userId=` | — | **200** 图片字节流（`renders[].url` 指向它） |
| `GET /health` | — | **200** `{ ok, name, uptimeSec, now }` |

### 7.2 DTO 形状（JS 视角）

```js
// ✏️ 2026-09-29：`JobView` 与 `look` 两块随 `jobs` 一起删掉了。
//   结果页现在读的是下面那份 `AgentSessionView`。⚠️ 它**没有** `look.zones`/`look.palette`
//   ——所以「本人照片 + 色块叠加」的模拟上妆预览**今天做不出来**（要它回来，得先让服务端
//   把 `look` 透出到会话视图，见 `server/src/modules/makeup/domain/entities/look.ts` 文件头）。

// UserView（★ 永不含密码/凭据）        { id, nickname, createdAt }
// CosmeticItemView                    { id, userId, name, attributes:[{label,value}], createdAt, updatedAt? }
// WeatherView                         { condition?, temperatureC?, humidityPct?, uvIndex?, place?, source }

// AgentSessionView —— 开会话 / 取会话 / 传照片都回这一个（对话页那一屏的权威状态）
{
  sessionId, userId,
  brief: { sceneText?, occasion?, skinType?, skinTone?, dress?, weather? },
  lookSpec?, lookDescription?,          // 妆面单 + describeLook() 那句人话 ★ 原样展示，别自己再拼
  hasFace: false,                       // ★ 只给布尔：不给路径、不给字节
  renders: [{ seq, url, lookDescription, createdAt }],   // url 形如 '/agent/sessions/<id>/renders/<seq>'
  consultedProducts: [{ id, name, categoryLabel }],   // ★ 恒在的数组（空就是 []）；模型读过资料的产品，按首次读到的顺序
  pendingRender?: { toolUseId, summary },// ★ 有动作在等你点确认时才有（summary 同上，原样展示）
  renderOffer?: {                        // ✏️ 2026-09-16 新增：界面自己摆的那条出图消息
    summary,                             //   妆面+照片齐、没有待确认时才出现；summary 同上，原样展示
    left: number | null,                 //   还能出几张 ★ null = 不限量（AGENT_MAX_RENDERS=0），别和 0 混
    max: number,                         //   上限（0 = 不限量）
    alreadyRendered: boolean             //   最后出的那套就是当前这套 ⇒ 按钮改口叫「再生成一张」
  },
  createdAt, updatedAt
}
// ★ pendingRender 与 renderOffer **互斥**（服务端保证）：页面上的出图入口只该有一个。
//   两个按钮指向同一次花钱的话，其中一个必然 422。

// AgentTurnView = 上面那一份 + 本轮这两项（只有 /messages 与 /render 回它，GET 会话**不回**）
{
  ...AgentSessionView,
  stopReason: 'end_turn'|'awaiting_confirmation'|'max_iterations'|'max_tokens'|'refusal'|'llm_unavailable'|'timeout',
  events: [{ type:'text_delta', text }
         | { type:'tool_start', toolUseId, name }
         | { type:'tool_end', toolUseId, name, isError }
         | { type:'tool_pending', toolUseId, name, summary }
         | { type:'turn_end', reason, iterations }]
}
```

**对话契约里前端必须记住的几条：**

- ★ **`stopReason` 里只有 `awaiting_confirmation` 是"轮到你了"**，其余六种**都是收束，不是错误**：
  服务端已经往历史里补了一句人话，那句会**作为助手正文**出现在 `events` 的 `text_delta` 里。
  **不要再叠一个红色报错**——那是同一件事说两遍。只有**网络 / HTTP 层失败**才该显示错误行。
  ★ **六种全都补，一个例外都没有**（`refusal` 也从 2026-09-16 起补了：只在模型一个字都没给时补，
  它自己解释了为什么拒答就不补——那句话就是回答）。**前端不许再自己兜一句**：
  先前那段 `closingNote` 已删除，留着的话服务端补完前端再补，就是**同一件事说两遍**。
- ★ **一轮的 `events[]` 是一次性给的**（还不是 SSE）。`text_delta` 每轮**只有一条、内容是整段**；
  `tool_start` / `tool_end` 拿到时**早就跑完了**。**别把它们演成"正在进行"**——那是假进度。
- ★ **确认出图是一条独立路由**（`POST …/render`），而**它在屏幕上表现为对话里的一条消息**。
  ✏️ 2026-09-16 起那条消息**由界面按状态自己摆**（`renderOffer`，不是模型说的话），
  用户**点一下就出图**——所以它**不是** assistant 气泡，样式上必须一眼看得出是界面自己的话
  （见 §11 第一条）。
- ★ **这条路不传任何出图参数**：要出的就是屏幕上那一套，那一套已经在会话里了。
  **422** 有三个原因（缺妆面 / 缺照片 / 上一轮欠着的不是出图请求）**外加并发连点**（✏️ 服务端锁），
  message 本身就是人话 → 重新 `GET` 一次会话视图即可（**不按 code 分支**，见 §7.3）。
- ★ **待确认时用户发任何一句话，那一轮会被按 `declined` 自动了结**。所以「先不出图」的规矩还在
  （不发那条请求就什么都没发生），只是 ✏️ **实现变了**：以前靠 `stores/agent.js` 的 `DECLINE_TEXT`
  专门发一条消息，现在界面上**根本没有「先不出图」这个按钮**——用户继续说自己想说的，那条欠账
  自己就按 `declined` 了结。（`DECLINE_TEXT` 与 `declineRender` 已随之删除。）
  ⚠️ **那条消息不许藏起来**：藏起来的话服务端那条欠账还挂着，刷新后它会**又冒出来**。
- ★ **刷新恢复的只有服务端有的那部分**（妆面 / 有没有照片 / 已出的图 / 待确认那条或界面摆的那条 / 参考过的产品）。
  **聊天原文服务端刻意不给**（不透出 `messages[]`）⇒ **不回放、也别偷着塞 localStorage**（§8）。页面要**如实说**。
- ★ **`consultedProducts` 是"读过"的集合，不是"推荐了"的清单。** 模型可能读了 6 条只推 2 条，
  所以页面上的措辞只能是「**这次参考了**这几支」，**不能说成"为你推荐了这几支"**——那是替模型说话。
  ★ **角标「品牌参考」由前端写死，不由模型生成**（红线 §8-5）：模型那次怎么措辞不能决定它出不出现。
  **只有真收了钱才该写「赞助」**——少标一个字只是不够显眼，多标一个字是**虚假披露**。
- ★★ **这块是"用户开口了才有"的：卡里出现东西，就说明用户这一轮问了产品（或答应了模型那一句）。**
  产品推荐**不是妆容做完的收尾动作**——触发条件钉在提示词和两个工具的描述里（后端 `v4`）。
  所以**用户没开口时这块不该出现**，前端**也不许**为了"内容更饱满"去引导用户问、
  或者在 `consultedProducts` 为空时补一句推荐文案（那就是 §8-5 说的「硬贴」）。
  ⚠️ 注意"模型问一句要不要推荐"是**允许**的（后端明确可以挑话头），
  但那句话是**气泡里的正文**，**不是这块卡片**——**问 ≠ 读**，卡片只跟"读过"走。
- ★ **这几条请求必须单独给 `timeout`（`api/agent.js` 的 `AGENT_TIMEOUT_MS`，90 秒 > 实例缺省的 30 秒）**：
  服务端单轮墙钟预算是 60 秒，而**掐掉 `render` 请求退不了钱**——图已经出了，前端却只能报"失败"。
  宁可多等，不可错报。
- `renders[].url` 是**路径式**的，要补 `API_BASE` **再补 `?userId=`**（取图靠查询串判归属）——
  用 `api/agent.js` 的 `renderImageHref()`，别自己拼。
- **`VITE_USE_MOCK=true` 时这条链路整个不可用**（它是唯一没有 mock 分支的模块）。页面要**明确说**，
  不给假对话。理由写在 `api/agent.js` 文件头。

**几个前端必须记住的细节：**

- ✏️ **2026-09-29：没有 `resultUrl` 了，只有 `renders[].url`。** 成品图一律经
  `renderImageHref(url, userId)`（`api/makeup.js` 转出，实现在 `api/agent.js`）——它补
  `API_BASE` **再补 `?userId=`**（取图靠查询串判归属），别自己拼。
  结果页的「前后对比」= 本人照片(`store.portraitUrl`) vs `renders` 里最后一张。
- **`WeatherView` 只有 4 个字段能进 `brief.weather`**：`condition`/`temperatureC`/`humidityPct`/`uvIndex`。
  `place` 和 `source` 是**回显元信息，不进 meta**——后端 weather schema 是 `.strict()`，多一个键就 422。
  `source` 要**原样透传给 UI**（`'open-meteo'` = 实时 / `'mock'` = 离线示意），别在前端猜来源。
- **`meta` 只放有值的字段**。`stores/makeup.js` 的 `brief` computed 已经这么做了（空字符串不塞、天气全空就整块省掉）。
  省掉 `weather` 是**合法契约**，不是绕过。
- `attributes` 最多 12 条、标签去重；名称 ≤40 字；单用户衣橱上限 100 件。

### 7.3 错误体与错误码

统一 `{ error: { code, message, details? } }`。`api/index.js` 已把它解包成 `Error.message`（取里层 `message`）。

| 错误码 | HTTP | 前端该怎么办 |
| --- | --- | --- |
| `LOCATION_REQUIRED` / `CITY_NOT_FOUND` | 422 / 404 | 天气**失败说明**，不阻塞提交 |
| `WEATHER_UNAVAILABLE` | 502 | 同上——`clearWeather()` 后整块省掉，**没有手动预设可回落** |
| `USER_NOT_FOUND` | 404 | 账号没了（开会话时也回它——**这台浏览器存着的登录在服务端查无此人**） |
| `SESSION_NOT_FOUND` | 404 | 会话不在 / **不属于你**（共用，别去区分）。回上传页重开 |
| `RENDER_NOT_FOUND` | 404 | 会话是我的，但我没有这个序号的图 |
| `CABINET_ITEM_NOT_FOUND` | 404 | 「不存在」与「不属于你」**共用**，别去区分 |
| `CABINET_FULL` | 409 | 衣橱满了 |
| `NICKNAME_TAKEN` | 409 | 昵称占用 |
| `INVALID_CREDENTIALS` | 401 | 昵称或密码错，**不泄露账号是否存在** |
| `VALIDATION_ERROR` | 422 | 请求体非法 / 枚举越界 / 多给了一个键（`.strict()`） |
| `INTERNAL_ERROR` | 500 | 引擎输出不过关等 |

> ✏️ 2026-09-29：删掉了 `JOB_NOT_FOUND` / `JOB_NOT_READY` / `JOB_FAILED` / `FACE_REQUIRED` /
> `CONTEXT_REQUIRED` / `SCENES_MAX_EXCEEDED` 六行——**服务端连同它们一起删了**（抛出点全在
> `jobs` 里，留着的是"一份还带 HTTP 状态码的空声明"）。
> ★ `POST …/render` 的 **422 不是靠 code 认的**：它那几个真实原因（没妆面 / 没照片 /
> 上一轮欠着的不是出图请求 / 并发连点）**共用 `VALIDATION_ERROR`**，message 本身就是人话
> ⇒ 重新 `GET` 一次会话视图即可（正是下面那条规矩的用法）。

**前端不按 code 分支**。现有代码一律只展示 `message`——后端给的 message 已经是准确的中文。
除非你要做**特定 code 的特殊动线**（目前没有），否则别引入 code→文案的映射表，那会和后端文案漂移。

### 7.4 联调

```bash
cd vue && npm run dev          # :5173，/api 已代理到 :3000
# 另一个终端：cd server && npm run dev
```
前端默认 mock（`VITE_USE_MOCK` 未设为 `false`），**不创建 `.env` 也能跑通全流程**。

---

## 8. 红线（前端视角：代码里不能出现什么）

> 上游是 `docs/plan/roadmap.md` §13。这里只做**可执行的转述**——每条都告诉你代码里长什么样。
> ✏️ 2026-09-29：那份 plan **已冻结**（见文件头），**这一节才是你要照着做的那份**。

1. **不默认浅肤色审美。**
   `stores/makeup.js` 的 `skinTone` 默认 `medium`——**不许改成 `light`**，不许出现 `skinTone || 'light'` 这种兜底。
   色卡 `SKIN_TONE_OPTIONS[].swatch` 是真实肤底色，不许调成「更白更好看」。
   文案里**不出现「显白」**——用户写了也不迎合（后端有测试钉着这条）。

2. **密码只在请求体里出现一次。**
   不进 store、不进 `localStorage`、不进日志、不进 URL。
   `stores/user.js` 只持久化 `{ id, nickname }` 两个公开字段（键 `beauty-app.user`），多出来的键一律丢弃。
   `api/users.js` 拿到 `UserView` 后**没有任何凭证可存**——后端不签发 token、不建会话。

3. **照片即用即删，身份边界就是现场照片的边界。**
   `logout()` **必须**同时调 `useMakeupStore().reset()` 与 `useAgentStore().reset()`——不靠人记得手动清。
   （对话那边更要紧：agent store 里的 `sessionId` 指向服务端一份**存着本人照片**的会话，
   它还被写进 `localStorage`（刷新后接回用，键 `beauty-app.agent-session`，只是个不透明 id）。
   ★ **那条 id 是唯一允许落盘的对话痕迹，会话内容一律不许落盘**——见下面第 7 条。）
   任何 `URL.createObjectURL()` 都要有对应的 `revokeObjectURL()`（`stores/makeup.js` 的 `revoke()` 已封装，
   加新的预览 URL 时记得接上；`reset()` 里也要收。`stores/agent.js` 的 `facePreviewUrl` 就是照它做的）。

4. **天气不编造。**
   拉不到就**整个省掉 `weather`**，不许有「手动预设天气」的回落路（曾经有过，已删）。
   mock 模式回的那份样例值**必须带 `source: 'mock'`**，且 UI 要标「离线示意——不是实况」。

5. **商业内容可辨认、不搬运。**
   对话页的「参考产品卡」（`AgentView.vue`，2026-09-16 落地）**角标文案由前端写死**——
   `「品牌参考」`，模型什么时候推、怎么推都不影响它出不出现。
   **空着也比硬贴强**：`consultedProducts` 为空时整块不渲染，不显示一个空标题。
   ⚠️ **只有真收了钱才写「赞助」**：少标一个字只是不够显眼，**多标一个字是虚假披露**。
   资料里那句「社交平台用户反馈摘要」**摘自品牌资料，不是我们采集的口碑**——
   转述时必须说清出处，**不许讲成用户口碑或中立评测**（后端系统提示规则 7 钉着这条）。
   外部教程入口只做**外链**，不搬运、不内嵌第三方图文视频、不抓图。

6. **登录门禁不是安全边界。**
   `router/index.js` 的 `beforeEach` 只看本地那份 `{ id, nickname }`，**拦不住也不该假装能拦住谁**。
   真正的把关是后端的归属校验（改/删不认别人）。**别把这段代码写成「安全」的样子**，
   更别基于它做任何「用户只能看到自己的数据」的假设。

7. **对话内容不落盘，也不假装有记录。**
   会话内容——用户说了什么、照片、成品图——**一律不进 `localStorage`/`sessionStorage`/IndexedDB**
   （设计文档 §9 已拍板「会话内容存服务端，不是浏览器 localStorage」）。唯一允许落盘的是一条
   **不透明的会话 id**（`beauty-app.agent-session`，服务端还要 `userId` 才认它），`reset()` 时收掉。
   ★ 刷新之后**聊天原文就是没有的**（服务端刻意不透出 `messages[]`，要什么给什么）——
   页面**要如实说**「聊天原文没有回放」，**不许**用假记录、假开场白或"正在恢复…"把它糊过去，
   也**不许**为了"体验好一点"把它缓存进浏览器（那就是上面那条禁令）。

---

## 9. 改动的验证清单

> **⚠️ 你跑不了这些命令（在聊天窗口里工作）？** 见 **§0.4**——**不要声称已验证**，
> 把下面的清单原样交给用户，并说清你改了哪几个文件、哪一处没动但可能相关。

### 通用（每次都要）

```bash
cd vue && npm run dev     # ★ 必须实开。构建过 ≠ dev 过（见 §6.4）
```
然后手走一遍受影响的动线。mock 模式走一遍，**`VITE_USE_MOCK=false` 再走一遍**（涉及接口改动时）。

### 「加 / 改一个 brief 字段」——牵动的地方比你想的多

以加一个字段 `xxx` 为例，**一处都不能漏**：

1. `server/src/modules/shared/domain/entities/brief.ts` —— 接口 + 枚举常量（**枚举单源**）
2. `server/.../shared/domain/schemas/contracts/brief-fields.ts` —— zod 形状（`.strict()`，多键会 422）
   ★ 它是 `POST /agent/sessions`（开会话带初值）与 `patch_brief`（对话里改）**共用的那一份**；
   规则在 `shared/domain/validators/brief-fields.validator.ts`（枚举白名单 / 长度上限 / trim）。
   改完跑 `server/test/schemas.test.ts`——它钉着「两条入口给同一个答案」。
   ✏️ 2026-09-29：这两格此前写的是 `jobs` 的 `job-submit.ts` / validator，那个模块已删。
3. `server/.../makeup/...mock-engine` —— 若它影响文案或调色
4. `vue/src/constants/options.js` —— 加选项 + 中文名映射（**纯展示，无编译期保护，最容易漏**）
5. `vue/src/stores/makeup.js` —— 状态 `ref` + `brief` computed 里的条件放入 + `reset()` 清空
6. `vue/src/pages/UploadView.vue` —— 表单控件
7. `vue/src/pages/ResultView.vue` —— 回显（`hasEcho` 也要加）
8. ✏️ ~~`vue/src/api/mock.js` —— 假后端要认这个字段~~：**这一格没了**。假任务流水线已删，
   而 agent 那条链刻意没有 mock（§6.3）——**加字段不会再牵动 `mock.js`**。

> 枚举类改动（加场合 / 肤质 / 肤色档）另有两条硬要求：
> `brief.ts` 的 `OCCASIONS` 与 `scene-rules.ts` 的 `SCENE_RULES`/`SCENE_MATCH_ORDER` 都要加
> （`Record<Occasion, …>` 漏配会**编译不过**，这是保护），前端 `constants/options.js` 也要跟着加（**无保护**）。

### 「参考产品卡」这一块（`AgentView.vue`，2026-09-16 落地）

**没有自动化测试，只能手工走。** 前提是服务端**配了产品库**（`PRODUCTS_DIR` 指到 `products/ysl-property`
或它的上级目录），且 `AGENT_LLM=real`（mock 那段脚本**不会**调 `list_products`）。

1. ★★ **先验「用户没答应之前不读库」。** 走完「需求 → 妆面」，让模型把妆定下来、
   继续调一两轮妆。**它主动问一句「要不要给你挑两支」是允许的**（可以挑话头），
   但只要你**没答应** → **卡片不该出现**，正文里也不该冒出品牌产品名。
   这是最容易退化的地方：模型会想"读了不一定推，先备着总没错"。
2. **然后**答应它、或自己问一句（如「那我该买什么？」）→ 模型调 `list_products` /
   `read_product` → **妆面卡下方出现「这次参考了」卡**，角标写「品牌参考」。
3. **列表里每个名字都是库里真有的**（对照 `products/ysl-property/` 下的文件名/id）——
   出现库里没有的产品就是模型在编，**要报**（后端系统提示规则 7 管这个）。
4. **模型读了但没推的那几支也该在卡里**（卡是"读过"的超集）——这是**预期行为**，不是 bug。
5. **没问产品的那一轮，这块不出现**（空清单不渲染，§8-5）。
6. 刷新页面 → 卡片**还在**（`consultedProducts` 随会话视图回来）。
7. ★ 把 `PRODUCTS_DIR` 指向一个不存在的路径重启服务 → 卡片**永远不出现**，其余动线一点不变。

### 「出图那条消息」这一块（`AgentView.vue`，✏️ 2026-09-16 落地）

**没有自动化测试，只能手工走。** `AGENT_LLM=mock` + `MAKEUP_ENGINE=mock`（不联网、不花钱），
`vue` 与 `server` 各 `npm run dev`。★ 这一块的**关键在②**：它验的正是"模型一句话都不说，用户也能出图"。

1. 走完「需求 → 妆面 → 传照片」，**盯住对话末尾**：妆面与照片齐了就该出现一条
   **长得不像 assistant 气泡**的消息（左侧竖线 + 淡底），带「确认生成」按钮，文案里有
   费用与时长、以及"还能出 N 张"。
2. ★★ **验"不靠模型"**：整个过程中**模型一次工具都没调**（mock 脚本本来也不会在
   用户没明说时调 `render_look`）——这条消息**照样在**。这就是这次改动要的东西，
   以前唯一的入口是"模型提议 → 确认框"，模型不开口就没有路。
3. 点它 → 图上**显示在对话里**、`seq` 正确；等的那几秒按钮禁用、输入框禁用。
4. 出完 → 按钮**改口叫「再生成一张」**（同一个妆面又出一次），那条消息**不消失**。
5. **连点两次**（趁第一下还没回来）→ 只出一张（前端 `waiting` 挡住；就算绕过去，服务端还有锁）。
6. 改动妆面（让它换唇色之类）→ 那条消息里的妆面描述跟着更新，按钮**回到「确认生成」**。
7. `AGENT_MAX_RENDERS=1` 重启服务 → 出一张后**按钮消失**，只剩一行"用完了、新开一段对话"的说明。
   再 `AGENT_MAX_RENDERS=0` → `left` 是 `null`、文案说"不限量"（★ **别把不限量显示成 0 次**）。
8. 刷新页面 → 已出的图还在（页面另起一格「已出的图」），那条出图消息**也还在**
   （它来自会话视图）；**聊天原文照旧不回放**，页面如实说。
9. ★ **模型真的提了出图请求时**（mock 脚本里有这条路）→ 屏幕上**只有那一条**，
   不会两条并排（`pendingRender` 与 `renderOffer` 互斥）；用户继续说别的 → 那条**自己消失**，
   且**不刷新也消失**（服务端已按 `declined` 了结）。

### 其他

| 改动 | 牵动 |
| --- | --- |
| 加一个接口 | `api/<域>.js` 加函数（含 mock 分支，**惰性 import**）→ `api/mock.js` 补同形状假实现 → store 里包一层 → 页面调用 |
| ★ 那条链**在浏览器里复刻不了**（要服务端真实状态 / 会花钱） | **不要**给它加 mock 分支，改成页面明确说「不可用」——`api/agent.js` 是先例（见 §6.3） |
| 加一个页面 | `pages/XxxView.vue` → `router/index.js` 加路由 → 需要门禁就别加 `meta.public`。★ 页面**可以**静态引 `api/*` 的纯函数（`ResultView` / `AgentView` 都引 `renderImageHref`、后者还引 `MAX_AGENT_TEXT`）——**store 不行**（见 §6.1） |
| 加一个 store | 放 `stores/`；`reset()` 要把自己那份收干净（含 objectURL 与 localStorage）并接进 `user.js` 的 `logout()`。★ 一旦 `stores/user.js` 要引它，**它就不能静态引 `api/*`**（首屏链，见 §6.1） |
| 加一个图标 | `Icon.vue` 的 `paths`（24×24，`currentColor`） |
| 动 `vite.config.js` | **必须 `npm run dev`**（alias / `fs.allow` 只在 dev 暴露问题） |
| 动 `scene-rules.ts` | **= 同时改前后端行为**。改完 `cd server && npm test`，且前端 dev 实开 |
| 加一个会话视图字段（如 `consultedProducts`） | 服务端：实体 → `turn-view.mapper.ts` 的 `toSessionView` → 端口/工具按需。前端：`stores/agent.js` 加一个 computed（照 `renders` 恒在数组的写法）→ 页面取用。★ **视图没有 zod schema**，所以前端多读一个不存在的键只会静默拿到 `undefined`——**没有编译期保护，只能手工看** |
| 加组件 | 放 `components/`，props/emit/slot 契约更新进 §5.1；**不 import store / api** |

---

## 10. 命令

```bash
cd vue
npm install
npm run dev        # 开发 :5173（mock 默认开）
npm run build      # 生产构建（⚠️ 通过不代表 dev 能跑）
npm run preview    # 预览构建产物
```

```bash
cd server
npm run dev        # 后端 :3000
npm test           # ★ 前端改到 scene-rules 或契约时，跑这个
npm run typecheck
```

---

## 11. 已知状态（别当成 bug 去「顺手修」）

- ★★ **出图那条消息是界面自己摆的，不是模型说的话**（✏️ 2026-09-16）。
  妆面与照片齐、没有待确认时，服务端给 `renderOffer`，页面**自己**在对话末尾摆出那条消息 +
  「确认生成」按钮——**模型说不说话都一样**。以前只有"模型提议 → 确认框"一条链，
  而"提不提议"是提示词级的事：2026-09-16 实测真实模型在用户**两轮明确要图**时一次都没调
  `render_look`，界面上**既没有图、也没有确认框**，唯一的入口断了。
  ⚠️ 因此：**不要**把它画成 assistant 气泡（那是让界面替模型发言），
  **不要**去动提示词想让它"记得提议"（改过四轮了，`SYSTEM_PROMPT_VERSION` 仍是 `v11`），
  **不要**加第二个出图入口（两个按钮指向同一次花钱，一个必然 422）。
  代价与残余风险记在 `server/src/modules/agent/README.md`「人在回路」一节：
  一次点击就花钱（所以费用与时长必须写在按钮上）、服务端进程内锁只挡并发、
  **响应丢在回程时用户再点一次会真的再出一张**（那要幂等键，而这条路由刻意不收客户端参数）。
- **`TipBanner.vue` 零引用**（见 §5.1）。
- **`.hint` / `.text-input` / `.field-label` / `.field-tip` 各页面各一份，目前各 3 份**（见 §5.2）。
- ✏️ **`utils/color.js` 现在零引用**（2026-09-29 查证）。它服务的「本人照片 + 色块叠加」预览随
  `jobs` 一起没了，而结果页重写后不再需要 `rgbCss` / `rgbLuminance`。**先别删**——叠加层要回来
  （见 §5.1 `CompareSlider`）就得用它。这是**已知的零消费者文件**，不是漏收拾的。
- ★ **前端零测试基建**：`package.json` 里没有 vitest，全仓没有一个前端测试文件。
  所以**任何一个页面（含 `/agent`）的回归只有「手工走一遍」这一条路**——
  改动前后别声称"测过了"。这不是这次的欠债，是本目录一直的状态；**要建它是单独一件事**。
- **`AGENT_TIMEOUT_MS`（`api/agent.js`）与后端的 `DEFAULT_TURN_TIMEOUT_MS` 是一对**，要一起改。
  理由：掐掉一条**已经花了钱**的 `render` 请求退不了钱，所以客户端超时必须**严格大于**服务端最坏情况。
- **`stores/agent.js` 的 `PHOTO_BUBBLE_TEXT` 是服务端 `agent/domain/tools/observations.ts` 里那个常量的副本**，
  两侧**必须逐字一致**（服务端那份有测试钉着，前端这份**没有任何东西拦着**）。改一边要同时改另一边。
- **`/agent` 一轮的 `events[]` 是一次性返回的（服务端还没上 SSE）**，
  所以那一屏只显示"正在想"，**不演工具进度**——想让它变真，先做 SSE，别在前端假播。
- **`renders[].url` 要带 `?userId=` 才能取到图** ⇒ 那个 URL 会进浏览器历史与缓存。
  已知、可接受（`GET` 不指望请求体），但**别把它当成"服务端会替你保密"**。
- **结果页轮询是 650ms 固定间隔**（`ResultView.vue`）。超时用的是 `api/agent.js` 的
  `AGENT_TIMEOUT_MS`（**90 秒**，不是实例缺省的 30 秒）——`fetchMakeupSession` 转发的就是
  `fetchAgentSession`。★ 别把这条看小了：掐掉一条**已经花了钱**的 `render` 请求退不了钱。
- ✏️ 2026-09-29：删掉两条已失效的——`api/mock.js` 的色板拷贝（那份 `ENGINE_SPECS` 随假流水线删了）、
  以及 `references` 图片素材的合规来源那条（模块已删）。
