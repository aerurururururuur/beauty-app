/**
 * domain/schemas/user.ts —— 账号入参的「形状/契约」(zod,无行为)。
 * 只声明结构:昵称/密码是字符串、长度各有上界(先挡住超大 payload,别拿超长串喂 scrypt);
 * 用户 id 是路径参数,只认 URL 安全字符。
 *
 * ★ 语义规则(昵称去空白后的上下限、禁止控制字符、密码下限)与清洗、
 *   VALIDATION_ERROR 语义错误码一律放 domain/validators/user.validator.ts,
 *   这里不做动作、不写 refine/transform。
 */
import { z } from 'zod';

/** 昵称原文上限(字,给 trim 留余量;清洗后的上下限另判)。 */
export const MAX_NICKNAME_RAW = 64;
/** 昵称清洗后上限(字)。 */
export const MAX_NICKNAME = 32;
/** 昵称清洗后下限(字)。 */
export const MIN_NICKNAME = 2;
/** 密码下限(位)。 */
export const MIN_PASSWORD = 6;
/** 密码上限(位,同时是防超长 payload 的闸门)。 */
export const MAX_PASSWORD = 128;

const nicknameRawSchema = z.string().max(MAX_NICKNAME_RAW, `昵称原文最多 ${MAX_NICKNAME_RAW} 字`);
const passwordRawSchema = z.string().max(MAX_PASSWORD, `密码最多 ${MAX_PASSWORD} 位`);

/** 账号凭据形状:注册与登录同形(见 validator 里为何仍分开命名语义)。 */
export const credentialsSchema = z
  .object({
    nickname: nicknameRawSchema,
    password: passwordRawSchema,
  })
  .strict();

/** 路径参数 :id 的形状。 */
export const userIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, '用户 id 不合法');

/** 通过形状校验的账号凭据(仍需清洗,见 validator)。 */
export type CredentialsRaw = z.output<typeof credentialsSchema>;
/** 通过校验后的用户 id(字符串)。 */
export type UserIdScalar = z.output<typeof userIdSchema>;
