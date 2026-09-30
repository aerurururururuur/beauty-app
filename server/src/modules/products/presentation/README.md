# modules/products/presentation —— 表现层

本层放「对外入口/HTTP 适配」。**两条只读口**：

| 路由 | 回什么 |
| --- | --- |
| `GET /api/products` | 整库目录：`{ groups, products: Card[], shades: { [slug]: { label, shades[] } } }` |
| `GET /api/products/:id` | 一件产品的六维原文 + 手写补充 + 色号；未知 id → 404 |

- **★ 不校验归属、不收 `userId`。** 产品库是**品牌内容**，挂在品牌下不挂账号下，
  形状与 `GET /weather` 同类，不是 `GET /cabinet/items`。见 `routes/products.route.ts` 的文件头。
- **★ 库不存在时这两条路由根本不注册**（`PRODUCTS_DIR` 指了不存在的路径 ⇒
  `compose.ts` 的 `queries` 是 `undefined` ⇒ `app.ts` 不放行）。
  **不做成"注册了但回空目录"**——那是本仓明令禁止的假开关：前端会拿到一个 200 的空屏，
  看起来像"这个品牌没有产品"。不注册 ⇒ 404 ⇒ 界面给一句人话。
- **为什么 `shades` 只在批量那条里给**：`/vanity` 的化妆包卡片要给每件已拥有的产品画色点、
  试色面板要整表。按产品分 N 次调用就是 N+1，而前端那些面板是从内存里读的**同步**取值
  （`stores/vanity.js` 里那几个 computed）——整库一次拉回来，它们才能保持同步。
  整库一次给（约 60 KB，与今天已经打进浏览器包的 kb 同一量级），前端只多**一个** async 点。
  详情那条只管六维原文 + `wording` + 色号，供信息面板点开时取。
- ✏️ **2026-09-30：本层从空变有。** 此前它写着"预计长期为空"，理由有两条，两条都作废了：
  ① 前端那时自己有一份 `vue/src/api/kb/{catalog,products,shades}.js`，不需要后端；
  ② 产品推荐走的是 agent 会话视图（`consultedProducts`），不必新开端点。
  这次前端那三份 kb 退役、并入 `products/`，`/vanity` 整个数字美妆台改读后端 ⇒ 必须有 HTTP 面。
  **会话视图那条路没变**（`read_product` 仍然把读过的产品记进会话），它是另一件事。
- **将来**：若要做「产品库管理后台」（看 `health` 体检报告、修条目），仍归本层，
  且要连 `app.ts` 与前端一起动。
