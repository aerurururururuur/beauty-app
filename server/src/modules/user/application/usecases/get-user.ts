/**
 * application/usecases/get-user.ts —— 按 id 查档案用例(前端登录后拿 id 回读自身)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { UserView } from '../../domain/schemas/index.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { toUserView } from '../user-view.js';

export class GetUser {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string): Promise<UserView> {
    const user = await this.users.findById(id);
    if (!user) {
      // ★ 文案用前端的词;不回显那个 id——用户从没见过它(UUID),读了也没用
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }
    return toUserView(user);
  }
}
