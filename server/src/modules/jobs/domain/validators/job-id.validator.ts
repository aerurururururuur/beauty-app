/**
 * domain/validator/job-id.validator.ts —— 路径参数 :id 的校验行为。
 * 形状(jobIdSchema)只说「这是个字符串」;**格式在这里**(§4.2),与它的错误文案同处一地。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { jobIdSchema } from '../schemas/index.js';
import { zodIssuesMessage } from '../../../shared/index.js';

/**
 * 任务 id 的格式:只认 URL 安全字符,1..80 位。
 *
 * ★ 这条正则在本仓**有四个同款的兄弟**(`user` 的 `userIdSchema`、`cabinet` 的
 *   `itemIdSchema` / `ownerIdSchema`),四处**逐字相同但各持一份** ——
 *   模块之间不互相 import(见模块 README 的依赖方向约定),不为了一个正则破例。
 *   改这里请顺手看一眼另外三处。
 */
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** 校验任务 id,合法则原样返回,非法抛 AppError。 */
export function validateJobId(raw: unknown): string {
  const parsed = jobIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  if (!JOB_ID_PATTERN.test(parsed.data)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '任务 id 不合法');
  }
  return parsed.data;
}
