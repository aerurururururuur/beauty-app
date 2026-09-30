# modules/products/application —— 应用层

本层放「产品库的独立用例」。

- **现状**：`products-view.ts`（**投影**，§6 唯一投影点）+ `usecases/` 下两条只读用例
  （`ListCatalog` / `GetProduct`，供 `presentation/` 的两条路由）。
- **★ 投影一个文件、两位读者**（2026-09-30 起）。`products-view.ts` 里现在有**两路**：
  | 读者 | 函数 | 特点 |
  | --- | --- | --- |
  | 模型（agent 工具） | `toLibraryView` / `toProductSummaryView` / `toProductDetailView` | 省 token、只出首句、`interface` 形状 |
  | 界面（两条 HTTP 路由） | `toCatalogView` / `toProductDetailResponse` | 全文、带色号、zod 形状（`domain/schemas/api/`） |
  分成两路而不是合成一路，是因为两边的取舍正好相反：模型那边每多一格都是要烧的 token，
  界面这边每少一格都是看不见的内容。**谁都不许顺手把另一路的字段并过来。**
- **为什么投影算本层的活**：它决定"这个模块往外给哪些字段"，而那是视图的事，
  不是"目录怎么取数"的事。放进端口就等于把视图冻成契约：加一维、换措辞、省 token
  都要动端口，而实现方本来跟这些毫无关系。
- **⚠️ 每条用例的产出必须有人读。** 界面上没消费的字段（`productCount` / `isSeries` /
  `series` / `fromOverlay` / 顶层 `library` 对象那一整块）都**刻意没进 `api/` 的 schema**——
  多一个只有生产者、没有读者的字段，就是本仓反复要修的那种假开关。要加字段，
  先在 `vue/` 里找到那个读它的地方。
- **将来放什么**：若出现**跨条目的加工**，用例就该落在这里。已知的候选有两个：
  1. **按 LookSpec 槽位 + 场合打分排序**（现在排序的责任在模型手里：它读 `list_products`
     自己判断该推谁，见 `agent/application/system-prompt.ts` 的推荐规则）。
     真要做成代码排序，那就是一条用例，且**必须能在提示词那套之外被单独测试**。
  2. **分片检索**：条目涨到几千条时整库索引不能再一次给全（`toLibraryView` 上那句 ⚠️
     说的就是这个）。切分策略是编排，不是 IO，放这里。
- ⚠️ **别把"模型自己判断"挪成代码判断，除非有理由。** 匹配逻辑由模型读原文判断，
  是 2026-09-16 拍板的结果（红线 §13-6：匹配逻辑不为推广让路——代码里写死的
  "什么肤质推什么"反而更容易被当成可调参数）。要改这条，先回 `docs/plan/roadmap.md` §9。
