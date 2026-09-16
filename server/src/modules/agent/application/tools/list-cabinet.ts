/**
 * application/tools/list-cabinet.ts —— `list_cabinet` 的实现(免费,有一次 IO)。
 *
 * ★ 依赖经构造函数注入,由 `compose.ts` 装配、由组装根 `src/index.ts` 把 cabinet 的
 * `listByUser` 包一层喂进来——**本文件(乃至整个 agent 模块)不 import cabinet**(§7.1)。
 * 同 `AddCosmetic({ items, users })` 的写法。
 *
 * 空清单要**明确说是正常的**:模型看到一个空列表,典型反应是换个说法反复重试,
 * 或者去问用户"你是不是没登记"——两者都在浪费轮次。observation 里直接掐掉这条路。
 */
import { LIST_CABINET } from '../../domain/tools/definitions.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import type { CosmeticReader } from '../../domain/ports/cosmetic-reader.js';

/** 单条渲染成一行:名称 + 括号里的自定义特性。 */
function renderItem(item: { name: string; attributes: readonly { label: string; value: string }[] }): string {
  if (item.attributes.length === 0) return `- ${item.name}`;
  const attrs = item.attributes.map((a) => `${a.label}:${a.value}`).join('、');
  return `- ${item.name}(${attrs})`;
}

export class ListCabinetTool implements Tool {
  readonly definition = LIST_CABINET;

  constructor(private readonly cosmetics: CosmeticReader) {}

  async run(_input: unknown, context: ToolContext): Promise<ToolOutcome> {
    // 读失败(存储故障)不在这里吞:`agent-loop` 有唯一的兜底捕获,
    // 由一个地方决定"故障怎么告诉模型",比每个工具各写一遍可靠。
    const items = await this.cosmetics.listByUser(context.session.userId);

    if (items.length === 0) {
      return {
        content:
          '用户的化妆品清单是空的(她还没在「我的化妆品」里登记过)。' +
          '这是正常状态,**不要重试**,也不要追问她为什么不登记——直接跳过这一步,按场合和肤色配色即可。',
      };
    }

    return {
      content: [
        `用户登记过的化妆品(${items.length} 件):`,
        ...items.map(renderItem),
        '',
        '配色时优先参考这些已有产品;上面的「特性」是用户自己填的,没填的不要假设。',
      ].join('\n'),
    };
  }
}
