/**
 * domain/ports/product-catalog.ts —— 产品目录端口(本模块持契约)。
 * 实现见 `infrastructure/json/`(读 `products/<库>/` 那份内容目录)。
 *
 * ★ 单实现也留端口,是照 `cabinet/domain/ports/cosmetic-repository.ts` 的先例:
 *   目的是**别处经 public barrel 拿不到具体实现**,依赖方向保持单向。
 *   (「没有可替换实现就不该有端口」那条规矩管的是 `compose.ts` 里的 `kind` **开关**,
 *    不是端口本身——本模块的 `compose.ts` 因此刻意没有开关。)
 *
 * ★ 方法**是同步的**:库在启动时就整个读进内存了(见 `infrastructure/json/content-loader.ts`
 *   里"为什么急切加载"那段)。写成 async 只会假装底层可能是网络/磁盘,
 *   而那个假象会让调用方以为"每次调用都要等"。
 *
 * ★ **本端口只进出领域类型**(`ProductLibrary` / `Product`)——**不返回投影**。
 *   「一行索引」「六维度详情」那种给调用方看的样子是**投影**,归
 *   `application/products-view.ts`(§6 唯一投影点)。放在这里的话,
 *   "这个模块往外给哪些字段"就成了契约的一部分,而那是视图该管的事 ——
 *   结果就是端口里三个接口(`LibraryOverview` / `ProductSummary` / `ProductDetail`)
 *   比它真正要回答的两个问题还长。
 *
 * ⚠️ **不含 `health`**:体检报告是给我们修数据看的,模型不需要,进上下文只是白烧 token。
 *   (它仍在 `library()` 返回的实体上;组装根打启动日志时读它,那是**模块内部**的用法。)
 */
import type { Product } from '../entities/product.js';
import type { ProductLibrary } from '../entities/library.js';

export interface ProductCatalog {
  /** 库级元信息:`library.json` 那个领域对象本身(类目表 / 速查表 / 说明)。 */
  library(): ProductLibrary;
  /**
   * 全部条目,**按扫描顺序**(类目目录序 + 文件名序)。
   * 它就是"整库索引"的原料 —— 投影(取首句、贴类目中文名)在 `products-view.ts` 里做。
   */
  list(): Product[];
  /** 按 id 取一条;没有就是 `undefined`(**不抛错**——查不到是正常结果,不是故障)。 */
  find(id: string): Product | undefined;
}
