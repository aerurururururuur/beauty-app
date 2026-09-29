/**
 * application/tools/patch-brief.ts —— `patch_brief` 的实现(免费、无 IO)。
 *
 * 很薄:校验 → 折叠进会话 → 回报当前状态。
 *
 * ★ 校验**全部**走 `domain/validators/brief-patch.validator.ts`,本文件不自己判:
 *   形状由 `briefPatchSchema` 管,取值与长度由 `shared` 的 `checkBriefFields` 管
 *   ——与表单那条路(`POST /api/jobs`)是**同一份规则**。
 *   ⚠️ 此前这里有一段 `cleanPatch` 注释写着「枚举已由 schema 保证,照搬即可」,
 *      并且**后面没有 validator**。§4.2 把规则搬出 schema 后那句话就不再成立,
 *      模型给的非法取值会静默写进会话。现在不靠那句话了。
 *
 * 真正的分界线仍在**清洗**:模型很容易把用户的一句话原样塞进 `sceneText` 时带上首尾空白,
 * 或者把已经在别的字段表达过的信息重复一遍。空字符串**必须当"没给"**处理——
 * 否则一次"部分更新"会静默清掉用户之前说过的穿搭。
 */
import { PATCH_BRIEF } from '../../domain/tools/definitions.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import { checkBriefPatch } from '../../domain/validators/brief-patch.validator.js';
import { patchBrief as applyPatch } from '../../domain/entities/session.js';
import { describeBrief } from '../brief-description.js';

export class PatchBriefTool implements Tool {
  readonly definition = PATCH_BRIEF;

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    const checked = checkBriefPatch(input);
    if (!checked.ok) {
      // ★ 消息里带合法取值清单(由 `checkBriefFields` 给),模型据此改——同
      //   `look-spec.validator.ts`:只说「不合法」模型只能瞎猜,那是循环空转的常见成因。
      return {
        content: `参数不合法:${checked.message}。请修正后重试。`,
        isError: true,
      };
    }

    const changes = checked.brief;
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
