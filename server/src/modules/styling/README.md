# modules/styling —— 妆容方案

把「场合 + 风格配方 + 用户的面部特征」展开成一份**方案**：步骤、色板、产品、个性化调整。
它是 `agent` 在 `propose_look` 那一步的产出之一——另一半是 `makeup` 的妆面单。

**2026-09-30 新建。** 这份内容原本住在前端的 `vue/src/api/kb/styles.js` 与 `vue/src/api/design.js`，
桃妆那条「场景 → 表单 → 方案」动线改由后端 agent 产出方案之后搬进来。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/schemas/entities/style-recipes.ts` | 配方三个形状（产品 / 步骤 / 配方）的 zod 单源 |
| `domain/entities/style-recipes.ts` | ★ 21 套配方（每条自带 `family`） + `styleById` |
| `domain/ports/shade-lookup.ts` | `ShadeLookup` 端口（`hexOf(pid, code)`）。**由本模块声明**，组装根粘产品库 |
| `application/plan-view.ts` | 方案的对外形状：`PlanDraft`（无 hex）/ `PlanView`（有 hex） |
| `application/derive-plan.ts` | ★ `derivePlan()`：配方 → `PlanDraft`。纯函数、无 IO |
| `application/decorate-plan.ts` | ★ `decoratePlan(draft, shades)`：补色值 → `PlanView` |

**没有 `compose.ts`**（静态内容 + 纯函数，没有配置也没有可换的实现），
**没有 `domain/validators/`**（没有运行时输入要校验）。理由写在 `index.ts` 的文件头。
★ `domain/ports/shade-lookup.ts` **不是**"随便加了个端口":它由本模块声明、组装根在
`src/index.ts` 里粘，本模块照旧一次 IO 都不做（§7.1）。

## 三条硬约定（改配方之前必须读）

1. **步骤的数量 / 名称 / 顺序由配方数组决定**，不同风格之间本来就不同（4 ~ 11 步）。
   读它的人**不得写死任何一步、不得假设固定顺序**。
2. ★ **色值的唯一来源是产品库的 `shades`。** 配方里只写 `P(名称, pid, 色号)`，
   **不写 hex**——两边各存一份必然漂。补色值那一步在 `decoratePlan`（`ShadeLookup` 端口）。
   ✏️ **2026-09-30：这条约定原来指的是前端 `vue/src/api/kb/shades.js`，那份已退役。**
   色号随其余两套 kb 一起并进了 `products/ysl-property/`，前端那份 `hexOf` / `decoratePlan`
   删掉了——**全仓现在只有组装根那一处闭包查色值**。约定本身没变（唯一来源），换的是它指谁。
3. **`palette` 不由配方手写**，由 `derive-plan.ts` 从「本方案真的用到的色号」推导，
   保证色板与步骤永远一致。

## 产出分两步：`PlanDraft` → `PlanView`

| | 谁产出 | 带 hex |
| --- | --- | --- |
| `PlanDraft` | `derivePlan`（纯函数，不认识产品库） | 不带 |
| `PlanView` | `decoratePlan(draft, shades)` | 带 |

**对外的形状只有 `PlanView`**（写进会话的就是它）。拆两步是为了让"推导"保持纯的——
真查产品库那件事被推给了注入的端口，于是这一整块在测试里喂个假 `ShadeLookup` 就能跑。

★ 降级是**诚实**的：产品库没配时 `hexOf` 一律回空串 ⇒
**色板里那些查不到色的条目被丢掉**（色板的全部用途就是摆色块，摆一块没有颜色的等于给用户看一格空白），
而**步骤里的产品一支不少**（它是"这一支没色块"，不等于"这件产品没用到"）。

## 与前端那份是同一份内容

`domain/entities/style-recipes.ts` 与 `vue/src/api/kb/styles.js` **逐字段相同**。
✏️ **2026-09-30：这份配方在前端的**两个**消费者都变了 —— `kb/styles.js` 的 21 个名字
现在被 `/form` 的「想要的风格」chips 直接消费（`api/design.js`），所以"零消费者"那句作废。
`SCENE_STYLES` / `stylesForScene`（`:436` / `:448`）随之成为孤儿，一并删掉了。**

两边相等由 **`server/test/styling-plan.test.ts`** 钉着，两道：

1. **内容对表** —— 逐条比 `STYLE_LIBRARY`（按 id，判据是「后端应等于前端」）。
   ⚠️ 方向是**前端说了算**：这份配方是 09-30 从 `kb/styles.js` 搬过来的，
   搬家搬错一格**没有任何别的征兆**（方案照算、页面照渲染、日志干净，只有某一格不对），
   所以只能拿原件直接比。
2. **色值对表** —— 配方里每一对非空的 `(pid, code)` 都要能在**产品库**里
   查到非空 hex（对手从 `kb/shades.js` 换成了 `products/`，因为色号搬了家）。
   这条一红，就说明色板会少几块而**界面上看不出来**。
   另有第三段 `★ decoratePlan`：拿真产品库跑一遍 21 套配方（每块色板都有颜色），
   再拿假端口把"丢谁留谁"那两条边界钉住。

✏️ 这个文件**此前**比的是「后端 `derivePlan` vs 前端的 `getDesignResult()`」。
阶段 5 把前端那套本地推导删掉之后，对表劈成上面这两半
（展开是否正确改成**对着配方自己**断言：步骤一笔不多一笔不少、id 拼法固定、
`desc` 就是那一步的操作手法）。

✏️ **2026-09-30：候选池（`SCENE_STYLES` / `stylePoolFor`）删了，`Record<Occasion, …>`
那道穷尽检查随之消失。** 配方**本身就没有场合概念**——21 条各自带 `family`（7 类），
再按场合分一层池子是重复的间接。现在的对应关系是：
- **「换一版」的候选 = 同 `family` 的兄弟**（`derive-plan.ts`），由
  `styling-plan.test.ts` 的「family 都非空」那条兜住（空 family 那一组就只剩它自己）；
- **场合与风格是两张各自独立的预设表，自由组合**——不再有任何"这个场合只能配那几条"的依赖。

**改配方就要同时改两边，并让那条测试过。**

## 刻意没有搬进来的

| 没搬 | 为什么 |
| --- | --- |
| `kb/catalog.js` / `kb/products.js` | `/vanity` 的目录与产品性质，**与方案无关**——它们 2026-09-30 并进了 `products/`，不是并进这里 |
| `SCENES` / `SCENE_FORMS` | **输入侧**的表单定义，不是方案 |
| `kb/features.js` 的展示面 | 选人设的单选/多选要用；其中 `fix` / `products` 那部分进了 `face-catalog`（见那份的 README） |

✏️ **原表里 `kb/shades.js` 那两行作废了**：那份 2026-09-30 并进了产品库，
色值成了**产品库的字段**，于是它既不是"不该搬进来"，也不再是"另一端的数据源"。

## 谁在用

`agent` 的 `propose_look` 工具：它校验模型给的 `styleId`，再调 `derivePlan(...)`
把方案算出来、`decoratePlan(...)` 补上色值，和妆面单**在同一次工具调用里**一起写进会话。
★ **方案与妆面单必须是同一个决定**——分成两次工具调用就会出现「讲给用户的方案」
和「真的要出图的那套妆」不是一套，而用户是拿方案当成片的承诺的。
✏️ 它构造时收的 `shades` 是**必填**（同 `palette` / `features`）：少传它色卡会全都没有颜色，
而条数一格不少——界面上是一排空白格子，没人知道那里本该有颜色。
