/**
 * domain/schemas/job-id.ts —— 路径参数 :id 的运行时校验(zod)。
 */
import { z } from 'zod';

export const jobIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, '任务 id 不合法');

/** 通过校验后的任务 id(字符串)。 */
export type JobIdScalar = z.output<typeof jobIdSchema>;
