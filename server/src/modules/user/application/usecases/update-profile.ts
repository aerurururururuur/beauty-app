/**
 * application/usecases/update-profile.ts —— 改账号资料(简介 + 头像的部分更新)。
 *
 * ★★ **头像的三条路径都要走对**(错了都静默,与 `update-persona` 同款):
 *   · `avatar` **没传** ⇒ 字节一个都不碰。⚠️ 最容易写错成"没传就当没有头像",那会在用户改简介时**顺手删掉他的头像**;
 *   · `avatar: ''` ⇒ **先删字节再写行**删掉 `avatarMime`;反过来若删字节失败,行已没有那一格,那张图就**永远没人认领也没人删**;
 *   · `avatar: <dataURL>` ⇒ **先写新字节再写行**(端口会覆盖同 id 旧字节,不会留两份)。
 *
 * ★ 只改这两格:**昵称是登录身份**(全库唯一),改它得另开一条带唯一性校验的路,不在这里顺手放行。
 */
import type { UserAvatarStore } from '../../domain/ports/user-avatar-store.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import type { UserView } from '../../domain/schemas/index.js';
import type { UserAvatarChange } from '../../domain/entities/user.js';
import { updateUserProfile, userNotFound } from '../../domain/entities/user.js';
import { validateProfileInput, validateUserId } from '../../domain/validators/user.validator.js';
import { toUserView } from '../user-view.js';

export class UpdateProfile {
  constructor(
    private readonly deps: {
      users: UserRepository;
      avatars: UserAvatarStore;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<UserView> {
    const userId = validateUserId(id);
    const input = validateProfileInput(raw);

    const user = await this.deps.users.findById(userId);
    if (!user) throw userNotFound();

    // 只有 `avatar` 真传了才动它(见文件头那三条路径)。
    let nextAvatar: UserAvatarChange | undefined;
    if (input.avatar !== undefined) {
      if (input.avatar.kind === 'none') {
        await this.deps.avatars.remove(userId);
        nextAvatar = { kind: 'none' };
      } else {
        await this.deps.avatars.save(userId, input.avatar.mime, input.avatar.bytes);
        nextAvatar = { kind: 'file', mime: input.avatar.mime };
      }
    }

    const updated = updateUserProfile(user, {
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(nextAvatar !== undefined ? { avatar: nextAvatar } : {}),
    });
    await this.deps.users.save(updated);

    return toUserView(updated);
  }
}
