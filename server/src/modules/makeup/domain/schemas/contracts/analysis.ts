/**
 * makeup/domain/schemas/contracts/analysis.ts —— 视觉模型**回复**的形状(zod,**无行为**)。
 *
 * ★ `.strict()` 在这里是刻意的:§7.1 把「第三方 API 响应(含 LLM 的返回)」列为边界。
 *   模型多回一个键(如 `{"skinTone":"olive","confidence":0.8}`)不是"无害的额外信息",
 *   而是**它没有按约定回答**,要当场暴露 —— 放过去,下一个人会以为那个 `confidence` 有人在用。
 *
 * ⚠️ 取值一条都没查(§4.2):两个字段都还是宽泛的 `string`,白名单在 `validators/`。
 * 只有 `face` / `scene` 两份:`style` 的回复形状就是 `StyleRead`(`styleReadSchema`),
 * 再导出一次就是两份定义(§4.1)。
 */
import { z } from 'zod';

/**
 * `face` 分析的回复。★ 字段名与 `brief.skinTone` 同名是刻意的:读出来正好往那儿写,
 * 中间不需要一层改名映射。取值规则见 `validators/analysis.validator.ts`。
 */
export const faceReadingSchema = z.object({ skinTone: z.string() }).strict();

/** `scene` 分析的回复。同名的理由见上。 */
export const sceneReadingSchema = z.object({ occasion: z.string() }).strict();

/** 过了形状、**取值一条都没查**的回复。⚠️ 要 `AnalysisOf` 请走 `validators/analysis.validator.ts`。 */
export type FaceReadingRaw = z.output<typeof faceReadingSchema>;
export type SceneReadingRaw = z.output<typeof sceneReadingSchema>;
