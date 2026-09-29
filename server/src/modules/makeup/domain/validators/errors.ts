/**
 * makeup/domain/validators/errors.ts —— 本模块校验失败时的两个公共零件。
 *
 * 抽出来是因为 `look-spec.validator.ts` 与 `analysis.validator.ts` 都要用,
 * 而 `describeIssue` 的 `unrecognized_keys` 那一支是本模块特有的措辞
 * (读图的 `.strict()` 靠它说话),拿不了 `shared` 那份给人看的版本。
 */
import type { z } from 'zod';
import { AppError, ErrorCode } from '../../../shared/index.js';

/**
 * 把一个 zod issue 说成中文。
 *
 * ★ 只处理**形状层**的错误(多一个键、类型不对)——取值类错误由各自的规则表说全。
 */
export function describeIssue(issue: z.ZodIssue): string {
  const at = issue.path.join('.') || '请求';
  if (issue.code === 'unrecognized_keys') {
    return `${at} 出现不认识的字段:${issue.keys.join(' / ')}`;
  }
  return `${at}:${issue.message}`;
}

/** 失败一律 `VALIDATION_ERROR`。`subject` 说清是哪一份不合法。 */
export function fail(subject: string, reason: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, `${subject}不合法:${reason}`);
}
