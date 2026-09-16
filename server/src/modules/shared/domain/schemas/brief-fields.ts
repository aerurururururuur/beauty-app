/**
 * domain/schemas/brief-fields.ts —— `MakeupBrief` 里**被两条入口共用**的那几个字段的形状。
 *
 * ── 为什么要有这个文件 ──────────────────────────────────────────────────────
 *
 * 需求可以从两条路进来:表单(`POST /api/jobs` 的 `metaRaw`)和对话(`patch_brief` 工具)。
 * 两条路各自持一份 schema 是**对的**(入参契约不同:表单一次给全,对话是增量补丁,
 * 而且补丁**没有** `weather`)——但**字段本身的规则**只该有一份。
 *
 * 此前两边各写了一遍这五行,`agent/domain/schemas/brief-patch.ts` 的注释把风险写得很准:
 * 「改 `MakeupBrief` 时两处都要看」。那不是一种能靠自觉维持的约定:
 * 改了一边忘了另一边,同一个用户输入会因为**从哪条路进来**而受不同限制——
 * 表现是"表单里能写 2000 字,对话里却报错"这种极难归因的 bug。
 * 所以这里只放**字段**,不放对象:两个模块各自 `z.object({ ...briefFields, … })`,
 * 各自的 `.strict()`、各自的成员(表单多一个 `weather`)都留在原地。
 *
 * ★ 长度上限(`MAX_SCENE_TEXT` / `MAX_DRESS`)也一并放这里。它们此前同样各写一份,
 *   而且**必须**跟着字段走:上限与字段分开,又会得到两处要一起改。
 *
 * ⚠️ 两条路的行为一致性有测试钉着(`test/schemas.test.ts` 里那组
 *   「同一份输入,两条路给同一个答案」)——**故意不靠这里的注释维持**。
 */
import { z } from 'zod';
import { OCCASIONS, SKIN_TONES, SKIN_TYPES } from '../entities/brief.js';

/** 自由文字(场景文字)上限(字)。 */
export const MAX_SCENE_TEXT = 2000;
/** 穿搭一句话描述上限(字)。 */
export const MAX_DRESS = 80;

/**
 * 两条入口共用的简报字段。**全部可选**——两条路都是"能给多少给多少"。
 * 用 `...briefFields` 展开进各自的 `z.object()`。
 */
export const briefFields = {
  occasion: z.enum(OCCASIONS).optional(),
  sceneText: z.string().max(MAX_SCENE_TEXT, `场景文字最多 ${MAX_SCENE_TEXT} 字`).optional(),
  skinType: z.enum(SKIN_TYPES).optional(),
  skinTone: z.enum(SKIN_TONES).optional(),
  dress: z.string().max(MAX_DRESS, `穿搭描述最多 ${MAX_DRESS} 字`).optional(),
} as const;
