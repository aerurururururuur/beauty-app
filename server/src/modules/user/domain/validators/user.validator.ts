/**
 * domain/validators/user.validator.ts —— 账号入参的校验行为。
 * 真正被 presentation / application 调用的对象:
 *   ① 用 credentialsSchema(纯形状)检查结构是否合法;
 *   ② 执行形状表达不了的语义规则,统一映射成 VALIDATION_ERROR;
 *   ③ 清洗(trim 昵称)并产出可直接落库 / 比对的凭据。
 *
 * 注册与登录同形同规则,故共用一个校验器(将来若注册规则变严,在此按意图分叉)。
 * 密码**不做任何清洗**:空格、首尾空白都是密码的合法字符,动了就和用户之后输入的密码对不上。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import {
  MAX_NICKNAME,
  MAX_PASSWORD,
  MIN_NICKNAME,
  MIN_PASSWORD,
  credentialsSchema,
  userIdSchema,
} from '../schemas/user.js';
import { zodIssuesMessage } from './validate.js';

/** 通过校验、可交给用例使用的账号凭据(密码仍是明文,仅在内存中流转)。 */
export interface Credentials {
  nickname: string;
  password: string;
}

/** 是否含控制字符(C0 段 + DEL):昵称会进 URL 与 UI,含换行 / 制表 / NUL 一律拒收。 */
function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f) return true;
  }
  return false;
}

/** 校验账号 id,合法则原样返回,非法抛 AppError。 */
export function validateUserId(raw: unknown): string {
  const parsed = userIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  return parsed.data;
}

/** 校验账号凭据(注册 / 登录共用);不合法抛带业务错误码的 AppError,合法返回清洗后的凭据。 */
export function validateCredentials(raw: unknown): Credentials {
  // ① 形状
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  // ② 语义规则(形状表达不了的:长度夹逼、字符集)
  const nickname = parsed.data.nickname.trim();
  if (nickname.length < MIN_NICKNAME) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `昵称至少 ${MIN_NICKNAME} 个字符(不含首尾空白)`);
  }
  if (nickname.length > MAX_NICKNAME) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `昵称最多 ${MAX_NICKNAME} 个字符`);
  }
  if (hasControlChar(nickname)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '昵称不能包含换行或控制字符');
  }
  if (parsed.data.password.length < MIN_PASSWORD) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `密码至少 ${MIN_PASSWORD} 位(最多 ${MAX_PASSWORD} 位)`,
    );
  }

  // ③ 输出(密码原样透传,不清洗)
  return { nickname, password: parsed.data.password };
}
