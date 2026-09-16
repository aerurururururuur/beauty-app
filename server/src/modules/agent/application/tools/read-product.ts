/**
 * application/tools/read-product.ts —— `read_product` 的实现(免费,读内存 + 记一笔)。
 *
 * ★ 依赖经构造函数注入,由组装根把 products 的 `ProductCatalog` 包一层喂进来——
 *   **本文件(乃至整个 agent 模块)不 import products**(§7.1)。
 *
 * ★ **它是本模块唯一一处"工具带累计副作用"的地方**,所以 `tool.ts` 约束 3
 *   (可重入)在这里才真的受力(其余工具要么只读、要么是"设值"式幂等写)。
 *   受力点就是 `addConsultedProduct` 的**按 id 去重**,以及它重复时**返回同一个
 *   `session` 引用**——那边有详细注释,别在这里绕过去重。
 *
 * ★ **失败用 `isError`,不抛错**(`tool.ts` 约束 1)。模型给错一个 id 是**正常情况**
 *   (它可能记错了、或者库里确实没有),要说的是"没有这条",不是"服务出故障了"。
 *   observation 里还要**指一条回去的路**(去 `list_products` 里照抄 id),
 *   否则模型的典型反应是原地重试同一个错 id 或者干脆放弃。
 */
import { READ_PRODUCT } from '../../domain/tools/definitions.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import type { ProductDetailSnapshot, ProductLibrary } from '../../domain/ports/product-library.js';
import { addConsultedProduct } from '../../domain/entities/session.js';

/** 从入参里取 id。★ 入参是 `unknown`(注册表按名字分发,不保证形状),得自己挡。 */
function readId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = (input as { id?: unknown }).id;
  if (typeof raw !== 'string') return undefined;
  const id = raw.trim();
  return id === '' ? undefined : id;
}

/** 一条产品的六维度全文,渲染成给模型读的文本。 */
export function renderProductDetail(detail: ProductDetailSnapshot): string {
  const lines: string[] = [`${detail.name}(${detail.categoryLabel})`];
  if (detail.series) lines.push(`所属系列:${detail.series}`);
  if (detail.lookSpecSlots.length > 0) {
    lines.push(`可对应妆面:${detail.lookSpecSlots.join('、')}`);
  }
  lines.push('');

  for (const fact of detail.facts) lines.push(`【${fact.label}】${fact.text}`);

  if (detail.notes && detail.notes.length > 0) {
    lines.push('');
    lines.push('【源资料附注】');
    for (const note of detail.notes) lines.push(`- ${note}`);
  }

  lines.push('');
  lines.push(
    '★ 转述「社交平台用户反馈摘要」时请说明它出自**品牌资料**,不要讲成真实用户评价或中立测评。',
  );
  return lines.join('\n');
}

export class ReadProductTool implements Tool {
  readonly definition = READ_PRODUCT;

  constructor(private readonly products: ProductLibrary) {}

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    const id = readId(input);
    if (id === undefined) {
      return {
        content: '没有拿到产品 id。请先用 `list_products` 拿到索引,再把它给的 id 原样传过来。',
        isError: true,
      };
    }

    const detail = this.products.find(id);
    if (!detail) {
      return {
        content:
          `产品库里没有 id 为「${id}」的条目。` +
          '**不要凭这个 id 推测它的性质**——请先调 `list_products` 拿到真实索引,' +
          '照抄那上面的 id;如果那里确实没有你要找的东西,就如实告诉用户库里没有,不要推荐别的产品顶上。',
        isError: true,
      };
    }

    const content = renderProductDetail(detail);

    // ★ 记账(红线 §13-6 那个角标靠它)。按 id 去重;重复读时 `addConsultedProduct`
    //   返回**同一个对象**,于是这里不返回 `session` —— 满足 `tool.ts` 的
    //   「只在真的改了时才返回」,也让整轮重放不产生重复条目。
    const next = addConsultedProduct(context.session, {
      id: detail.id,
      name: detail.name,
      categoryLabel: detail.categoryLabel,
    });

    return next === context.session ? { content } : { content, session: next };
  }
}
