/**
 * domain/schemas/api/job-id.ts —— 路径参数 :id 的**形状**(zod)。
 *
 * ★ §4.2:格式(`/^[A-Za-z0-9_-]{1,80}$/`)是**业务规则**,不在这里 ——
 *   在 `domain/validators/job-id.validator.ts`,与那条规则的错误文案同处一地。
 *   留在这里的只有「这是个字符串」。
 */
import { z } from 'zod';

export const jobIdSchema = z.string();

/** 通过形状校验后的任务 id(仍是任意字符串,**格式未校验**)。 */
export type JobIdScalar = z.output<typeof jobIdSchema>;
