/**
 * agent/domain/ports/product-library.ts —— 「有哪些产品、各自什么性质」的端口。
 *
 * ★ **跨模块"问一句"的第三处**,前两处是 `cosmetic-reader.ts`(读 cabinet)与
 *   `user-directory.ts`(读 user)。端口声明在**消费方**模块(agent),实现由
 *   **组装根 `src/index.ts`** 把 products 的 `ProductCatalog` 包一层粘进来。
 *   §7.1 写死了:**agent 不 import products 模块,模块间仍零 import。**
 *
 * ★ **下面的形状用原始类型重写,一个 products 模块的类型都不借。**
 *   `ProductCatalog` 那边有 `DimensionKey` / `DIMENSION_LABELS` 这套中文标签表,
 *   这里**一个都不引**——只留 `{ label, text }` 两栏。借一个类型,这道缝就白留:
 *   products 改它的维度枚举,agent 会被动跟着改。
 *   (同 `CabinetItemSnapshot` 的规矩:端口只暴露消费方**真正需要**的字段,
 *    重复几行结构比借一个类型便宜。)
 *
 * ★ **方法刻意是同步的。** 产品库在启动时就整个读进了内存
 *   (products 模块的 `content-loader.ts`,那里写了为什么急切加载),查一次是
 *   一次 `Map.get`。写成 `Promise` 只会假装底层可能是网络/磁盘,
 *   而那个假象会让调用方以为"每次调用都要等"。
 *   ⚠️ **这里和 `CosmeticReader` 不一样是有道理的**:那个读磁盘,这个读内存。
 *   有朝一日产品库真去查远端,这个签名要一起改——那时才该改。
 *
 * ⚠️ **不含体检报告(`health`)。** 那是给我们修数据看的,模型不需要,
 *   进上下文只是白烧 token。也**不含 `statedCount`**(文档自称款数)——
 *   模型该说实际有多少条,不该复述源资料那个对不上的数字。
 */

/** 一行索引。给模型**挑**用,不含六维度全文——全文走 `find()`。 */
export interface ProductIndexEntry {
  /** 传给 `find()` 的那个 id。 */
  id: string;
  name: string;
  /** 中文类目名,如「唇部彩妆」。 */
  categoryLabel: string;
  /** 品牌自己的系列名(如「Pure Shots 悦享青春系列」)。源资料没写就没有。 */
  series?: string;
  /**
   * 这条产品能对上 `LookSpec` 的哪些槽位(`base` / `zones.lip` / …)。
   * ★ **空数组是常态而非异常**:护肤、防晒、妆前、定妆在 `LookSpec` 里
   *   根本没有对应字段。空 = "这条不构成妆面上的某一笔",不是"数据缺了"。
   */
  lookSpecSlots: string[];
  /**
   * 三个维度的**首句**(不是截断到 N 字)。取首句的理由见 products 模块的
   * `content-loader.ts`:品牌资料里一句话就是一个意思,截半句更容易被误读。
   */
  textureFirst: string;
  skinTypesFirst: string;
  occasionsFirst: string;
}

/** 库级信息:元信息 + 类目 + 匹配速查表 + 补充说明 + 全部条目的一行索引。 */
export interface ProductLibraryOverview {
  name: string;
  brand: string;
  categories: { label: string; count: number; lookSpecSlots: string[] }[];
  /**
   * 品牌资料自带的「品类匹配逻辑速查表」(`columns[0]` 是条件列)。
   * ★ **含「避开品类」这个负向信号**——别只读正列,那会把该避开的也推出去。
   */
  matchingGuide: { columns: string[]; rows: { condition: string; cells: string[] }[] };
  /** 品牌资料的补充说明(含酸/含变性乙醇/护肤线与彩妆的联动…)。原样带出去。 */
  notes: { label: string; text: string }[];
  products: ProductIndexEntry[];
}

/** 一条产品的一个维度:中文标签 + 原文。 */
export interface ProductFact {
  label: string;
  text: string;
}

/** 一条产品的六维度全文。 */
export interface ProductDetailSnapshot {
  id: string;
  name: string;
  categoryLabel: string;
  series?: string;
  lookSpecSlots: string[];
  /**
   * ★ **原文,一个字的改写都没有。** 缺的维度**不出现**(不是空串)——
   * 那种条目(如 #36 空占位)就是"源资料没写",模型该知道而不是对着空串编。
   */
  facts: ProductFact[];
  /** 源资料写的非维度说明(#36 那种"待补"占位)。有才出现。 */
  notes?: string[];
}

export interface ProductLibrary {
  overview(): ProductLibraryOverview;
  /**
   * 按 id 取一条。**没有就是 `undefined`,不抛错**——模型给错一个 id 是正常情况
   * (它可能记错了、或者库里确实没有),那是要告诉它的事,不是故障。
   */
  find(id: string): ProductDetailSnapshot | undefined;
}
