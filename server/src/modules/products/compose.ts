/**
 * modules/products/compose.ts —— 组合根。
 *
 * ★ **刻意没有 `kind` union / 开关分发。** 内容库没有"可替换的实现"，
 *   只有一份真实数据(和一份将来可能有的第二库)。这正是 roadmap §4 删掉
 *   `understanding` 模块时立下的规矩:**没有可替换实现的端口，不该有开关。**
 *   (对照 `references` 有 `mock|live` —— 那是真有可替换的实现。)
 *
 * ★ 两种"没有内容"要**区别对待**，这是本文件最重要的判断:
 *
 *   | 情况 | 处理 | 为什么 |
 *   | --- | --- | --- |
 *   | 目录**不存在** | 返回 `{ catalog: undefined }`，不炸 | "没配产品库"是合法部署形态(回归测试就靠它)。且缺省值指向的是仓库里真实存在的目录，真出现"不存在"多半是**有意指开**。 |
 *   | 目录存在但**读不动** | **抛错，启动即失败** | 指着一个坏目录却"能启动" = 模型从残缺库里推荐，**没人会知道**。 |
 *
 *   ⚠️ **"读不动"包括"里面有库但取不到"**——空目录、或者内容没复制全、或者
 *   `library.json` 被删掉。这一格曾经被错误地归到第一行(静默),后果是删掉一份
 *   `library.json` 之后服务**照常启动**、模型静默地不再推荐,而没有一行日志说为什么。
 *   判据只有一条:**"没有产品库"= 这个路径不存在**;目录存在就必须能取出一个库。
 *   见 `resolveLibraryRoot` 与其上的注释,以及 `test/products.test.ts` 钉着这条的用例。
 *
 *   第二行是本模块唯一一处**刻意偏离项目惯例**的地方:本项目此前没有任何
 *   "启动时急切扫目录"的先例(`references` 硬编码常量、`makeup` 夹具懒读、
 *   `assets`/`user` 懒读 + `existsSync` 挡)。这里选急切，是为了拿这个"启动即失败"。
 *   详见 `infrastructure/json/content-loader.ts` 的文件头，以及模块 README 的「已知取舍」。
 */
import { loadCatalogIfPresent } from './infrastructure/json/content-loader.js';
import type { JsonProductCatalog } from './infrastructure/json/content-loader.js';
import type { ProductCatalog } from './domain/ports/product-catalog.js';

export interface ProductsModuleOptions {
  /**
   * 内容目录的**绝对路径**(来自 `config.productsDir` / `PRODUCTS_DIR`)。
   * 缺省 `server/../products`。指向不存在的路径 = 关掉产品库。
   * ⚠️ 指向一个**存在**的目录 = 它必须是个库(或装着唯一一个库),否则启动即失败。
   */
  contentDir: string;
}

export interface ProductsModuleServices {
  /**
   * ★ 可空是**有意的**:空 = 这个部署没有产品库 → 组装根不把 `catalog` 交给 agent
   *   → agent 不注册产品工具。**不是"注册了但返回空列表"** —— 那是假开关:
   *   模型会以为自己有个空产品库，然后对着空库编出似是而非的推荐。
   */
  catalog: ProductCatalog | undefined;
  /** 具体实现。**只给组装根打启动日志用**(读 `health`/`source`)，别处拿不到。 */
  loaded: JsonProductCatalog | undefined;
}

export function createProductsModule(options: ProductsModuleOptions): ProductsModuleServices {
  // 目录不存在 → 静默跳过(由调用方决定是否打日志)。
  // 目录存在但取不到库 / 内容坏 → `loadCatalogIfPresent` 内部抛错，这里**故意不 try/catch**:
  // 内容坏了就该把启动打断，包一层只会把"配置错了却也能启动"那类问题重新引回来。
  const loaded = loadCatalogIfPresent(options.contentDir);
  if (!loaded) return { catalog: undefined, loaded: undefined };
  return { catalog: loaded, loaded };
}
