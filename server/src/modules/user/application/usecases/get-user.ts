/**
 * application/usecases/get-user.ts —— 按 id 查档案用例(前端登录后拿 id 回读自身)。
 */
import type { UserView } from '../../domain/schemas/index.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { userNotFound } from '../../domain/entities/user.js';
import { toUserView } from '../user-view.js';

export class GetUser {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string): Promise<UserView> {
    const user = await this.users.findById(id);
    if (!user) throw userNotFound();
    return toUserView(user);
  }
}
