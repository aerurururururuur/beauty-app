/**
 * application/tools/read-style-recipe.ts —— `read_style_recipe` 的实现(免费,读内存)。
 *
 * ★ **它单独存在的唯一理由是「把配方正文挪到做决定之前」。** 填 `propose_look` 的
 *   `zones` 需要知道"这套配方有哪几步",而那份正文此前**只在 `propose_look` 成功之后**
 *   才进上下文(`recipeGuidance`)—— 模型是闭着眼睛填那一格的,实测**每轮必被打回一次**,
 *   代价是一次多出来的计费调用。详见 `definitions.ts` 文件头 2026-10-01 那段。
 *
 * ★ **只读、无副作用、不改会话** —— 天然可重入(`tool.ts` 约束 3),也是它与
 *   `read_product` 的差别(那个要往会话里记一笔「读过什么」,因为它有红线 §13-6 的角标义务)。
 *
 * ★ **区那一行必须显式印出来**,不能只给步骤名让模型自己推:它此前栽的正是这一步
 *   (「涂睫毛膏」要落成 `lash` 这件事它当时根本没机会知道)。印出来的那份名单与
 *   `look-spec.validator.ts` ②c 判的是**同一个集合**(都从 `requiredZonesOf` 来)。
 */
import { MEASURED_ZONE_ROLES } from '../../../makeup/index.js';
import { decoratePlan, derivePlan } from '../../../styling/index.js';
import type { PlanView, ShadeLookup } from '../../../styling/index.js';
import { READ_STYLE_RECIPE } from '../../domain/tools/definitions.js';
import { recipeGuidance } from '../recipe-guidance.js';
import { requiredZonesOf } from '../step-zones.js';
import { styleOptionsHint } from '../style-options-description.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';

/**
 * 任何一套妆面单里都必填的四格。
 * ⚠️ 它必须与 `lookSpecSchema` 里 `zones.required` **逐字相同**
 *   (`test/agent-tools.test.ts` 对着那份 schema 断言了这四个,改了这里那边会红)。
 *   眉不在 `MEASURED_ZONE_ROLES` 里(它没有色相),所以单独缀上。
 */
const ALWAYS_REQUIRED_KEYS: readonly string[] = [...MEASURED_ZONE_ROLES, 'brow'];

/** 入参里那一格。读不到就当没给,由调用方翻成"列出整池"的错误。 */
function readStyleId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)['styleId'];
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

/**
 * 一条配方的正文,渲染成模型读得懂的一段。
 * ★ 纯函数、导出给测试(`read-product.ts` 的 `renderProductDetail` 同一条先例)。
 */
export function renderStyleRecipe(plan: PlanView): string {
  // ★ 「还要求哪些区」= 配方算出来的那一份里,**去掉永远必填的四格**(它们每套都有)。
  //   ⚠️ 与 `look-spec.validator.ts` ②c 用的是同一个 `requiredZonesOf`,不是另抄一张表。
  const extra = requiredZonesOf(plan).filter((z) => !ALWAYS_REQUIRED_KEYS.includes(z.role));
  const keys = [...ALWAYS_REQUIRED_KEYS, ...extra.map((z) => z.role)];

  return [
    `配方「${plan.styleId}」(${plan.styleName}):${plan.summary}`,
    plan.keywords.length > 0 ? `关键词:${plan.keywords.join(' / ')}` : undefined,
    `共 ${plan.meta.stepCount} 步,约 ${plan.meta.minutes} 分钟。`,
    '',
    '【上妆要点】挑颜色 / 质地 / 浓度照这些来:',
    ...recipeGuidance(plan),
    '',
    '【这套配方要求妆面单里有这些区】',
    `★ \`propose_look\` 的 \`zones\` 必须**恰好**是这些键:${keys.join('、')}。`,
    `  前四格(${ALWAYS_REQUIRED_KEYS.join(' / ')})每一套都必填。`,
    ...extra.map((z) => `  ${z.role} 来自这套配方里的「${z.stepName}」这一步。`),
    '  ⚠️ **多填一个区、漏填一个区,`propose_look` 都会被拒绝**(白花一个回合)。',
    '  上面每一步后面括号里的那个名字,就是它落在的区。',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export class ReadStyleRecipeTool implements Tool {
  readonly definition = READ_STYLE_RECIPE;

  /**
   * `shades` 由组装根注入(同 `propose_look` 的第三个参数,理由见那边)。
   * ★ 本工具**必填**而不是可选:缺了它色号就没有色值,而「淡」这件事
   *   **只有色值看得出来**(色号名看不出),那份正文就白给了。
   */
  constructor(private readonly shades: ShadeLookup) {}

  async run(input: unknown, _context: ToolContext): Promise<ToolOutcome> {
    const styleId = readStyleId(input);
    // ★ **不传 `personalized`** —— 本工具读的是**配方本身**;用户特征那几张调整卡属于
    //   "这套妆为谁改的",不是"这条配方是什么"(`propose_look` 那边才叠,见它的 `personalized`)。
    const draft = styleId ? derivePlan({ styleId }) : undefined;

    if (!draft) {
      // ★ 两条失败合成一条消息(同 `propose_look` 的 `styleId` 分支):
      //   **那份清单是唯一能让他改对的东西**,分两句说反而多走一轮。
      const chosen = styleId ? `没有 \`${styleId}\` 这一条配方。` : '没有拿到 `styleId`。';
      // ⚠️ 清单 import 而来,不在这里抄第二份(见 `style-options-description.ts` 文件头)。
      return {
        content: `${chosen}请从「当前状态」里「可选风格」那一行原样挑一个再调一次。可选:${styleOptionsHint()}。`,
        isError: true,
      };
    }

    // ★ 两步同 `propose_look`:纯推导出的 `PlanDraft` 补上色值才是对外的形状。
    return { content: renderStyleRecipe(decoratePlan(draft, this.shades)) };
  }
}
