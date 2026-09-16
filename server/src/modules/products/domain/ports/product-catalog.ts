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
 * ⚠️ **不含 `health`**:体检报告是给我们修数据看的,模型不需要,进上下文只是白烧 token。
 */
import type { DimensionKey } from '../entities/product.js';
import type { LibraryNote, MatchingGuide } from '../entities/library.js';

/** 一行索引。给模型**挑**用,不含六维度全文——全文走 `find()`。 */
export interface ProductSummary {
  id: string;
  number: number;
  name: string;
  categoryId: string;
  categoryLabel: string;
  series?: string;
  lookSpecSlots: string[];
  /**
   * 三个维度的**首句**(不是截断到 N 字)。
   * ★ 取首句而不是硬截:品牌资料里一句话就是一个意思,
   *   截半个句子给模型比不给更容易被误读。
   */
  textureFirst: string;
  skinTypesFirst: string;
  occasionsFirst: string;
}

/** 一条产品的六维度全文。 */
export interface ProductDetail {
  id: string;
  number: number;
  name: string;
  categoryId: string;
  categoryLabel: string;
  series?: string;
  lookSpecSlots: string[];
  dimensions: { key: DimensionKey; label: string; text: string }[];
  /** 源资料写的非维度说明(#36 那种"待补"占位)。有才出现。 */
  notes?: string[];
}

/** 库级信息:元信息 + 类目 + 速查表 + 说明书 + 全部条目的一行索引。 */
export interface LibraryOverview {
  id: string;
  name: string;
  brand: string;
  categories: {
    id: string;
    label: string;
    count: number;
    statedCount: number | null;
    lookSpecSlots: string[];
  }[];
  matchingGuide: MatchingGuide;
  /** 第十一节的补充说明(含酸/含变性乙醇/护肤线与彩妆的联动…)。原样带出去。 */
  notes: LibraryNote[];
  products: ProductSummary[];
}

export interface ProductCatalog {
  overview(): LibraryOverview;
  /** 按 id 取一条;没有就是 `undefined`(**不抛错**——查不到是正常结果,不是故障)。 */
  find(id: string): ProductDetail | undefined;
}
