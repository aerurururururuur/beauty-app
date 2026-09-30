/**
 * application/products-view.ts —— ★ **本模块唯一的投影点**(§6)。
 *
 * 输入是领域类型(`Product` / `ProductLibrary`),输出是"往外给的样子"。
 * **只有这里**决定"哪些字段出得去、长什么样";`domain/` 里不该出现第二个这样的地方。
 *
 * ★★ **本文件有两位读者,两条路各走各的**(2026-09-30 数字美妆台接过来之后):
 *
 *   | 读者 | 函数 | 形状从哪来 | 取舍 |
 *   | --- | --- | --- | --- |
 *   | 模型(`list_products` / `read_product`) | `toLibraryView` / `toProductSummaryView` / `toProductDetailView` | 本文件里的 `interface` | **省 token**:正文只留首句、六维只留三句 |
 *   | 界面(`GET /api/products` ×2) | `toCatalogView` / `toProductDetailResponse` | `domain/schemas/api/products-view.ts` 的 zod | **要能直接渲染**:原文给全、色号给全 |
 *
 *   两条路**刻意不同形**,别试图合并:模型只需要事实(所以 `toProductDetailView` 把
 *   `wording` 并进 `dimensions[].text`,省掉出处标记);界面要能分得清哪句是品牌说的
 *   (所以详情那条口 `dimensions` / `wording` **两段分开给**)。
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
import type { DimensionKey } from '../domain/entities/product.js';
import type { LibraryCategory, ProductLibrary } from '../domain/entities/library.js';
import type {
  CatalogView,
  ProductCardView,
  ProductDetailResponse,
  ProductDimensionView,
  ShadesView,
} from '../domain/schemas/index.js';

/** 整库索引里的一行。字段的含义见文件头。 */
export interface ProductSummaryView {
  /** 产品 id。模型拿它去 `find`。 */
  id: string;
  /**
   * 品牌资料里的编号(1–57)。展示用,不参与检索。
   * ★ **可空**:手写层补录的条目源资料里没有编号(见 `content.ts` 的 `number`)。
   */
  number: number | null;
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

/**
 * 一个类目在索引里的样子。
 *
 * ✏️ `statedCount`(资料自报的款数)已经删掉。它当初是拿来和 `count` 对表的,
 * 而那张表在重构后**不再成立**:展示类目与 docx 章节已经不是一个东西
 * (展示的「提前护理」= docx 的「护肤类」+ 手写层的 3 张系列卡)。
 * "docx 自报 vs 实解析"这件事还在算,但它的归属是**源文档的章节**,
 * 见 `library.health.docxSections` —— 那里才说得通。
 */
export interface CategoryView {
  id: string;
  label: string;
  /** **实际条数**(不是源资料自报的)。 */
  count: number;
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
  /** 见 `ProductSummaryView.number`:补录条目没有编号。 */
  number: number | null;
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
    count: c.actualCount,
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

/**
 * 一位读者(模型或界面)能看到的**一个维度的一段话**。
 *
 * ★ 固定按 `DIMENSION_KEYS` 的顺序出(它自己那一行写着「顺序即展示顺序」),缺的那项
 *   **不出现**(不是空串)。★ 遍历的就是 `DIMENSION_KEYS` 本身:此前遍历的是
 *   `DIMENSION_LABELS` 的键,注释说的却是 DIMENSION_KEYS —— 两份顺序碰巧一样,
 *   于是"说一套做一套"一直没被照见。要看顺序,只有一处可看。
 *
 * ★★ `withWording` 是**两位读者唯一的差别**,不是"要不要多加一个参数"的取舍:
 *   · **给模型的**并(`true`):模型只需要事实,把两段并成一段省 token,也免得它
 *     把"补充"当成另一件产品在说。并法固定成 `原文 + 换行 + （补充）：手写`。
 *   · **给界面的**不并(`false`):本仓那条「谁说的」红线要求界面上分得清哪句是品牌资料、
 *     哪句是我们补的 —— 后者是 `products/overlay/` 里手写的,与原文并排放会看起来一样权威。
 */
function dimensionViews(p: Product, withWording: boolean): ProductDimensionView[] {
  const out: ProductDimensionView[] = [];
  for (const key of DIMENSION_KEYS) {
    const text = dimensionText(p, key, withWording);
    if (text !== '') out.push({ key, label: DIMENSION_LABELS[key], text });
  }
  return out;
}

/** 一格维度的成品文本。并与不并的规则见 `dimensionViews`。 */
function dimensionText(p: Product, key: DimensionKey, withWording: boolean): string {
  const original = (p.dimensions[key] ?? '').trim();
  const extra = (p.wording?.[key] ?? '').trim();
  if (withWording) {
    if (extra === '') return original;
    if (original === '') return `（补充）：${extra}`;
    return `${original}\n（补充）：${extra}`;
  }
  return original;
}

/**
 * 一条产品的完整六维度 —— **给模型的那一路**。
 *
 * ★ `wording` **并进** `dimensions[].text`(理由见 `dimensionViews`),所以
 *   `ProductFact` 与 `agent/domain/ports/product-library.ts` 一个字都不用改:
 *   模型看到的还是"六维各一段话",只是其中几段里多了一行落款为「补充」的话。
 */
export function toProductDetailView(p: Product, library: ProductLibrary): ProductDetailView {
  const detail: ProductDetailView = {
    id: p.id,
    number: p.number,
    name: p.name,
    categoryId: p.category,
    categoryLabel: labelOf(library, p.category),
    lookSpecSlots: p.derived.lookSpecSlots,
    dimensions: dimensionViews(p, true),
  };
  if (p.derived.series) detail.series = p.derived.series;
  if (p.notes && p.notes.length > 0) detail.notes = p.notes;
  return detail;
}

// ── 给界面的那一路 ──────────────────────────────────────────────────────────
//
// 读者是 `vue/` 的「数字美妆台」。形状由 `domain/schemas/api/products-view.ts` 定,
// 这里的职责只有一件:**领域类型 → 那个形状**,不判断、不取数(§2)。

/** 一件产品的试色面板。`shades` 缺省 ⇒ `undefined`(不是空面板)。 */
function shadesView(p: Product): ShadesView | undefined {
  if (!p.shades) return undefined;
  // 逐格重抄一遍**是刻意的**:`shadeSchema` 与 `shadeViewSchema` 形状相同但**是两份**,
  // 将来给界面多透一格(或挡掉一格)时,改的是这里与那份 schema,不牵动内容文件的形状。
  return {
    label: p.shades.label,
    shades: p.shades.shades.map((s) => ({
      code: s.code,
      name: s.name,
      hex: s.hex,
      hexApprox: true,
      tone: s.tone,
      toneKey: s.toneKey,
      ...(s.lightness !== undefined ? { lightness: s.lightness } : {}),
      ...(s.saturation !== undefined ? { saturation: s.saturation } : {}),
    })),
  };
}

/**
 * 一条产品 → 目录卡。
 *
 * ★ `text` 取**手写层那句**优先,没有才退回原文首句。理由:那句是**为目录卡写的**
 *   (前端 `kb/catalog.js` 里原来那张卡的描述,短、像标题),而「质地/妆效」的原文是
 *   一整段。卡片上摆一整段的后果是一行高低不齐的卡,而不是数据错。
 */
export function toProductCardView(p: Product, library: ProductLibrary): ProductCardView {
  const blurb = (p.blurb ?? '').trim();
  return {
    id: p.id,
    name: p.name,
    categoryId: p.category,
    categoryLabel: labelOf(library, p.category),
    text: blurb !== '' ? blurb : firstSentence(p.dimensions.texture ?? ''),
    shadeCount: p.shades?.shades.length ?? 0,
    // ★ 判据是**内容文件里有没有 `shades`**,不是 `shadeCount > 0` —— 只有前者才分得清
    //   「这类产品没有色号」与「色号还没收录」(见 API schema 那一格的说明)。
    hasShades: p.shades !== undefined,
  };
}

/**
 * 整库 → 界面的目录。
 *
 * ⚠️ 这是"整库一次给全"(66 条 + 全部色号,几十 KB)。同 `toLibraryView` 那条警告:
 *   **几千条就得改成分片**,那时先改这里,别让它留在原地假装还能扩展。
 */
export function toCatalogView(library: ProductLibrary, products: readonly Product[]): CatalogView {
  const shades: Record<string, ShadesView> = {};
  for (const p of products) {
    const view = shadesView(p);
    if (view) shades[p.id] = view;
  }

  // 分类树:分组 → 类目,**顺序即 `library.groups` / `library.categories` 的顺序**
  // (`order` 字段由导入器排好,这里不再排一遍 —— 排两遍就有两个真相)。
  const groups = library.groups.map((g) => ({
    id: g.id,
    label: g.label,
    children: library.categories
      .filter((c) => c.group === g.id)
      .map((c) => ({ id: c.id, label: c.label })),
  }));

  return {
    groups,
    products: products.map((p) => toProductCardView(p, library)),
    shades,
  };
}

/**
 * 一条产品 → 界面详情。
 *
 * ★ `dimensions` 与 `wording` **两段分开**(`withWording: false` 那一支)—— 这是
 *   界面这条路区别于模型那条路的**唯一**一处,理由见 `dimensionViews` 的文件头。
 */
export function toProductDetailResponse(p: Product, library: ProductLibrary): ProductDetailResponse {
  const detail: ProductDetailResponse = {
    id: p.id,
    name: p.name,
    categoryId: p.category,
    categoryLabel: labelOf(library, p.category),
    number: p.number,
    dimensions: dimensionViews(p, false),
    // 手写补充那几格:同一套维度键、同样的顺序,缺的那项不出现。
    wording: DIMENSION_KEYS.map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      text: (p.wording?.[key] ?? '').trim(),
    })).filter((d) => d.text !== ''),
  };
  const shades = shadesView(p);
  if (shades) detail.shades = shades;
  return detail;
}
