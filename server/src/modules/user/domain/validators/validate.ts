/**
 * domain/validators/validate.ts —— 校验行为的小工具。
 * 与 jobs 模块同名文件同款(每个模块自持一份,跨模块不共享实现细节);
 * 若将来第三个模块也要用,再考虑上提到 shared,别在这里提前抽。
 */
import type { z } from 'zod';

/** 把 zod 错误转成可读中文(行为工具)。 */
export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '请求'}: ${issue.message}`)
    .join('; ');
}
