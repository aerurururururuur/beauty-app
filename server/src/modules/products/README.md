# modules/products —— 产品库

把 `products/<库>/` 那份**内容目录**读成可查询的目录：库元信息 + 匹配速查表 + 66 条一行索引，
以及按 id 取一条的六维度全文。供**两位读者**消费：

① agent 在**妆容聊定之后**推荐产品（`list_products` / `read_product`）；
② `vue/` 的数字美妆台经 `GET /api/products` 那两条路由读目录与色号。

数据从**两个输入端**来：源 docx（`scripts/import-products.ts` 解析）+ 手写层
（`products/overlay/<库>/`，见下）。**本模块不生产内容，只读内容。**

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/schemas/entities/content.ts` | 两种内容文件的形状（zod `.strict()` **单源**）：`productFileSchema` / `libraryFileSchema` / `DIMENSION_KEYS`，`Product` 与 `ProductLibrary` 由它 `z.output` 推导 |
| `domain/entities/product.ts` | `Product`（= `productFileSchema` 的输出类型）。★ `dimensions`+`wording`(**别人写的原文**) 与 `derived`(**我们生成的索引**) 物理分开；`DIMENSION_KEYS` / `DimensionKey` 从 schema 转出，`DIMENSION_LABELS`（中文名）在这里 |
| `domain/entities/library.ts` | `ProductLibrary` / `LibraryCategory` / `MatchingGuide` / `LibraryHealth`——都从 `libraryFileSchema` 上切下来 |
| `domain/ports/product-catalog.ts` | `ProductCatalog` 端口：`library()` / `list()` / `find(id)`。**同步**方法，**只进出领域类型** |
| `domain/validators/content.validator.ts` | 校验 + 抛一句人看得懂的话。抛普通 `Error`，**不是 `AppError`** |
| `domain/schemas/api/products-view.ts` | ★ **给界面的那一路**的形状（zod `.strict()`）：目录卡 / 详情 / 色号 |
| `application/products-view.ts` | ★ **投影点**，**两位读者**：给模型的 `toLibraryView` / `toProductSummaryView` / `toProductDetailView`，给界面的 `toCatalogView` / `toProductDetailResponse` |
| `application/usecases/` | `ListCatalog` / `GetProduct`——两条 HTTP 路由的用例 |
| `infrastructure/json/content-loader.ts` | `JsonProductCatalog`：扫目录 → 内存 Map。**不做投影** |
| `compose.ts` | `createProductsModule({ contentDir })`。**刻意没有 `kind` 开关**（只有一份真实数据，没有可换的实现 —— 同 roadmap §4 删 `understanding` 时立的规矩） |
| `presentation/` | 两条只读路由。见那层的 README |

## ★ 两个输入端：源 docx + 手写 overlay

生成物（`products/<库>/`）**一个文件都不许手改**（改了下一次重导全丢）。前端那三份
kb（`vue/src/api/kb/{catalog,products,shades}.js`）2026-09-30 并进来了，它们的内容住
**`products/overlay/<库>/`**——手写的、进版本库的、导入器认得的第二个输入：

| 输入端 | 在哪 | 谁动它 |
| --- | --- | --- |
| 源 docx | `products/<库>/source/` | 想改品牌资料原文的人（改完重导） |
| 手写层 | `products/overlay/<库>/` | 想补文案 / 加色号 / 补录产品的人 |

- `overlay/<库>/crosswalk.json` 是**唯一的绑定**：docx 编号 → slug、分类表、补录声明。
  ★ 它带一个 `library` 字段声明"我是哪个库的手写层"，**导入器核这一条**——
  配错 `--overlay` 会拿 A 的手写层去改 B 的库，而那种错**大部分会静默落空**。
- `overlay/<库>/products/<slug>.json` 是 **patch**：docx 有的只写它缺的，补录产品写全。
- 规矩与迁移表（哪些 slug 被并掉了）在 `products/overlay/<库>/README.md`。

## ★ 已知取舍一：**急切加载**（本项目唯一一处）

启动时整个目录读进内存，**坏数据启动即失败**。

本项目此前没有"启动时急切扫目录"的先例（`references` 硬编码常量、`makeup` 夹具懒读、
`assets`/`user` 懒读 + `existsSync` 挡）。这里刻意选急切，理由只有一条但足够：
**懒读意味着一条字段损坏的产品要到"对话进行到一半、模型真去读它"时才暴露**，
而那时用户正等着推荐。同 `makeup/compose.ts` 那句话：配置错了却"能启动"，
是最容易拖到演示当天才炸的一类问题。

代价：启动多读 ~66 个小文件（50KB 上下），可忽略。
⚠️ **有规模上限**：几千条时急切加载和"整库索引进上下文"都会先撑不住，
那时**先改 `toLibraryView`**（`application/products-view.ts`），别让它留在原地假装还能扩展。

### 两种"没有内容"，区别对待（`compose.ts` 的核心判断）

| 情况 | 处理 |
| --- | --- |
| 目录**不存在** | `catalog: undefined` + `queries: undefined` → agent **不注册**那两个工具、HTTP **两条路由不注册** + 打一行日志。**不是"注册了但返回空列表"**——那是假开关：模型会对着空库编推荐，界面会拿到一个 200 的空屏 |
| 目录存在但**读不动** | **抛错，启动打断**，绝不静默跳过。静默丢产品 = 模型从残缺库里推荐而没人知道 |

`PRODUCTS_DIR` 指向不存在的路径 = 关掉产品库。回归测试就靠这个。

## ★ 已知取舍一：**急切加载**（本项目唯一一处）

启动时整个目录读进内存，**坏数据启动即失败**。

本项目此前没有"启动时急切扫目录"的先例（`references` 硬编码常量、`makeup` 夹具懒读、
`assets`/`user` 懒读 + `existsSync` 挡）。这里刻意选急切，理由只有一条但足够：
**懒读意味着一条字段损坏的产品要到"对话进行到一半、模型真去读它"时才暴露**，
而那时用户正等着推荐。同 `makeup/compose.ts` 那句话：配置错了却"能启动"，
是最容易拖到演示当天才炸的一类问题。

代价：启动多读 ~57 个小文件（50KB 上下），可忽略。
⚠️ **有规模上限**：几千条时急切加载和"整库索引进上下文"都会先撑不住，
那时**先改 `toLibraryView`**（`application/products-view.ts`），别让它留在原地假装还能扩展。

### 两种"没有内容"，区别对待（`compose.ts` 的核心判断）

| 情况 | 处理 |
| --- | --- |
| 目录**不存在** | `catalog: undefined` → agent **不注册**这两个工具 + 打一行日志。**不是"注册了但返回空"**——那是假开关，模型会对着空库编推荐 |
| 目录存在但**读不动** | **抛错，启动打断**，绝不静默跳过。静默丢产品 = 模型从残缺库里推荐而没人知道 |

`PRODUCTS_DIR` 指向不存在的路径 = 关掉产品库。回归测试就靠这个。

## ★ 已知取舍二：内容坏掉时**不自动修**

六维度是**原文照存**，一个字的改写都没有。源资料自身的问题（总数三处对不上、
#36 空占位、#40 缺维度、两组疑似重复、"色号全部剥离"不成立）**原样入库**，
由导入器生成 `library.json` 的 `health` 体检报告暴露出来。

✏️ **2026-09-30：`health` 拆成了两半。**
`health.docxSections` 拿 docx 审 docx（用**合并前**那批算，键是 docx 自己的章节名）——
它与我们怎么分类、与 overlay 无关；`health.merge` 报合并本身
（`docxEntries` / `mergedEntries` / `overlayOnly[]` / `dropped[]` / `byCategory` / `shades` / `overlaySourced`）。
此前那个 `statedVsActual` 名字取消了：分类行不再对应 docx 章节，留着就是一个假的对照表。

**修法只有一个：改源文档 → 重跑导入器。** 不手改生成物——手改的会在下次重导时全丢，
且没人记得改过什么。体检报告是**算出来的**而不是人工标注的，所以重导会自然清零。

`health` **不进模型上下文**（模型不需要，进去只是白烧 token）。它有两个用途：
① 启动时打一行日志，让已知的数据债保持可见；② 打开 `library.json` 就知道该修什么。

## 依赖 / 被依赖

- 依赖：`shared`（`zodIssuesMessage`、`AppError`）、`zod`。**不依赖任何别的模块**。
- 被依赖：组装根 `src/index.ts` 把它包一层交给 `agent`，并把 `queries` 交给 `buildApp`。
  ★ **两边的消费方都不 import 本模块**——`agent` 在自己的
  `agent/domain/ports/product-library.ts`、`styling` 在自己的
  `styling/domain/ports/shade-lookup.ts` 里用**原始类型重写**端口形状，组装根负责粘合
  （跨模块零 import，§7.1）。这是第三、第四处这样的缝（前两处：`userExists`、`cosmetics`）。

## 扩展轴

- **加库**：`products/` 下加一个平级目录，各自有 `library.json`；手写层跟着加
  `products/overlay/<新库>/`。本模块的类型不用动。
- **加类目**：改 `scripts/import-products.ts` 的 `CATEGORIES` + 手写层的 `crosswalk.categories`，重导。
- **加维度**：改 `DIMENSIONS`（导入器）+ `DIMENSION_KEYS` 与 `dimensionsSchema`
  （都在 `schemas/entities/content.ts`）+ `DIMENSION_LABELS`（`entities/product.ts`）
  ——**三处，缺一处启动就炸**（`.strict()` 会抓到）。`DIMENSION_KEYS` 与 `dimensionsSchema`
  是同一份清单写了两遍（六格逐字写出才保得住 `dimensions.skinTypes` 这类按名字取的编译期保护），
  由 `test/products.test.ts` 对表钉着。
  ⚠️ **别只为了装 frontend 那几格文案新增第七维**：它 2026-09-30 是**复用现有六个 key**
  进来的（`voice`→`feedback`、`skin`→`skinTypes`、`weather`→`occasions`、`warning`→`warnings`）。
  新增一维意味着 `dimensions` 那六格、`DIMENSION_KEYS`、模型那一路的投影一起动。

## 待办

- **`lookSpecSlots` 的覆盖是稀疏的**：护肤/防晒/妆前/定妆在 `LookSpec` 里没有对应槽位，
  `zones.cheek` 只有 2 款。这是诚实的边界，不是缺陷——但推荐时该明说，不能硬凑。
- **匹配逻辑在模型手里**（2026-09-16 拍板）。代码里只有排除项（不给 `health`、不替模型排序）。
  若发现模型仍在正文里编产品名，第一个该补的是 `recommend_products(ids[])` 工具，
  理由写在 `agent/domain/tools/definitions.ts` 的文件头。
