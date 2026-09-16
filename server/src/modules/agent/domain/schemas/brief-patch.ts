/**
 * agent/domain/schemas/brief-patch.ts —— `patch_brief` 工具入参的「形状」(zod,**无行为**)。
 *
 * 这是**同构于 `MakeupBrief` 的一个子集**,不是 `MakeupBrief` 本身,原因是分工不同:
 *   - `MakeupBrief` 是**流水线的输入契约**,由 `POST /api/jobs` 一次给全;
 *   - 这个 schema 是**增量补丁的契约**,全部字段可选,而且**没有 `weather`**
 *     ——§7.2 给 `patch_brief` 列的面是「场合/肤质/肤色/穿搭/自由文字」,
 *     天气不是对话里问出来的,是 `weather` 模块实拉的。
 *
 * ★ **字段规则从 `shared` 的 `briefFields` 来,不在这里再写一遍。**
 *   此前这里和 `jobs/domain/schemas/job-submit.ts` 的 `metaSchema` 各写了一遍同样五行,
 *   风险不是"重复"本身,而是**改一边忘一边**:同一个用户输入会因为从哪条路进来
 *   而受不同限制。现在两边展开同一份字段,各自只添自己的成员
 *   (表单多一个 `weather`,补丁没有)。
 */
import { z } from 'zod';
import { briefFields } from '../../../shared/index.js';

/**
 * 长度上限(字)。
 * ★ 值在 `shared`(`domain/schemas/brief-fields.ts`),这里只是转发,
 *   好让本模块的使用者不改 import 路径。
 */
export { MAX_DRESS, MAX_SCENE_TEXT } from '../../../shared/index.js';

export const briefPatchSchema = z.object({ ...briefFields }).strict();

/** 通过形状校验的补丁(仍需 trim 清洗,见 `application/tools/patch-brief.ts`)。 */
export type BriefPatchRaw = z.output<typeof briefPatchSchema>;
