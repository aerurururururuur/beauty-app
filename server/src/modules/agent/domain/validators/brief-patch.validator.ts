/**
 * agent/domain/validators/brief-patch.validator.ts —— `patch_brief` 补丁的校验**行为**。
 *
 * ── 这个文件是 §4.2 落地时补上的一处**真窟窿** ──────────────────────────────
 *
 * 在此之前，「`occasion` 必须是枚举里那五个之一」这件事**只有 schema 一处**在管
 * （`briefPatchSchema` 里是 `z.enum(OCCASIONS)`），而且 `patch-brief.ts` 的注释
 * 明确写着「已由 schema 保证，照搬即可」。
 *
 * 于是 §4.2 一旦把规则搬出 schema，**这条路就再没有任何地方判过**
 * `occasion: "随便"`、5000 字的 `sceneText`、`skinTone: "fair"` —— 而 schema 变松之后
 * 它们会**静默写进会话 brief**，一路带到出图那一步才在**别的地方**炸掉。
 * 那正是 spec §14-08「某个校验规则只在一个入口生效」逐字描述的那一格。
 *
 * 所以补这个文件，让它与开会话那条路**调同一个 `checkBriefFields`**：
 * 同一个用户输入，不会因为从哪条路进来而受不同限制。
 *
 * 分工：
 *   ① 形状 —— `briefPatchSchema`（是不是对象 / 字段是不是字符串 / `.strict()`）；
 *   ② 规则 —— `checkBriefFields`（枚举白名单 / 长度上限 / trim），来自 `shared`，
 *      **与 `validateStartSession` 是同一份**。
 *
 * ★ 返回**结果对象而不是抛异常**：工具失败要**回填成给模型看的 observation**
 *   （§7.3 第 4 条：工具错误不抛穿 agent 循环），怎么呈现失败由工具自己决定。
 */
import type { MakeupBrief } from '../../../shared/index.js';
import { checkBriefFields } from '../../../shared/index.js';
import { briefPatchSchema } from '../schemas/index.js';
import { describeIssues } from './validate.js';

export type BriefPatchCheck =
  | { ok: true; brief: MakeupBrief }
  | { ok: false; message: string };

/**
 * 校验并清洗一份增量补丁。
 * ★ 空对象（`{}`）在这里是**合法**的——「模型调了工具却什么都没给」是工具层的判断
 *   （见 `application/tools/patch-brief.ts`），不是校验失败。
 */
export function checkBriefPatch(input: unknown): BriefPatchCheck {
  const parsed = briefPatchSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, message: describeIssues(parsed.error) };
  }
  return checkBriefFields(parsed.data);
}
