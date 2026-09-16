/**
 * application/tools/list-products.ts —— `list_products` 的实现(免费,读内存)。
 *
 * ★ 依赖经构造函数注入,由 `compose.ts` 装配、由组装根 `src/index.ts` 把 products 的
 * `ProductCatalog` 包一层喂进来——**本文件(乃至整个 agent 模块)不 import products**(§7.1)。
 * 形状见 `domain/ports/product-library.ts`(原始类型重写,不借那边的类型)。
 *
 * ★ **这里渲染出来的文本就是模型对产品库的全部认知。** 它没渲染的东西,模型不知道;
 *   它渲染得含糊的东西,模型会照着含糊地推。所以:
 *   - **速查表的「避开品类」列必须渲染**——那是这张表最有用的一列,也是最容易漏的一列;
 *   - **类目条数用"实际有多少条"**,不复述源资料那个对不上的自称数字;
 *   - **`lookSpecSlots` 为空是常态**(护肤/防晒/妆前/定妆在 `LookSpec` 里没有对应字段),
 *     要有一句话把这个边界说清楚,否则模型会以为"没标槽位 = 这条不能用"。
 *
 * ★ **只读,无副作用,天然可重入**(`tool.ts` 约束 3)。
 */
import { LIST_PRODUCTS } from '../../domain/tools/definitions.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import type {
  ProductIndexEntry,
  ProductLibrary,
  ProductLibraryOverview,
} from '../../domain/ports/product-library.js';

/** 一行索引:一条产品占 3 行(`id`/名称/类目 一行,三个维度的首句各一行)。 */
function renderEntry(entry: ProductIndexEntry): string[] {
  const head = [`- \`${entry.id}\` ｜ ${entry.name} ｜ ${entry.categoryLabel}`];
  if (entry.series) head[0] += ` ｜ ${entry.series}`;
  if (entry.lookSpecSlots.length > 0) head[0] += ` ｜ 可对应妆面:${entry.lookSpecSlots.join('、')}`;

  const lines = [head[0] ?? ''];
  // 空的首句不渲染成空行:那是"源资料这条没写",不是"这条没有这个性质"。
  if (entry.textureFirst) lines.push(`    质地/妆效:${entry.textureFirst}`);
  if (entry.skinTypesFirst) lines.push(`    适用肤质:${entry.skinTypesFirst}`);
  if (entry.occasionsFirst) lines.push(`    适用天气/场景:${entry.occasionsFirst}`);
  return lines;
}

/** 速查表渲染成 markdown 表。`columns[0]` 是条件列,`cells` 与其余列按位置对应。 */
function renderMatchingGuide(guide: ProductLibraryOverview['matchingGuide']): string[] {
  const [conditionCol, ...valueCols] = guide.columns;
  const lines = [
    `| ${guide.columns.join(' | ')} |`,
    `| ${guide.columns.map(() => '---').join(' | ')} |`,
  ];
  for (const row of guide.rows) {
    // 行里少了格就补空——宁可显示一个空格,也不要让整张表错位(cells 与 columns 按位置对应)。
    const cells = valueCols.map((_, i) => row.cells[i] ?? '');
    lines.push(`| ${[row.condition, ...cells].join(' | ')} |`);
  }
  if (conditionCol === undefined) lines.push('(速查表为空)');
  return lines;
}

export class ListProductsTool implements Tool {
  readonly definition = LIST_PRODUCTS;

  constructor(private readonly products: ProductLibrary) {}

  async run(_input: unknown, _context: ToolContext): Promise<ToolOutcome> {
    // ★ 同步调用,但 `run` 的签名是 async(`tool.ts` 的统一形状)。
    //   这里**不 await 任何东西**——库在内存里,这是刻意的,见端口文件头。
    const overview = this.products.overview();

    const categories = overview.categories
      .map((c) => `${c.label} ${c.count} 条`)
      .join(' · ');

    const lines: string[] = [
      `品牌产品库:${overview.name}(${overview.brand})`,
      '',
      `类目:${categories}`,
      '',
      '【品类匹配逻辑速查表】',
      ...renderMatchingGuide(overview.matchingGuide),
      '',
      '★ 最右那列「避开品类」是负向信号,同样要读。',
      '',
    ];

    if (overview.notes.length > 0) {
      lines.push('【补充说明】');
      for (const note of overview.notes) lines.push(`- ${note.label}:${note.text}`);
      lines.push('');
    }

    lines.push(
      `【产品索引】共 ${overview.products.length} 条。` +
        '行首反引号里的是 id,**原样照抄**传给 `read_product`;下面三行是各维度的首句,详情要读全文。',
      ...overview.products.flatMap(renderEntry),
      '',
      '⚠️ 上面标了「可对应妆面」的才直接对应妆面的某一笔(底妆、唇、颊、眼影、眉)。',
      '**没标的不是"不能用"**——护肤、防晒、妆前、定妆这些在妆面结构里本来就没有对应字段,',
      '它们在妆前打底、持妆这些环节里仍然是有用的建议,只是不构成妆面上的某一笔。',
      '需要哪条的完整资料(成分、预警、用户反馈)就用 `read_product` 读它。',
    );

    return { content: lines.join('\n') };
  }
}
