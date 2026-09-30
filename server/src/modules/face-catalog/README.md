# modules/face-catalog —— 面部词表

把 `assests/face-catalog/` 那份**内容目录**读成一份可查询的 `FaceVocabulary`：
8 档肤色 → 可用色号（给 `makeup` 收窄色域），以及 31 条面部特征 → 策略卡（给 `styling` 算方案）。

内容住 JSON，**代码住这里**。改内容改 `assests/face-catalog/*.json`，改行为改本模块。

> ✏️ 2026-09-30：这份 README 之前**不存在**——本模块是全仓唯一没有 README 的模块，
> 而 `server/README.md` 一直写着「每个模块都有一份」。补上它，顺便记下这一轮
> 真正变了的那件事（特征策略卡进表，见下）。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/schemas/entities/vocabulary.ts` | ★ 两个 JSON 文件的形状（zod，**单源**）。宽 Raw：色是 `string`，枚举白名单**不在这里** |
| `domain/entities/face-vocabulary.ts` | `FaceVocabulary` / `FeatureDimension` / `FeatureValue` / `SkinToneTier`。★ 字段一律 `Object.assign` 搬过来，**不逐格声明**（同 §4.1 的实体口径） |
| `domain/validators/vocabulary.validator.ts` | ★ 行为：坏词表**一律抛普通 `Error`**，不返回 `null`、不留空壳。取值白名单（`toneKeys ⊆ TONE_KEYS`、`route.slot ∈ GEOMETRY_SLOTS`）也归这里（§4.2 的分工） |
| `infrastructure/json/vocabulary-loader.ts` | 读盘。**急切加载**——只有急切才拿得到"坏词表启动即失败" |
| `compose.ts` | `createFaceCatalogModule({ contentDir })` → `{ vocabulary }` |

## 三条硬约定

1. **读不到 = 起不来。** 与 `products` 有意不同：产品库「目录不存在」是关掉功能的合法形态，
   面部词表**没有这个形态**——它是 `brief.skinType` / `skinTone` 合法取值的来源，
   缺了它整条 brief 校验无从谈起。所以目录不存在、缺文件、内容不合规，**一律抛错、启动即失败**。
   ⚠️ `FACE_CATALOG_DIR` 指向一个不存在的路径 **= 起不来**，不是"安静地关掉识别"。
2. **没有 `kind` union / 开关。** 词表只有一份真实数据，没有可替换的实现
   （对照 `weather` 的 `mock|live`——那是真有第二个实现）。见 `compose.ts` 文件头，
   判据同 `docs/architecture.md` §4：「没有可替换实现的端口，不该有开关。」
3. **坏词表抛普通 `Error`，不是 `AppError`。** 词表坏了不是"这个请求不合法"，
   是**这个服务不该以当前状态启动**（同 `products` 的 `content.validator.ts`）。

## ★ 2026-09-30：特征策略卡进了这张表

`features.json` 的每条 value 从 `{ id, label, route }` 变成
`{ id, label, desc, fix, products, route }`——后三格是**给用户看的调整策略**，
逐字摘自《美妆个性需求知识库（已补全）》，与前端 `vue/src/api/kb/features.js` 的同名格
**逐字段相同**。

- **谁在用**：`styling` 的 `derivePlan` 把它们变成方案里的「个性化调整」卡片；
  agent 经 `FeatureStrategies` 端口读（**不是**直接 import 本模块——它是运行时加载的目录内容，
  有真实的加载与失败行为要接缝，形状与 `agent → styling` 那条直接 import 不同）。
- **id 对齐到前端那一套**（`downturned` → `eye-drop` 等）：前端的 id **已经落在用户数据里**
  （`localStorage` 的人设存的是 `features: ['eye-drop', …]`），而后端的 id 到今天零消费者
  （`route` 是留给 P3 的）。**改后端，不动用户数据。**
- **同轮推翻了一条自己写下的决定。** 原文的 `note` 写着「本文件不含任何『这个特征把妆面调成什么样』
  的映射……编进来就是又一张占位表」。**那句话当时是对的，推翻的是「不编进表」，不是「没有依据」**
  ——这批策略文案不是我们编的。推翻的理由与全部经过记在 `features.json` 的 `note` 里，
  **要动这一块先读那一段**。
- ⚠️ `products` 是知识库原文里点到的**产品名（自由文本）**，**不是 `pid`**——
  别拿它去 join 产品库。`note` 里也写着这句。

## 改这里要动哪几处

| 你想改 | 动哪里 | 还有哪一处会红 |
| --- | --- | --- |
| 加一档肤色 | `skin-tones.json` **+** `shared/domain/entities/brief.ts` 的 `SKIN_TONES` | 启动时逐项对账，多一个少一个都起不来；`test/face-catalog.test.ts` 另有一组基准样本 |
| 改色域（哪一档能用哪个色） | `skin-tones.json` 的 `toneKeys` | 「死色」那条检查：不许有 `TONE_KEYS` 里从没用到的色，也不许发明色 |
| 加 / 改一条特征策略 | `features.json` 的 `desc` / `fix` / `products` | 与前端 `kb/features.js` 的对表（`test/face-catalog.test.ts`）；改一边不改另一边会红 |
| 改特征 / 分组的 **id** | ★ **先定谁改**——两边 id 已经对齐，改一侧就是改用户数据的兼容性 | 同上那条对表 |
| 改 `route` 的分类 | 照 `features.json` `note` 里那套判据（凡是要写「眼线 / 眼尾 / 上扬 / 拉长 / 轮廓 / 唇线 / 眉形 / 鼻影」才能表达的，一律 `geometry`） | 那是 §4.4 run 3 / run 4 的实测结论，**别按直觉重分** |

★ 与前端对表的方向是**用户数据那边说了算**（那条对表测试的标题就是这句）。
`route` / `geometry slot` **今天仍然零消费者**——它是 P3 的，本轮没接。
