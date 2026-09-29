/**
 * application/products-view.ts —— ★ **本模块唯一的投影点**(§6)。
 *
 * 输入是领域类型(`Product` / `ProductLibrary`),输出是"往外给的样子"。
 * **只有这里**决定"哪些字段出得去、长什么样";`domain/` 里不该出现第二个这样的地方。
 *
 * ── 为什么投影在 application/ 而不是 `domain/ports/` ─────────────────────────
 * 它原先就在端口文件里(`ProductCatalog` 同时声明了 `LibraryOverview` /
 * `ProductSummary` / `ProductDetail` 三个接口)。那样写的后果不是"多几个类型",
 * 而是**把视图冻结成了契约**:端口一改接口,所有实现都得跟着动;
 * 而实际会改的是**给模型看的字段**(加一维、换措辞、省 token),
 * 那件事与"目录怎么取数"毫无关系。现在加字段只动本文件。
 *
 * ★ **`ProductSummary` 就是「整库索引」的一行**,一次给全 57 条。
 *   它存在的唯一理由是**省 token**:正文只留首句,六维度里只留三句,
 *   完整原文由模型按需 `find(id)` 取。所以这里每加一个字段都是**乘 57** 的账,
 *   加之前先想想它配不配。
 *
 * ⚠️ **本文件不做 I/O、不读盘**(§2)。`library` / `products` 都是调用方已经拿在手上的值。
 */
import type { Product } from '../domain/entities/product.js';
import { DIMENSION_KEYS, DIMENSION_LABELS } from '../domain/entities/product.js';
import type { LibraryCategory, ProductLibrary } from '../domain/entities/library.js';

/** 整库索引里的一行。字段的含义见文件头。 */
export interface ProductSummaryView {
  /** 产品 id。模型拿它去 `find`。 */
  id: string;
  /** 品牌资料里的编号(1–57)。展示用,不参与检索。 */
  number: number;
  name: string;
  /** 类目 id = 目录名。 */
  categoryId: string;
  /** 类目的中文名。 */
  categoryLabel: string;
  /** 这款产品能用的 look 槽位。 */
  lookSpecSlots: string[];
  /** 质地/妆效的**首句**。 */
  textureFirst: string;
  /** 适用肤质的**首句**。 */
  skinTypesFirst: string;
  /** 适用天气/场景的**首句**。 */
  occasionsFirst: string;
  /** 系列名。**缺省不出现**(不是空串)。 */
  series?: string;
}

/** 一个类目在索引里的样子。`count` 是**实际条数**,`statedCount` 是资料里自报的。 */
export interface CategoryView {
  id: string;
  label: string;
  count: number;
  /** ★ 可空:源资料里本来就没写这个数(`z.number().nullable()`),不是 0。 */
  statedCount: number | null;
  lookSpecSlots: string[];
}

export interface LibraryView {
  id: string;
  name: string;
  brand: string;
  categories: CategoryView[];
  /** 第十节那张「品类匹配逻辑速查表」。 */
  matchingGuide: ProductLibrary['matchingGuide'];
  notes: ProductLibrary['notes'];
  products: ProductSummaryView[];
}

/** 一个维度的一行。`text` 是品牌资料原文,一个字都没改写。 */
export interface DimensionView {
  key: string;
  label: string;
  text: string;
}

export interface ProductDetailView {
  id: string;
  number: number;
  name: string;
  categoryId: string;
  categoryLabel: string;
  lookSpecSlots: string[];
  dimensions: DimensionView[];
  series?: string;
  notes?: string[];
}

/**
 * 取**首句**。`。!?` 与换行都算句读,都取不到就整段(短文本本来就是一句)。
 *
 * ★ 取首句而不是截断到 N 字:品牌资料里一句话就是一个意思,
 *   截半句给模型比不给更容易被误读。
 */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const m = /^[^。！？!?\n]*[。！？!?]?/.exec(trimmed);
  return (m?.[0] ?? trimmed).trim();
}

/** 类目 id → 中文名。查不到就退回 id(宁可显示得丑,也不要让整条产品消失)。 */
function labelOf(library: ProductLibrary, categoryId: string): string {
  const hit = library.categories.find((c) => c.id === categoryId);
  return hit?.label ?? categoryId;
}

function categoryView(c: LibraryCategory): CategoryView {
  return {
    id: c.id,
    label: c.label,
    // ⚠️ `count` 取的是 `actualCount`(**实际扫到的**),不是 `statedCount`(资料里自报的)。
    //    两者在 `loadLibrary` 里已经被校验过必须相等,所以这里不会真的分叉;
    //    但万一校验被绕过,给模型的应该是**实际存在**的那个数。
    count: c.actualCount,
    statedCount: c.statedCount,
    lookSpecSlots: c.lookSpecSlots,
  };
}

/** 一条产品 → 索引里的一行。 */
export function toProductSummaryView(p: Product, library: ProductLibrary): ProductSummaryView {
  const summary: ProductSummaryView = {
    id: p.id,
    number: p.number,
    name: p.name,
    categoryId: p.category,
    categoryLabel: labelOf(library, p.category),
    lookSpecSlots: p.derived.lookSpecSlots,
    textureFirst: firstSentence(p.dimensions.texture ?? ''),
    skinTypesFirst: firstSentence(p.dimensions.skinTypes ?? ''),
    occasionsFirst: firstSentence(p.dimensions.occasions ?? ''),
  };
  if (p.derived.series) summary.series = p.derived.series;
  return summary;
}

/**
 * 整库 → 给模型的索引。
 *
 * ⚠️ 这里是"整库索引一次给全"。57 条还撑得住;**几千条就得改成分片检索,
 * 那种时候先改这里**,别把它留在原地假装还能扩展。
 */
export function toLibraryView(library: ProductLibrary, products: readonly Product[]): LibraryView {
  return {
    id: library.id,
    name: library.name,
    brand: library.brand,
    categories: library.categories.map(categoryView),
    matchingGuide: library.matchingGuide,
    notes: library.notes,
    products: products.map((p) => toProductSummaryView(p, library)),
  };
}

/** 一条产品的完整六维度。 */
export function toProductDetailView(p: Product, library: ProductLibrary): ProductDetailView {
  const detail: ProductDetailView = {
    id: p.id,
    number: p.number,
    name: p.name,
    categoryId: p.category,
    categoryLabel: labelOf(library, p.category),
    lookSpecSlots: p.derived.lookSpecSlots,
    // 固定按 DIMENSION_KEYS 的顺序出(它自己那一行写着「顺序即展示顺序」),缺的那项
    // **不出现**(不是空串)。★ 遍历的就是 DIMENSION_KEYS 本身:此前遍历的是
    // `DIMENSION_LABELS` 的键,注释说的却是 DIMENSION_KEYS —— 两份顺序碰巧一样,
    // 于是"说一套做一套"一直没被照见。要看顺序,只有一处可看。
    dimensions: DIMENSION_KEYS.filter((key) => (p.dimensions[key] ?? '').trim() !== '').map(
      (key) => ({ key, label: DIMENSION_LABELS[key], text: p.dimensions[key] ?? '' }),
    ),
  };
  if (p.derived.series) detail.series = p.derived.series;
  if (p.notes && p.notes.length > 0) detail.notes = p.notes;
  return detail;
}
