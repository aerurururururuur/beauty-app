/**
 * application/tools/patch-brief.ts —— `patch_brief` 的实现(免费、无 IO)。
 *
 * 很薄:校验形状 → 清洗 → 折叠进会话 → 回报当前状态。
 * 真正的分界线在**清洗**:模型很容易把用户的一句话原样塞进 `sceneText` 时带上首尾空白,
 * 或者把已经在别的字段表达过的信息重复一遍。空字符串**必须当"没给"**处理——
 * 否则一次"部分更新"会静默清掉用户之前说过的穿搭。
 */
import type { MakeupBrief } from '../../../shared/index.js';
import { PATCH_BRIEF } from '../../domain/tools/definitions.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import { briefPatchSchema } from '../../domain/schemas/brief-patch.js';
import { patchBrief as applyPatch } from '../../domain/entities/session.js';
import { describeBrief } from '../brief-description.js';
import { describeIssues } from '../../domain/validators/validate.js';

/**
 * 清洗补丁:trim 字符串;空串视同没给(不覆盖旧值)。
 * `occasion` / `skinType` / `skinTone` 是枚举,已由 schema 保证非空,照搬即可。
 */
function cleanPatch(raw: Record<string, unknown>): MakeupBrief {
  const out: MakeupBrief = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') (out as Record<string, unknown>)[key] = trimmed;
    } else if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export class PatchBriefTool implements Tool {
  readonly definition = PATCH_BRIEF;

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    const parsed = briefPatchSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return {
        content: `参数不合法:${describeIssues(parsed.error)}。请修正后重试。`,
        isError: true,
      };
    }

    const changes = cleanPatch(parsed.data as Record<string, unknown>);
    if (Object.keys(changes).length === 0) {
      // 空调用不是"成功但没变化",是**模型用错了工具**——标成 isError 让它回头改,
      // 否则模型会以为记下了,而用户刚才说的信息就此丢失。
      return {
        content:
          '这次调用没有带任何新信息,什么都没改。如果用户刚才说了新需求,请把对应字段填上再调一次;' +
          `如果确实没有新信息,就不用调用这个工具。当前已知需求:${describeBrief(context.session.brief)}`,
        isError: true,
      };
    }

    const session = applyPatch(context.session, changes);
    return {
      content: `已记录。当前已知需求:${describeBrief(session.brief)}`,
      session,
    };
  }
}
