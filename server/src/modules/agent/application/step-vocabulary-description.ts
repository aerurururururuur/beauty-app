/**
 * agent/application/step-vocabulary-description.ts —— 把「步骤名该怎么起」讲给模型。
 *
 * ★ **三个读者,一份说法**:系统提示的「当前状态」、`read_style_recipe` 的正文、
 *   `propose_look` 校验失败那句错误。清单只写这一份 —— 漂开就会出现
 *   "提示里有的、报错里没有",而模型正是拿这两处互相对照来改对的。
 *
 * ★ 名字与 `step-zones.ts` 的表是**同一份数据**(直接从那里取,不手抄):
 *   认不出来的步骤名会让那一步**没有图**,却仍然是干净的 200 —— 本仓最恨的形状。
 */
import { STEP_VOCABULARY } from './step-zones.js';

/** 那句清单的**开头几个字**。别改,除非同时改 `demo-llm.ts` 里认它的地方。 */
export const STEP_VOCABULARY_HEAD = '可用步骤名';

/** 全部规范步骤名,`A / B / C` 一行。 */
export function stepVocabularyHint(): string {
  return STEP_VOCABULARY.join(' / ');
}

/** 「当前状态」里那一行。 */
export function describeStepVocabulary(): string {
  return `${STEP_VOCABULARY_HEAD}:${stepVocabularyHint()}`;
}
