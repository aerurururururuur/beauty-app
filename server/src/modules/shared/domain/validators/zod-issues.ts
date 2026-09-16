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

/** 把 zod 错误转成可读中文(行为工具)。 */
export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '请求'}: ${issue.message}`)
    .join('; ');
}
