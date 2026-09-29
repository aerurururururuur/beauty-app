/**
 * domain/schemas/contracts/brief-fields.ts —— `MakeupBrief` 里**被两条入口共用**的那几个字段的形状。
 *
 * ── 为什么要有这个文件 ──────────────────────────────────────────────────────
 *
 * 需求可以从两条路进来:开会话(`POST /api/agent/sessions` 带初始 brief)和对话
 * (`patch_brief` 工具)。两条路各自持一份 schema 是**对的**(入参契约不同:开会话一次给全,
 * 对话是增量补丁,而且补丁**没有** `weather`)——但**字段本身的规则**只该有一份。
 *
 * 此前两边各写了一遍这五行,`agent/domain/schemas/api/brief-patch.ts` 的注释把风险写得很准:
 * 「改 `MakeupBrief` 时两处都要看」。那不是一种能靠自觉维持的约定:
 * 改了一边忘了另一边,同一个用户输入会因为**从哪条路进来**而受不同限制——
 * 表现是"开会话时能写 2000 字,对话里却报错"这种极难归因的 bug。
 * 所以这里只放**字段**,不放对象:两处各自 `z.object({ ...briefFields, … })`,
 * 各自的 `.strict()`、各自的成员(开会话多一个 `weather`)都留在原地。
 *
 * ★ **这里只有形状,没有规则**(§4.2):五个字段都是「可选字符串」。
 *   「哪些取值合法」「最长多少字」是**业务规则**,在
 *   `shared/domain/validators/brief-fields.validator.ts` —— 两条路都调那一份。
 *   ⚠️ 所以**别在这里加 `.max()` / `z.enum()`**:加了就等于规则又多了第二个落点,
 *   而 schema 是松是紧决定了两条路会不会**一起**失守。
 *
 * ⚠️ 两条路的行为一致性有测试钉着(`test/schemas.test.ts` 里那组
 *   「同一份输入,两条路给同一个答案」)——**故意不靠这里的注释维持**。
 */
import { z } from 'zod';

/**
 * 两条入口共用的简报字段。**全部可选**——两条路都是"能给多少给多少"。
 * 用 `...briefFields` 展开进各自的 `z.object()`。
 */
export const briefFields = {
  occasion: z.string().optional(),
  sceneText: z.string().optional(),
  skinType: z.string().optional(),
  skinTone: z.string().optional(),
  dress: z.string().optional(),
} as const;
