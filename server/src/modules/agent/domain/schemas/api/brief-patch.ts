/**
 * agent/domain/schemas/api/brief-patch.ts —— `patch_brief` 工具入参的「形状」(zod,**无行为**)。
 *
 * 这是**同构于 `MakeupBrief` 的一个子集**,不是 `MakeupBrief` 本身,原因是分工不同:
 *   - `MakeupBrief` 是**整份契约**,由 `POST /agent/sessions` 开会话时一次给全;
 *   - 这个 schema 是**增量补丁的契约**,全部字段可选,而且**没有 `weather`**
 *     ——§7.2 给 `patch_brief` 列的面是「场合/肤质/肤色/穿搭/自由文字」,
 *     天气不是对话里问出来的,是 `weather` 模块实拉的。
 *
 * ★ **字段形状从 `shared` 的 `briefFields` 来,不在这里再写一遍。**
 *   此前本文件与另一条入口各写了一遍同样五行,风险不是"重复"本身,
 *   而是**改一边忘一边**:同一个用户输入会因为从哪条路进来而受不同限制。
 *   现在两条路(`startSessionSchema` / 本 schema)展开同一份字段,
 *   各自只添自己的成员(开会话多一个 `weather`,补丁没有)。
 *
 * ★ **这里只有形状**(§4.2):五个字段都是「可选字符串」,所以 `BriefPatchRaw`
 *   此刻**确实可能装着非法取值**——这不是漏洞,是分工:规则(枚举白名单 / 上限 / trim)
 *   在 `domain/validators/brief-patch.validator.ts`,它把 `BriefPatchRaw` 收窄成 `MakeupBrief`。
 *   ⚠️ **别在这里加 `.max()` / `z.enum()`**:加了就等于规则多出第二个落点。
 *   ⚠️ 也**别直接**把本 schema 的 parse 结果当 `MakeupBrief` 用(别 cast)——
 *      那正是这个仓库踩过的坑:形状过了不等于规则过了。
 */
import { z } from 'zod';
import { briefFields } from '../../../../shared/index.js';

/**
 * ⚠️ `MAX_DRESS` / `MAX_SCENE_TEXT` **已不在这里转出**(它们属业务规则,§4.2):
 *   在 `shared/domain/validators/brief-fields.validator.ts`,从 `shared/index.js` 取。
 */
export const briefPatchSchema = z.object({ ...briefFields }).strict();

/** 通过**形状**校验的补丁;取值是否合法还没查,见 validator。 */
export type BriefPatchRaw = z.output<typeof briefPatchSchema>;
