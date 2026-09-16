/**
 * agent/domain/validators/validate.ts —— 把 zod 错误说成「模型读得懂」的话。
 *
 * ★ **那份"上提"已经做完了**(2026-09-16):jobs / user / weather / cabinet 那四份
 *   逐字相同的副本合并成了 `shared/domain/validators/zod-issues.ts`。
 *   本文件**没有**跟着并进去,而且**不该并**——见下面那条差别。
 *
 * 与 `shared` 那份的差别(所以它不是副本,是**变体**):
 * 那份给**人**看(HTTP 错误体),这份给**模型**看——错误消息会被
 * `agent-loop` 原样回填成 observation,所以必须**带上合法取值清单**。
 * 只说「不合法」而不说「可用哪些」,模型只能瞎猜,这是 agent 循环空转的典型成因。
 */
import type { z } from 'zod';

/** 把一个 zod issue 说成中文;取值类错误带上合法选项(zod 在 issue 上直接给了 `options`)。 */
export function describeIssue(issue: z.ZodIssue): string {
  const at = issue.path.join('.') || '参数';
  if (issue.code === 'invalid_enum_value') {
    return `${at} 取值「${String(issue.received)}」不合法;可用:${issue.options.join(' / ')}`;
  }
  if (issue.code === 'unrecognized_keys') {
    return `${at} 出现不认识的字段:${issue.keys.join(' / ')}`;
  }
  return `${at}:${issue.message}`;
}

/** 一份 zod 错误 → 一句话。 */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map(describeIssue).join(';');
}
