# modules/products —— 产品库

把 `products/<库>/` 那份**内容目录**读成可查询的目录：库元信息 + 匹配速查表 + 57 条一行索引，
以及按 id 取一条的六维度全文。供 agent 在**妆容聊定之后**推荐产品（`list_products` / `read_product`）。

数据从哪来：`scripts/import-products.ts` 从源 docx 生成。**本模块不生产内容，只读内容。**

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/product.ts` | `Product`：`{ id, number, name, category, dimensions, derived, notes? }`。★ `dimensions`(**原文**) 与 `derived`(**我们生成的索引**) 物理分开 |
| `domain/entities/library.ts` | `ProductLibrary` / `LibraryCategory` / `MatchingGuide` / `LibraryHealth` |
| `domain/schemas/content.ts` | 两种内容文件的形状（zod `.strict()` 单源） |
| `domain/ports/product-catalog.ts` | `ProductCatalog` 端口：`overview()` / `find(id)`。**同步**方法 |
| `domain/validators/content.validator.ts` | 校验 + 抛一句人看得懂的话。抛普通 `Error`，**不是 `AppError`** |
| `infrastructure/json/content-loader.ts` | `JsonProductCatalog`：扫目录 → 内存 Map |
| `compose.ts` | `createProductsModule({ contentDir })`。**刻意没有 `kind` 开关** |
| `application/` `presentation/` | 空。各有 README 说明为什么空 |

## ★ 已知取舍一：**急切加载**（本项目唯一一处）

启动时整个目录读进内存，**坏数据启动即失败**。

本项目此前没有"启动时急切扫目录"的先例（`references` 硬编码常量、`makeup` 夹具懒读、
`assets`/`user` 懒读 + `existsSync` 挡）。这里刻意选急切，理由只有一条但足够：
**懒读意味着一条字段损坏的产品要到"对话进行到一半、模型真去读它"时才暴露**，
而那时用户正等着推荐。同 `makeup/compose.ts` 那句话：配置错了却"能启动"，
是最容易拖到演示当天才炸的一类问题。

代价：启动多读 ~57 个小文件（50KB 上下），可忽略。
⚠️ **有规模上限**：几千条时急切加载和"整库索引进上下文"都会先撑不住，
那时**先改 `overview()`**，别让它留在原地假装还能扩展。

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

**修法只有一个：改源文档 → 重跑导入器。** 不手改生成物——手改的会在下次重导时全丢，
且没人记得改过什么。体检报告是**算出来的**而不是人工标注的，所以重导会自然清零。

`health` **不进模型上下文**（模型不需要，进去只是白烧 token）。它有两个用途：
① 启动时打一行日志，让已知的数据债保持可见；② 打开 `library.json` 就知道该修什么。

## 依赖 / 被依赖

- 依赖：`shared`（`zodIssuesMessage`）。**不依赖任何别的模块**。
- 被依赖：组装根 `src/index.ts` 把它包一层交给 `agent`。
  ★ **`agent` 不 import 本模块**——它在 `agent/domain/ports/product-library.ts` 里
  用**原始类型重写**自己那份端口形状，组装根负责粘合（跨模块零 import，§7.1）。
  这是第三处这样的缝（前两处：`userExists`、`cosmetics`）。

## 扩展轴

- **加库**：`products/` 下加一个平级目录，各自有 `library.json`。本模块的类型不用动。
- **加类目**：改 `scripts/import-products.ts` 的 `CATEGORIES`，重导。
- **加维度**：改 `DIMENSIONS`（导入器）+ `DIMENSION_KEYS`/`DIMENSION_LABELS`（`entities/product.ts`）
  + `dimensionsSchema`（`schemas/content.ts`）——**三处，缺一处启动就炸**（`.strict()` 会抓到）。

## 待办

- **`lookSpecSlots` 的覆盖是稀疏的**：护肤/防晒/妆前/定妆在 `LookSpec` 里没有对应槽位，
  `zones.cheek` 只有 2 款。这是诚实的边界，不是缺陷——但推荐时该明说，不能硬凑。
- **匹配逻辑在模型手里**（2026-09-16 拍板）。代码里只有排除项（不给 `health`、不替模型排序）。
  若发现模型仍在正文里编产品名，第一个该补的是 `recommend_products(ids[])` 工具，
  理由写在 `agent/domain/tools/definitions.ts` 的文件头。
