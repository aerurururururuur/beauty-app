/**
 * application/usecases/read-user-avatar.ts —— 取一个账号的头像字节。
 *
 * ★ 与 `read-persona-photo` 不同,**没有归属查询串**:路径上的 `:id` 就是账号自己,
 *   不是"别人名下的一份东西"。⚠️ 但这条**不是访问控制** —— 拿到 id 的人就能看到这张图,
 *   与本模块其它路由一样(后端不签发凭证)。控制器里**必须**设 `Cache-Control: private, no-store`:
 *   这条 URL 不带版本号,任何缓存留下它,都会在用户换头像后继续发旧的那张。
 *
 * ★ 两态各一个不同的错误:账号不在 ⇒ `USER_NOT_FOUND`;账号在、没设头像 ⇒ `USER_AVATAR_NOT_FOUND`。
 */
import type { UserAvatarStore } from '../../domain/ports/user-avatar-store.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { userAvatarMissing, userNotFound } from '../../domain/entities/user.js';
import { validateUserId } from '../../domain/validators/user.validator.js';

export class ReadUserAvatar {
  constructor(
    private readonly deps: {
      users: UserRepository;
      avatars: UserAvatarStore;
    },
  ) {}

  async execute(id: string): Promise<{ mime: string; bytes: Buffer }> {
    const userId = validateUserId(id);

    const user = await this.deps.users.findById(userId);
    if (!user) throw userNotFound();

    // ★ 行里没有 `avatarMime` 就是没有头像。
    const mime = user.avatarMime;
    if (mime === undefined) throw userAvatarMissing();

    return { mime, bytes: await this.deps.avatars.read(userId, mime) };
  }
}
