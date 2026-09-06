/**
 * domain/validator/job-id.validator.ts —— 路径参数 :id 的校验行为。
 * 形状(jobIdSchema)只声明 id 的允许格式;这里才是真正执行 parse、并把失败
 * 转成 AppError(VALIDATION_ERROR)的地方。
 */
import { AppError, ErrorCode } from '../errors/app-error.js';
import { jobIdSchema } from '../schemas/job-id.js';
import { zodIssuesMessage } from './validate.js';

/** 校验任务 id,合法则原样返回,非法抛 AppError。 */
export function validateJobId(raw: unknown): string {
  const parsed = jobIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  return parsed.data;
}
