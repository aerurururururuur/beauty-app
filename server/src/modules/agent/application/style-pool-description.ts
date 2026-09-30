/**
 * agent/application/style-pool-description.ts —— 把「这个场合能挑哪些风格」讲给模型。
 *
 * ★ 它是给 `propose_look` 那个必填入参 `styleId` 配的一句状态。
 *   没有它,模型手上就只有一个要填的 id 字符串,而**候选池随场合变**——
 *   这层依赖 JSON Schema 表达不了(`enum` 是按字段写死的,`oneOf` 按另一个字段
 *   分支模型也读不出来,见 `domain/tools/definitions.ts` 里 `styleId` 那一段),
 *   所以池子只能印在给模型看的话里。
 *
 * ★ **两个读者,一份说法**:
 *   ① `system-prompt.ts` 的「当前状态」那一行;
 *   ② `propose-look.ts` 校验失败时那句错误(「错误消息即 prompt」,§7.3 第 4 条)。
 *   两处**必须逐字同一份清单**——模型正是拿这两处互相对照来改对 `styleId` 的,
 *   漂开就会出现"提示里有的、报错里没有"。所以渲染函数只有这一份,别在别处再写一遍。
 *
 * ⚠️ **场合还不知道时列全部八档**,不是什么都不列:纯对话那条路(没有表单)
 *   场合是**模型自己判**的,它判完场合紧接着就要挑 `styleId`,中间没有第二次
 *   读提示词的机会。不列全,它只能先猜一个 id、被拒一次、再照错误消息改——
 *   白花一个回合,而那个回合可能就是用户失去耐心的那个。
 */
import { OCCASIONS, SCENE_RULES } from '../../shared/index.js';
import type { Occasion } from '../../shared/index.js';
import { styleById, stylePoolFor } from '../../styling/index.js';

/**
 * 一个场合的候选风格,写成 `id(中文名) / id(中文名)`。
 * ★ 带中文名是因为模型是**按语义**挑的,只给 id 它得自己猜哪个是哪个。
 */
export function stylePoolHint(occasion: Occasion): string {
  return stylePoolFor(occasion)
    .map((id) => {
      const style = styleById(id);
      return style ? `${id}(${style.name})` : id;
    })
    .join(' / ');
}

/** 「当前状态」里那一行。`occasion` 缺省 = 还没定。 */
export function describeStylePool(occasion: Occasion | undefined): string {
  if (occasion !== undefined) {
    return `风格池(${SCENE_RULES[occasion].cn} ${occasion}):${stylePoolHint(occasion)}`;
  }
  return [
    '风格池(场合还没定 ⇒ 下面是全部八档;先定场合,再从那一行里挑):',
    ...OCCASIONS.map((o) => `- ${SCENE_RULES[o].cn}(${o}):${stylePoolHint(o)}`),
  ].join('\n');
}
