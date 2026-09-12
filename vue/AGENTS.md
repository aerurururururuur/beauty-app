# vue/ 前端协作契约（给 AI 与新接手的人）

> **这份文件是什么**：`vue/` 的**实现契约**——分层怎么切、共享组件怎么用、后端契约长什么样、哪些红线一碰就废。
> 读完它，你应该能直接改代码而不破坏约束。
>
> **和别的文档的关系**（冲突时按此优先级）：
> `docs/plan/roadmap.md` §13 红线 **>** 本文件 **>** `vue/README.md`（README 讲「怎么跑」，本文件讲「怎么改」）
> **>** 代码注释（注释解释「为什么这样写」，是很好的补充，但不覆盖上述）。
>
> **适用范围**：`vue/` 下的一切。后端的事看 `server/README.md`；跨端共享资产看 `server/src/modules/shared/domain/scene-rules.ts` 的文件头。
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
| 核对契约 | `server/src/modules/jobs/domain/api/job-view.ts` 等 `domain/api/*.ts` + `server/README.md` |

> 两个大文件（`ResultView.vue` 622 行、`UploadView.vue` 630 行）可以只要**相关段落**，
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
/login 登录 ──► / 首页 ──► /upload 上传(填需求简报) ──► /result 结果(进度→前后对比)
                                                              ▲
                                          /cabinet 衣橱(用户自己的化妆品，独立支线)
```

`/upload` 收的**需求简报 brief** 是全局最有价值的数据结构，它直接等于提交给后端的 `meta`：

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
| mock（默认） | `VITE_USE_MOCK !== 'false'` | `src/api/mock.js`（浏览器内假后端，不联网） |
| 真实 | `VITE_USE_MOCK=false` | Fastify 后端 `server/`，经 Vite 代理 `/api` → `:3000` |

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
   `ResultView` 靠 `store.jobId` 拿任务 id，而不是 query / params。
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
├── router/index.js            # 6 条路由 + 一条 beforeEach 登录门禁（★ 不是安全边界，见 §8）
├── api/
│   ├── index.js               # axios 实例 + 错误解包拦截器；导出 API_BASE
│   ├── use-mock.js            # ★ 只有一行环境变量判断，刻意独立成文件（见 §6）
│   ├── makeup.js              # POST /jobs · GET /jobs/:id · resultImageHref()
│   ├── weather.js             # GET /weather（mock 模式回离线示意值）
│   ├── users.js               # POST /users · POST /users/login
│   ├── cabinet.js             # 衣橱 CRUD 四个端点
│   └── mock.js                # ★ 整个假后端（判定/调色/假流水线/本地衣橱）。只准惰性引入
├── stores/
│   ├── makeup.js              # 需求简报表单 + 本人照 + 任务 id。★ 全项目最核心的 store
│   ├── user.js                # 「这次演示用的是哪个账号」——不是登录态
│   └── cabinet.js             # 衣橱列表与增删改
├── constants/options.js       # 场合/肤质/肤色选项 + 中文名映射（纯展示，判定逻辑不在这里）
├── utils/color.js             # rgbToHex / rgbCss / rgbLuminance
├── components/                # 5 个共享组件（见 §5）
├── pages/                     # 5 个页面，每个都是「一个大文件」（196~630 行）
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
（`#after` 槽里可以放一个 `<div class="fx">` 包住 img + 若干叠加层，见 `pages/ResultView.vue:187`。）

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
| `.text-link` / `.tag` / `.hint` | 文字链接 / 小标签 / 脚注 |
| `.spacer` | flex 弹簧（把后面的元素推到右边） |

> **⚠️ 已知重复（待办，不是禁令）**：`.text-input`、`.field-label`、`.field-tip`（含 `.warn`）
> 在 `LoginView` / `UploadView` / `CabinetView` **各抄了一份**（共 3 份）。
> **加新页面时不要再抄第 4 份**——要么先把它们提进 `main.css`（三处一起删，属小重构），
> 要么直接复用现有页面的写法并将就。`.hint` 同样在 3 个文件里各有一份。

---

## 6. 双轨（mock）规则 —— 最容易改坏的地方

### 6.1 `api/use-mock.js` 为什么单独一个文件

它**只是一个环境变量判断**，但它在**首屏链**上（`router 守卫 → stores/user → api`）。
如果它住在 `mock.js` 里，那几十 KB 的假后端会被打进首屏包（实测 **+24 kB gzip**），
真实后端模式下白下载。所以：

> **任何 `api/*.js` 里的 mock 分支，必须写成 `await import('./mock')` 惰性引入。禁止静态 `import`。**
> 同理，`stores/user.js` 里 `@/api/users` 也是惰性引入的（否则 axios 被拽进首屏）。

### 6.2 场合判定的**唯一源**

`server/src/modules/shared/domain/scene-rules.ts` 是**本项目唯一跨端共享资产**。
前端经 Vite alias `@scene-rules` **直接执行后端那个源文件**——`api/mock.js` 调的 `describeScene(brief)`
和后端 `run-pipeline` 调的是**同一个函数**。

**因此有两条硬规矩：**

1. **绝对不要在前端再抄一份关键词表 / 中文名 / 方向 / 标签。**
   历史上抄过一回，结果是一边改了另一边静默漂移——这正是这个单一源存在的理由。
   前端要中文名就取 `SCENE_RULES[label].cn`，要判定就叫 `describeScene()`。
2. **`scene-rules.ts` 里禁止任何运行时 `import` / 顶层副作用**（只允许 `import type`，编译期会被擦除）。
   往里加一句 `import fs from 'node:fs'`，前端构建会以很难懂的方式炸掉。
   `server/test/scene-rules.test.ts` 有正则扫源码钉着这条。

**已知情的拷贝**：`api/mock.js` 里的 `ENGINE_SPECS`（场合→色板）与 `TONE_MIX`（肤色档→明暗校正）
仍是后端 `MockEngine` 色板的拷贝。**这是刻意的**——色板是**上妆引擎的实现细节**，不是场合语义，
搬进 `scene-rules.ts` 会让 shared 里躺一份「将来换真引擎就没人用」的死数据。
正确的清理时机是接真实引擎时由 `MockEngine` 导出快照。**不要现在去合并它。**

### 6.3 其他 mock 规矩

- `api/mock.js` 返回的对象必须与真实 HTTP 响应的**形状逐字段一致**（`JobView` / `UserView` / `CosmeticItemView`）。
- 演示模式**不校验密码**——没有后端就没有 scrypt 表。它刻意不存明文密码、也不做假校验。
- 演示模式的衣橱存 `localStorage`（键 `beauty-app.mock-cabinet`），复刻「刷新后还在」的行为。
- `mockGetJob` 对未知 id 会**回放一个已完成的示例任务**，方便直连 `/result` 调试。

### 6.4 ⚠️ 构建过 ≠ dev 过

跨根引用（`@scene-rules` 指向 `../server/`）**只在 dev 才暴露问题**——
`vite.config.js` 里专门配了 `server.fs.allow: ['..']`（本项目根目录没有 `package.json`，
dev server 默认只放行 `vue/`）。动了 `vite.config.js` 的 alias 或 `fs.allow`，
**必须 `npm run dev` 实开一次**，`npm run build` 通过说明不了任何事。

---

## 7. 后端契约

> **类型唯一真源在 `server/src/modules/*/domain/api/*.ts`。**
> 本节是给前端看的转述；两边对不上时，**以后端那个 `.ts` 为准**，并回来改这一节。

### 7.1 端点总表（全部挂 `/api`）

| 方法 & 路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `POST /jobs` | multipart：`face`(1 张，必填)、`scene`(0..6，可选)、`meta`(brief 的 JSON 字符串) | **202** `{ id, status, progress, step }` |
| `GET /jobs/:id` | — | **200** `JobView`，轮询到 `status: 'done'` |
| `GET /jobs/:id/result` | — | **200** 图片字节流 |
| `GET /weather` | `?city=北京` 或 `?lat=&lon=` | **200** `WeatherView` |
| `POST /users` | `{ nickname, password }` | **201** `UserView` |
| `POST /users/login` | `{ nickname, password }` | **200** `UserView`；不符 **401** |
| `GET /users/:id` | — | **200** `UserView` |
| `POST /cabinet/items` | `{ userId, name, attributes? }` | **201** `CosmeticItemView` |
| `GET /cabinet/items?userId=` | — | **200** `{ items: [...] }` |
| `PATCH /cabinet/items/:id` | `{ userId, name?, attributes? }`（二者至少给一个） | **200** `CosmeticItemView` |
| `DELETE /cabinet/items/:id?userId=` | — | **204** 无响应体 |
| `GET /health` | — | **200** `{ ok, name, uptimeSec, now }` |

### 7.2 DTO 形状（JS 视角）

```js
// JobView —— GET /jobs/:id，结果页全程靠它
{
  id, status: 'queued'|'running'|'done'|'failed', progress: 0..100,
  step: 'queued'|'scene_understand'|'reference_gather'|'makeup_generate'|'store_result',
  error: { code, message } | null,
  inputs: { faceName, sceneNames: [], brief },       // brief 就是回显你提交的那份
  scene?: { label, direction, tags: [] },            // 场合判定结果
  references?: [{ id, title, imageUrl, sourceUrl, role, retrievedAt }],
  result?: {
    engine, resultUrl,                              // resultUrl 形如 '/jobs/<id>/result'
    scene, look, references,
    analysis, explain, tips: []                     // 三段给人看的文案
  }
}

// look —— 前端 CSS 叠加预览的依据（mock 模式 resultUrl 为空时走这条路）
{ engine, style, skinTone,
  palette: [{ role, rgb: [r,g,b] }],
  zones: [{ role, anchor:{x,y}, size:{w,h}, opacity, blur, rgb }],  // 坐标/比例均 0..1
  note }

// UserView（★ 永不含密码/凭据）        { id, nickname, createdAt }
// CosmeticItemView                    { id, userId, name, attributes:[{label,value}], createdAt, updatedAt? }
// WeatherView                         { condition?, temperatureC?, humidityPct?, uvIndex?, place?, source }
```

**几个前端必须记住的细节：**

- **`resultUrl` 在纯 mock 模式下是 `null`**——此时结果页回落到「本人照片 + `look.zones` 的 CSS `mix-blend-mode: multiply` 叠加」。
  真实引擎给了 `resultUrl` 就直接展示成品图。**两条路都要能走通**（`ResultView.vue:138` 的 `baseSrc` 就是那个分叉）。
- 路径型 URL 要配 `API_BASE` 前缀再交给 `<img>`——用 `api/makeup.js` 的 `resultImageHref()`，别自己拼。
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
| `JOB_NOT_FOUND` | 404 | 任务没了，回上传页 |
| `JOB_NOT_READY` / `JOB_FAILED` | 409 | 继续轮询 / 走失败态 |
| `FACE_REQUIRED` | 422 | 理论上到不了（前端 `canSubmit` 已挡） |
| `CONTEXT_REQUIRED` | 422 | 同上（`hasContext` 已挡） |
| `SCENES_MAX_EXCEEDED` | 422 | 前端 `MAX_SCENES=6` 已挡 |
| `LOCATION_REQUIRED` / `CITY_NOT_FOUND` | 422 / 404 | 天气**失败说明**，不阻塞提交 |
| `WEATHER_UNAVAILABLE` | 502 | 同上——`clearWeather()` 后整块省掉，**没有手动预设可回落** |
| `USER_NOT_FOUND` | 404 | 账号没了 |
| `CABINET_ITEM_NOT_FOUND` | 404 | 「不存在」与「不属于你」**共用**，别去区分 |
| `CABINET_FULL` | 409 | 衣橱满了 |
| `NICKNAME_TAKEN` | 409 | 昵称占用 |
| `INVALID_CREDENTIALS` | 401 | 昵称或密码错，**不泄露账号是否存在** |
| `VALIDATION_ERROR` | 422 | meta 非法 / 枚举越界 |
| `INTERNAL_ERROR` | 500 | 引擎输出不过关等 |

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

1. **不默认浅肤色审美。**
   `stores/makeup.js` 的 `skinTone` 默认 `medium`——**不许改成 `light`**，不许出现 `skinTone || 'light'` 这种兜底。
   色卡 `SKIN_TONE_OPTIONS[].swatch` 是真实肤底色，不许调成「更白更好看」。
   文案里**不出现「显白」**——用户写了也不迎合（后端有测试钉着这条）。

2. **密码只在请求体里出现一次。**
   不进 store、不进 `localStorage`、不进日志、不进 URL。
   `stores/user.js` 只持久化 `{ id, nickname }` 两个公开字段（键 `beauty-app.user`），多出来的键一律丢弃。
   `api/users.js` 拿到 `UserView` 后**没有任何凭证可存**——后端不签发 token、不建会话。

3. **照片即用即删，身份边界就是现场照片的边界。**
   `logout()` **必须**调 `useMakeupStore().reset()`——不靠人记得手动清。
   任何 `URL.createObjectURL()` 都要有对应的 `revokeObjectURL()`（`stores/makeup.js` 的 `revoke()` 已封装，
   加新的预览 URL 时记得接上；`reset()` 里也要收）。

4. **天气不编造。**
   拉不到就**整个省掉 `weather`**，不许有「手动预设天气」的回落路（曾经有过，已删）。
   mock 模式回的那份样例值**必须带 `source: 'mock'`**，且 UI 要标「离线示意——不是实况」。

5. **商业内容可辨认、不搬运。**
   结果页的推荐位（待做）**必须标「品牌参考 / 赞助」**，空着也比硬贴强；
   外部教程入口只做**外链**，不搬运、不内嵌第三方图文视频、不抓图。

6. **登录门禁不是安全边界。**
   `router/index.js` 的 `beforeEach` 只看本地那份 `{ id, nickname }`，**拦不住也不该假装能拦住谁**。
   真正的把关是后端的归属校验（改/删不认别人）。**别把这段代码写成「安全」的样子**，
   更别基于它做任何「用户只能看到自己的数据」的假设。

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
2. `server/.../jobs/domain/schemas/job-submit.ts` —— zod 形状（`.strict()`，多键会 422）
3. `server/.../makeup/...narration / mock-engine` —— 若它影响文案或调色
4. `vue/src/constants/options.js` —— 加选项 + 中文名映射（**纯展示，无编译期保护，最容易漏**）
5. `vue/src/stores/makeup.js` —— 状态 `ref` + `brief` computed 里的条件放入 + `reset()` 清空
6. `vue/src/pages/UploadView.vue` —— 表单控件
7. `vue/src/pages/ResultView.vue` —— 回显（`hasEcho` 也要加）
8. `vue/src/api/mock.js` —— 假后端要认这个字段

> 枚举类改动（加场合 / 肤质 / 肤色档）另有两条硬要求：
> `brief.ts` 的 `OCCASIONS` 与 `scene-rules.ts` 的 `SCENE_RULES`/`SCENE_MATCH_ORDER` 都要加
> （`Record<Occasion, …>` 漏配会**编译不过**，这是保护），前端 `constants/options.js` 也要跟着加（**无保护**）。

### 其他

| 改动 | 牵动 |
| --- | --- |
| 加一个接口 | `api/<域>.js` 加函数（含 mock 分支，**惰性 import**）→ `api/mock.js` 补同形状假实现 → store 里包一层 → 页面调用 |
| 加一个页面 | `pages/XxxView.vue` → `router/index.js` 加路由 → 需要门禁就别加 `meta.public` |
| 加一个图标 | `Icon.vue` 的 `paths`（24×24，`currentColor`） |
| 动 `vite.config.js` | **必须 `npm run dev`**（alias / `fs.allow` 只在 dev 暴露问题） |
| 动 `scene-rules.ts` | **= 同时改前后端行为**。改完 `cd server && npm test`，且前端 dev 实开 |
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

- **`TipBanner.vue` 零引用**（见 §5.1）。
- **`.text-input` / `.field-label` / `.field-tip` / `.hint` 在 3 个页面各一份**（见 §5.2）。
- **`api/mock.js` 的色板是 `MockEngine` 的知情拷贝**（见 §6.2）——接真引擎时才清理。
- **结果页轮询是 650ms 固定间隔 + 30s axios 超时**（`ResultView.vue:79`）。接真实引擎后单任务可能变几十秒，
  那时要回头核对这里的等待体验——这是 roadmap 里挂着的一条。
- **`references` 的图片素材目前没有合规来源**（roadmap §13-2）——前端拿到 `imageUrl` 为空要能正常回落，
  别因为「没图不好看」就去补一个假地址（`api/mock.js` 就是这么处理的：`imageUrl: ''`）。
