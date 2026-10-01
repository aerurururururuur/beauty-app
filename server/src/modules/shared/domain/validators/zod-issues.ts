/**
 * domain/validators/zod-issues.ts —— 把 zod 错误说成**给人看**的一句话。
 *
 * ★ **这一份是上提来的,不是新写的。** jobs / user / weather / cabinet 此前
 *   **各持一份逐字相同**的实现,而且每一份的注释都在推迟这件事本身——
 *   cabinet 那份写的是「这是第四份拷贝,若再多一个模块要用,就该考虑上提到 shared 了」,
 *   user 那份写的是「若将来第三个模块也要用,再考虑上提到 shared,别在这里提前抽」
 *   (写这句时它已经是第三份了)。
 *   `agent` 落地时出现了第 5 份,**那几份注释自己定的触发条件到了**,于是按它们的规矩上提。
 *   上提之前那四份是**逐字相同**的,所以这是纯粹的合并,没有行为变化。
 *
 * ⚠️ **`agent` 那份没有并进来,而且不该并**(`agent/domain/validators/validate.ts`)。
 *   它看着像第 5 份,其实是**变体**:它的输出会被 `agent-loop` 原样回填给**模型**
 *   当 observation,所以**必须带上合法取值清单**(`可用:interview / date / …`)——
 *   只说"不合法"不说"能用哪些",模型只能瞎猜,那是 agent 循环空转的典型成因。
 *   这一份的消费者是**人**(HTTP 错误体),不需要那份清单。
 *   两份的消费者不同 ⇒ 不是重复。**别看到相似就合并它们。**
 */
import type { z } from 'zod';

/** zod 的 type 名 → 中文。表里没有的原样用(宁可露出一个英文词,也不瞎猜)。 */
const TYPE_NAMES: Record<string, string> = {
  object: '一个对象',
  string: '字符串',
  number: '数字',
  boolean: '布尔值',
  array: '一个数组',
  null: 'null',
};

function typeName(type: string): string {
  return TYPE_NAMES[type] ?? type;
}

/**
 * 一个 issue → 一句中文。
 * ★ zod 自带的 `issue.message` 是**英文原文**,而它会一路走到界面上(前端把 message
 *   原样打在输入框旁边),所以这里按 `code` 逐类翻。翻不出来才回落原文——
 *   那时 `details.issues` 与日志里仍能看出是哪个码。
 *   只翻**真会从请求进来**的那两类:形状错(类型不对)与多给字段(`.strict()`)。
 *   长度那几类(`too_small` / `too_big`)都长在 `schemas/entities/` 上,那是读盘的形状,
 *   出错时抛的是普通 Error(500),不是给用户看的话。
 */
function describeIssue(issue: z.ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `多给了不认识的字段:${issue.keys.join(' / ')}`;
  }
  if (issue.code === 'invalid_type') {
    return issue.received === 'undefined'
      ? `缺少必填的${typeName(issue.expected)}`
      : `要${typeName(issue.expected)},收到的是${typeName(issue.received)}`;
  }
  return issue.message;
}

/** 把 zod 错误转成可读中文(行为工具)。 */
export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '请求'}: ${describeIssue(issue)}`)
    .join('; ');
}
