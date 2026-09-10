/**
 * application/usecases/authenticate-user.ts —— 登录(核对凭据)用例。
 * 职责:入参校验行为 → 按昵称取号 → 密码核对(经 PasswordHasher 端口)→ 回对外视图。
 *
 * 本轮只做「账号 + 密码核对成不成立」:通过即返回档案,**不签发 token、不建会话**。
 * 将来要做登录态,在此加签发逻辑即可,核对部分不用动。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { UserView } from '../../domain/api/user-view.js';
import { validateCredentials } from '../../domain/validators/user.validator.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { toUserView } from '../mapping/user-view.mapper.js';

/** 账号不存在与密码错误共用的对外话术——不泄露「这个名字有没有被注册过」。 */
const REJECT_MESSAGE = '昵称或密码不正确';

export class AuthenticateUser {
  constructor(
    private readonly deps: {
      users: UserRepository;
      hasher: PasswordHasher;
    },
  ) {}

  async execute(raw: unknown): Promise<UserView> {
    const { nickname, password } = validateCredentials(raw);

    const user = await this.deps.users.findByNickname(nickname);
    if (!user) {
      // 查无此人也走失败分支(而非 USER_NOT_FOUND):否则可逐昵称枚举已注册账号。
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, REJECT_MESSAGE);
    }

    const ok = await this.deps.hasher.verify(password, user.passwordHash);
    if (!ok) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, REJECT_MESSAGE);
    }

    return toUserView(user);
  }
}
