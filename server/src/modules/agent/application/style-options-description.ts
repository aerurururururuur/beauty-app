/**
 * agent/application/style-options-description.ts —— 把「可选风格有哪些」讲给模型。
 *
 * ✏️ 2026-10-02:`styleId` 从**必填**降为**可选参考**(步骤由模型自己写),这份清单
 *   照旧每轮都印 —— 它是模型挑颜色时唯一的依据,不填也只是"完全自己写"。
 *
 * ★ 它是给 `propose_look` 那个入参 `styleId` 配的一句状态:没有它,模型手上
 *   就只有一个要填的 id 字符串。这层信息 JSON Schema 表达不了(`enum` 能表达
 *   "取值限定在这几个里",但表达不了"这几条各自是什么风格",见 `definitions.ts`
 *   里 `styleId` 那一段),所以清单只能印在给模型看的话里。
 *
 * ★ **两个读者,一份说法**:
 *   ① `system-prompt.ts` 的「当前状态」那一行;
 *   ② `propose-look.ts` 校验失败时那句错误(「错误消息即 prompt」,§7.3 第 4 条)。
 *   两处**必须逐字同一份清单**——模型正是拿这两处互相对照来改对 `styleId` 的,
 *   漂开就会出现"提示里有的、报错里没有"。所以渲染函数只有这一份,别在别处再写一遍。
 *
 * ✏️ **2026-09-30:这份清单不再随场合变。** 此前它按场合印 4 条候选
 *   (`SCENE_STYLES`),现在印**全部 21 条**——场合与风格是两张各自独立的预设表,
 *   自由组合。场合还没有时也不用再分档列了,所以这个函数不再收 `occasion`。
 *
 * ⚠️ **每轮都进系统提示(约 300 字符),这是刻意的代价**:换来的是模型不必
 *   "猜一个 id → 被拒一次 → 照错误消息改",省掉一个白花回合。
 */
import { STYLE_LIBRARY } from '../../styling/index.js';

/**
 * 那句清单的**开头几个字**。
 * ⚠️ 系统提示与 `propose_look` 的 `styleId` 那一格都是**按这个名字去找它**,
 * 改文案要一起改(`test/agent-tools.test.ts` 的「风格清单」那组钉着这件事)。
 */
export const STYLE_OPTIONS_HEAD = '可选风格';

/**
 * 全部配方,写成 `id(中文名) / id(中文名)…`。
 * ★ 带中文名是因为模型是**按语义**挑的,只给 id 它得自己猜哪个是哪个。
 */
export function styleOptionsHint(): string {
  return STYLE_LIBRARY.map((style) => `${style.id}(${style.name})`).join(' / ');
}

/** 「当前状态」里那一行。 */
export function describeStyleOptions(): string {
  return `${STYLE_OPTIONS_HEAD}:${styleOptionsHint()}`;
}
