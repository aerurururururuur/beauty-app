/**
 * application/usecases/register-user.ts —— 注册(建档)用例。
 * 职责:入参校验行为(domain/validator)→ 昵称查重 → 密码哈希(经 PasswordHasher 端口)
 *      → 建实体 → 落库(经 UserRepository 端口)→ 回对外视图。
 * 明文密码只在本方法栈内存活,哈希完即丢;用例不感知 HTTP,也不知道哈希算法是什么。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { createUser } from '../../domain/entities/user.js';
import type { UserView } from '../../domain/api/user-view.js';
import { validateCredentials } from '../../domain/validators/user.validator.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { toUserView } from '../mapping/user-view.mapper.js';

export class RegisterUser {
  constructor(
    private readonly deps: {
      users: UserRepository;
      hasher: PasswordHasher;
    },
  ) {}

  async execute(raw: unknown): Promise<UserView> {
    const { nickname, password } = validateCredentials(raw);

    // 昵称唯一性:先查后写。演示期单进程、量级小,竞态窗口可忽略;
    // 若将来并发建档,唯一约束要下沉到仓库实现里兜底(端口契约不变)。
    const existing = await this.deps.users.findByNickname(nickname);
    if (existing) {
      throw new AppError(ErrorCode.NICKNAME_TAKEN, `昵称已被占用:${nickname}`);
    }

    const passwordHash = await this.deps.hasher.hash(password);
    const user = createUser(randomUUID(), nickname, passwordHash);
    await this.deps.users.save(user);

    return toUserView(user);
  }
}
