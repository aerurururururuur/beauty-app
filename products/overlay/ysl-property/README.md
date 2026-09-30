# overlay/ysl-property —— `ysl-property` 那个库的**手写层**

`../ysl-property/` 里每个文件都是 `server/scripts/import-products.ts` 生成的，
一个字都不许手改（改了下次重导就没了，而没人记得改过什么）。
于是「手写的产品内容」需要有一个**自己的、进版本库的、导入器认得的**地方 —— 就是这个目录。

导入器把它当**第二个输入**：先解 docx，再按这里的 `crosswalk.json` 换 id / 换分类，
最后把 `products/<slug>.json` 逐条并进去。产物仍然是 `../ysl-property/`。

```
../ysl-property/             # 生成物，一个文件都不许手改
└── overlay/ysl-property/    # ★ 这个目录：手写，导入器的第二个输入
    ├── README.md            # 本文件
    ├── crosswalk.json       # 绑定表：docx 编号 → slug；两个分类表
    └── products/<slug>.json # 每个 slug 一份 patch
```

★ **它必须在库目录的旁边，不能在里面。** 加载器（`content-loader.ts`）只把
「直接含 `library.json` 的目录」当库，且对库根下任何不在 `categories` 里的目录
**启动即失败** —— 放成 `../ysl-property/overlay/` 第一次 `npm run dev` 就炸。

## 两个文件各自管什么

**`crosswalk.json`** 是唯一的绑定，导入器靠它把 docx 那套词汇换成库这套：

| 键 | 含义 |
| --- | --- |
| `library` | 它属于哪个库（= 产物目录名）。★ 导入器会核这一条：配错了 overlay 与 `--out` 的话，会拿 A 的手写层去改 B 的库 |
| `groups` / `categories` | 展示分类（9 个，分护肤 / 彩妆两组）。**目录名即分类 id** |
| `docxSections` | docx 那九个章节 → 展示分类。`category: null`（「腮红与高光修容」）表示**该章节的条目各自在 patch 里声明 `category`** |
| `entries` | docx 编号 → slug。57 条一条不少，导入器核对两个方向 |

★ **这里没有"被合并掉的 slug"那张表**（它一度存在，叫 `dropped`）。被并掉的 6 个 slug 写在
下面的迁移表里就够了 —— 那张表**没有任何代码读**，留着就是一个只在文档里成立的约定。

**`products/<slug>.json`** 一律是 **patch**，不是整条。文件名**就是** `id`，两者必须一致。

patch 认识的键只有下面这几个，别的一律不进这里：

| 字段 | 什么条目会写 | 是什么 |
| --- | --- | --- |
| `id` | 全部 | 等于文件名。导入器核这一条 |
| `wording` | docx 有的（可选） | 前端那五格文案。★ 键**复用后端那六个维度键**（`skin`→`skinTypes`、`weather`→`occasions`、`warning`→`warnings`、`voice`→`feedback`），不新增第七维 |
| `shades` | docx 有的（可选） | `{ label, shades[] }`，与前端 `SHADE_LIBRARY[slug]` 逐字段相同（含 `hexApprox: true`）。★ 同一件产品里 `code` 必须唯一 |
| `blurb` | 两者皆可 | 目录卡上那一句 |
| `category` | ⚠️ **只有 `docxSections` 里那条章节写着 `category: null` 时才写**（也就是 #56 / #57 两条） | 展示类目；其余条目由导入器按章节填，写了就冲突 |
| `name` / `kind` / `contains` | **只有补录条目与系列卡**（docx 里没有的那些） | `kind: 'series'` 的条目必须给 `contains`（它管着的那几件产品的 id，导入器会核对每一个都真的在库里）；`kind: 'product'` 的**不许**给 |

- docx 里有的条目，这里**只写它缺的**；`number` / `dimensions` 由导入器从 docx 填，写了就冲突。
- 补录条目（6 条）和系列卡（3 条）**整条都写**，且导入器给它们的 `number` 是 `null`。

## 迁移表（从三份前端 kb 搬过来时，动了什么）

**一物多 slug 的六条 → 合成四条。** 前端把同一件产品拆成了好几条，各挂各的色号；
合并时**给被并进来那一路的色号名加前缀**（`旧版 · ` / `液态 · ` / `高光笔 · ` / `经典 · `）——
不加前缀就是把旧配方的色号挂在新版名下，那是在撒谎。

| 源条目 | 前端原本 | 合并为 | 色号 |
| --- | --- | --- | --- |
| #31 恒久粉底液 | `base-fd-new` + `base-fd-old` | `base-fd-new` | 11 + 5 = **16** |
| #41 持妆喷雾 | `st-mist` + `pr-mist` | `st-mist` | 0 |
| #56 烟染腮红 | `bl-powder` + `bl-liquid` | `bl-couture-blush` | 13 + 3 = **16** |
| #38 明彩笔 | `con-touch` + `ct-touch` + `ct-touch-hl` | `con-touch` | 9 |

★ **`code` 相同的去重，共去掉 11 行**（`ct-touch-hl` 那 8 行是同一支笔的同一批色号，
hex 逐字节相同，只是名字写的是「高光用法」；`bl-liquid` 的 `23`/`37`/`44` 同上）。
去重不是省事：同一件产品里两个色号同一个 `code` 会让「按色号取 hex」这件事**没有唯一答案**。
⇒ `ct-touch-hl` 那条目录卡因此整条消失（它的 8 个色号一行都不剩），
但它写的「高光用法」已经并进 `con-touch` 的 `wording.texture`，没有丢。

⚠️ **被并掉的 slug 有活的消费者 —— 合并当天漏了这件事。**
`server/src/modules/styling/domain/entities/style-recipes.ts` 里 **21 处**还写着
`bl-powder` / `bl-liquid`：那两个 slug 被并进 `bl-couture-blush` 之后，这些 pid 就**悬空**了。
悬空的后果是**静默的**：`hexOf` 只是返回空串，那一步的产品没有色块，没有任何一层会报。
已把配方里的这两处（以及 `vue/src/api/kb/styles.js` 里同源的 21 处）改成 `bl-couture-blush`——
被并走的那 3 个色号（`23`/`37`/`44`）在 `bl-powder` 那一路里本来就有一份同名同 hex 的行，所以取色不变。
⇒ 以后**再合并任何 slug，先 grep 全仓**（配方、化妆包、测试、文档都算）。
`server/test/styling-plan.test.ts` 现在有一条断言专门守这件事：每个非空 pid 都必须在库里取得到。

**另外三个被并掉的 slug（`base-fd-old` / `pr-mist` / `ct-touch` / `ct-touch-hl`）确实是零消费者** ——
`server/data/cabinet/items.json` 里只有两条 `attributes: []` 的空行，配方也不引。

**补录 6 条**（docx 里没有、前端有，整条写在 patch 里）：
`lip-square`(11 色) · `lip-pink`(8) · `lip-gloss`(15) · `eye-palette-10`(1) ·
`ct-powder`(2) · `ct-bronze`(6)。

**系列卡 3 条留**（`kind: 'series'`，内容取前端那张卡，`derived.contains` 列出它管的产品）：
`sk-pureshots`(13) · `sk-orrouge`(6) · `sk-reload`(3)。
留的理由是硬的：`styling/domain/entities/style-recipes.ts` 的配方直接引 `sk-orrouge`，
删了就有 pid 悬空；而且化妆包里存得下它们（id 不变，旧行照样解析）。

**丢掉 2 条**：`sk-1week` / `sk-3day`。它们只在 `kb/products.js` 里有定义 ——
`CATALOG` 没有、色号库没有、配方不引、测试不提，**全仓零消费者**。
按本仓「永远不会执行的形状 = 假开关」的判据删掉。记在这里，免得日后被当成抄漏了。

**8 条 `desc` 是「色号待补」的没有进 `blurb`。** 那是**状态**不是描述；
照抄过去，目录卡上就会拿一个状态当产品介绍，而它看起来完全正常。

## 来源

手写层的内容全部来自这三份前端文件（2026-09-30 迁入，迁完即删）：

| 文件 | sha256 |
| --- | --- |
| `vue/src/api/kb/catalog.js` | `b8f4319af8c93a303e5dfdb85d879b8a52960df88770f2f6f58dea328603e7c5` |
| `vue/src/api/kb/products.js` | `96e062812b2d1c3abcc2619abc54b30e37dd74939288dbde22aa0a323a872c63` |
| `vue/src/api/kb/shades.js` | `a678a6b2c6952a52666598d8bad003b525f0dd023c01df25ff14afb6d8a004f4` |

搬家用的是一次性脚本（已删）。**映射表是手写的，文案是机械搬的** ——
所以这里没有一处是「凭印象重写」的。

⚠️ **色号是抄来的近似值**（`hexApprox: true`）。YSL 不公布 HEX，那 163 行是按色号名推的。
搬进 `products/` 之后，它们会与品牌资料的原文并排躺在同一棵目录里，**看起来一样权威** ——
所以那个字段和界面上那句话都必须在，别让上游的严谨度被这次搬迁洗白。
