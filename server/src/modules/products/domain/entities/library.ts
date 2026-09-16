/**
 * domain/entities/library.ts —— 内容库本身的元信息(对应 `library.json`)。
 *
 * 一个"库"= `products/` 下的一个目录。现在只有一个(`ysl-property`),
 * 以后加第二个库 = 加一个平级目录,不需要动这里的类型。
 */
import type { DimensionKey } from './product.js';

/** 一个类目在库里的登记。id 是 slug(目录名),label 是品牌资料里的中文名。 */
export interface LibraryCategory {
  id: string;
  label: string;
  order: number;
  /** ★ 品牌资料**自称**的款数。对不上就是资料的问题,不是解析的问题。 */
  statedCount: number | null;
  actualCount: number;
  /** 该类目下所有产品对上妆面槽位的**并集**。空 = 该类目在 LookSpec 里没有位置。 */
  lookSpecSlots: string[];
  series: { title: string; note?: string }[];
}

/** 第十节那张「品类匹配逻辑速查表」。`cells` 与 `columns` 按位置对应。 */
export interface MatchingGuide {
  columns: string[];
  rows: { condition: string; cells: string[] }[];
}

export interface LibraryNote {
  label: string;
  text: string;
}

/**
 * 体检报告。**由导入器算出来的,不是人工标注的**——所以"修好源文档再重导"能自然清零。
 *
 * ★ 它**不进上下文**(模型不需要,进去只是白烧 token),用途有两个:
 *   ① 启动时打一行日志,让已知的数据债保持可见,而不是悄悄跟着上线;
 *   ② 让人打开 `library.json` 就能知道该去修什么。
 */
export interface LibraryHealth {
  statedVsActual: {
    perCategory: { id: string; label: string; stated: number | null; actual: number; ok: boolean }[];
    statedTotals: { line: number; value: number }[];
    actualTotal: number;
  };
  /** 必填维度缺失。 */
  missingDimensions: { id: string; number: number; missing: DimensionKey[] }[];
  /** 可选维度(社交反馈)缺失。单列,因为它不是数据问题。 */
  missingOptionalDimensions: { id: string; number: number; missing: DimensionKey[] }[];
  suspectedDuplicates: { a: string; b: string; similarity: number; sameDimensions: number }[];
  shadeLeakage: { id: string; hits: string[]; where: string }[];
  /** 名字里没有拉丁字母、slug 只能拿类目兜底的条目(源资料的缺口)。 */
  missingEnglishName: { id: string; number: number; name: string }[];
}

export interface ProductLibrary {
  id: string;
  name: string;
  brand: string;
  source: { file: string; sha256: string; importedAt: string; importer: string };
  dimensions: { key: DimensionKey; label: string; optional?: boolean }[];
  categories: LibraryCategory[];
  matchingGuide: MatchingGuide;
  notes: LibraryNote[];
  health: LibraryHealth;
}
