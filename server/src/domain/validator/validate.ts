/**
 * domain/validator/validate.ts —— 校验行为的小工具。
 *
 * 分层约定(与 domain/schemas 对照):
 *  - domain/schemas  只声明「形状 / 契约」:zod 结构、字段类型、允许的格式与取值范围,
 *                    不写跨字段业务规则,也不承担「调用校验」这个动作。
 *  - domain/validator 才是「做校验行为的对象」:真正被上层调用来校验输入/输出,
 *                    执行跨字段与业务规则,并把失败转成带业务错误码的 AppError。
 *                    schema 只是 validator 的声明式底座。
 */
import type { z } from 'zod';

/** 把 zod 错误转成可读中文(行为工具)。 */
export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '请求'}: ${issue.message}`)
    .join('; ');
}
