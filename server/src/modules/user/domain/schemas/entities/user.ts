/**
 * domain/schemas/entities/user.ts —— 账号入参的「形状/契约」(zod,无行为)。
 *
 * ★ §4.2:这里只答「这是什么结构」——是字符串、`.strict()`。
 *   昵称与密码的**长度上下限**、用户 id 的**格式正则**是**业务规则**,
 *   一律在 `domain/validators/user.validator.ts`,与它们的错误文案同处一地。
 *   留在这里的只有:类型、`.strict()`。
 *
 * 这里不做动作、不写 refine/transform。
 */
import { z } from 'zod';

/** 账号凭据形状:注册与登录同形(见 validator 里为何仍分开命名语义)。 */
export const credentialsSchema = z
  .object({
    nickname: z.string(),
    password: z.string(),
  })
  .strict();

/** 路径参数 :id 的形状。 */
export const userIdSchema = z.string();

/** 通过形状校验的账号凭据(仍需清洗,见 validator)。 */
export type CredentialsRaw = z.output<typeof credentialsSchema>;
/** 通过校验后的用户 id(字符串)。 */
export type UserIdScalar = z.output<typeof userIdSchema>;
