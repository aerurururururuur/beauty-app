/**
 * application/analysis-messages.ts —— 读图那几句**唯一的一份说法**。
 *
 * ⚠️ 类型必须是全函数 `Record<AnalyzeCase, string>`,别改成 `Partial` 或带 `?`:
 *   少写一格 / 将来加第四个 case,要**编译不过**,不能静默回 `undefined`。
 * ⚠️ `would-overwrite` 那句话有**两个读者**——`analyze-image.ts` 的
 *   `AnalyzeOutcome.notice` 与 `agent-view.ts` 的 `cases[].notice`——两处逐字相同。
 *   (`missing-image` 只有一个读者:缺图那条 422。)
 * ⚠️ `scene` / `style` 的 `would-overwrite` 到不了,只占位(判据见
 *   `session.ts` 的 `analysisWouldOverwrite`)。
 * ⚠️ 文案就是 UI 文案(§7.3):别塞会话 id、字段名、kind 取值。
 */
import type { AnalyzeCase } from '../../makeup/index.js';

/** 没读成的原因。★ 闭集,且与 `AnalyzeStatus`(结局)不是一回事,别合并。 */
export type AnalysisReason = 'missing-image' | 'would-overwrite';

export const ANALYSIS_MESSAGES: Record<AnalysisReason, Record<AnalyzeCase, string>> = {
  'missing-image': {
    face: '这个会话还没有你的照片。请先上传一张本人正面照。',
    scene: '这个会话还没有场景图。请先上传一张。',
    style: '这个会话还没有风格参考图。请先上传一张。',
  },
  'would-overwrite': {
    // ★ 句尾那句必须留:用户会以为点了就花钱。
    face: '你已经填过肤色了,分析不会覆盖它(这一次没有产生费用)。',
    // 到不了,占位(见文件头)。
    scene: '这一项不需要从图里读。',
    style: '这一项不需要从图里读。',
  },
};

/** ★ 调用方只走这个函数,别自己去下标 `ANALYSIS_MESSAGES`。 */
export function analysisMessage(kind: AnalyzeCase, reason: AnalysisReason): string {
  return ANALYSIS_MESSAGES[reason][kind];
}
