# modules/styling —— 妆容方案

把「场合 + 风格配方 + 用户的面部特征」展开成一份**方案**：步骤、色板、产品、个性化调整。
它是 `agent` 在 `propose_look` 那一步的产出之一——另一半是 `makeup` 的妆面单。

**2026-09-30 新建。** 这份内容原本住在前端的 `vue/src/api/kb/styles.js` 与 `vue/src/api/design.js`，
桃妆那条「场景 → 表单 → 方案」动线改由后端 agent 产出方案之后搬进来。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/schemas/entities/style-recipes.ts` | 配方三个形状（产品 / 步骤 / 配方）的 zod 单源 |
| `domain/entities/style-recipes.ts` | ★ 21 套配方 + `SCENE_STYLES` 候选池 + `styleById` / `stylePoolFor` |
| `application/plan-view.ts` | 一份方案的对外形状（视图，不是实体） |
| `application/derive-plan.ts` | ★ `derivePlan()`：配方 → 方案。纯函数、无 IO |

**没有 `compose.ts`**（静态内容 + 纯函数，没有配置也没有可换的实现），
**没有 `domain/validators/`**（没有运行时输入要校验）。理由写在 `index.ts` 的文件头。

## 三条硬约定（改配方之前必须读）

1. **步骤的数量 / 名称 / 顺序由配方数组决定**，不同风格之间本来就不同（4 ~ 11 步）。
   读它的人**不得写死任何一步、不得假设固定顺序**。
2. ★ **色值的唯一来源是前端 `vue/src/api/kb/shades.js`。** 配方里只写 `P(名称, pid, 色号)`，
   **不写 hex**——两边各存一份必然漂。所以 `PlanView` 里的 `palette` / `products` **都没有 hex**，
   由前端 `hexOf(pid, code)` 回填。
3. **`palette` 不由配方手写**，由 `derive-plan.ts` 从「本方案真的用到的色号」推导，
   保证色板与步骤永远一致。

## 与前端那份是同一份内容

`domain/entities/style-recipes.ts` 与 `vue/src/api/kb/styles.js` **逐字段相同**
（只多了 `stage` / `family` / `daily` 三个后端独有场合的候选池——那三个场合只经对话进来，
真实模型完全可能把「下周答辩」判成 `stage`）。
✏️ **2026-09-30：`kb/styles.js` 在前端已经零消费者了，但它是"搬运前的原件"，别删。**

两边相等由 **`server/test/styling-plan.test.ts`** 钉着，两道：

1. **内容对表** —— 逐条比 `STYLE_LIBRARY`（按 id）与 5 个共有场合的候选池，
   判据是「后端应等于前端」。
   ⚠️ 方向是**前端说了算**：这份配方是 09-30 从 `kb/styles.js` 搬过来的，
   搬家搬错一格**没有任何别的征兆**（方案照算、页面照渲染、日志干净，只有某一格不对），
   所以只能拿原件直接比。
2. **色值对表** —— 配方里每一对非空的 `(pid, code)` 都要能在前端的 `kb/shades.js` 里
   查到非空 hex。这条一红，就说明"后端跳过 `!pid || !code`"与"前端跳过 `!hex || !code`"
   不再等价，方案里的色板会少几块而**界面上看不出来**。

✏️ 这个文件**此前**比的是「后端 `derivePlan` vs 前端的 `getDesignResult()`」。
阶段 5 把前端那套本地推导删掉之后，对表劈成上面这两半
（展开是否正确改成**对着配方自己**断言：步骤一笔不多一笔不少、id 拼法固定、
`desc` 就是那一步的操作手法）。

另 3 个场合（`stage` / `family` / `daily`）前端没有对手，由 `SCENE_STYLES` 那份
`Record<Occasion, …>` 与「池子非空、池里的 id 都查得到配方」两条兜着。
★ 本仓已有先例：`test/scene-rules.test.ts` 读 `vue/vite.config.js` 钉一个跨端不变量。

**改配方就要同时改两边，并让那条测试过。**

## 刻意没有搬进来的

| 没搬 | 为什么 |
| --- | --- |
| `kb/shades.js`（色号库） | (a) 它同时是「数字美妆台试色」的数据源（`api/vanity.js`）；(b) 约定 2 说色值唯一来源是它——后端再存一份就是违反它自己写的规矩 |
| `kb/catalog.js` / `kb/products.js` | `/vanity` 的目录与产品性质，与 agent 无关 |
| `SCENES` / `SCENE_FORMS` | **输入侧**的表单定义，不是方案 |
| `kb/features.js` 的展示面 | 选人设的单选/多选要用；其中 `fix` / `products` 那部分进了 `face-catalog`（见那份的 README） |

## 谁在用

`agent` 的 `propose_look` 工具：它先按 `stylePoolFor(occasion)` 校验模型给的 `styleId`，
再调 `derivePlan(...)` 把方案算出来，和妆面单**在同一次工具调用里**一起写进会话。
★ **方案与妆面单必须是同一个决定**——分成两次工具调用就会出现「讲给用户的方案」
和「真的要出图的那套妆」不是一套，而用户是拿方案当成片的承诺的。
