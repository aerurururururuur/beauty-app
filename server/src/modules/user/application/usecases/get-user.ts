/**
 * application/usecases/get-user.ts —— 按 id 查档案用例(前端登录后拿 id 回读自身)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { UserView } from '../../domain/api/user-view.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { toUserView } from '../mapping/user-view.mapper.js';

export class GetUser {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string): Promise<UserView> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, `用户不存在:${id}`);
    }
    return toUserView(user);
  }
}
