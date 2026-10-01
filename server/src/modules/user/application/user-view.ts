/**
 * application/user-view.ts —— 领域 User → 对外 UserView。
 * 只做纯投影,不含任何 IO。★ 凭据(passwordHash)在此被剥掉——
 * 对外视图必须经这里产出,别把实体直接回给客户端。
 *
 * ★★ **`avatarUrl` 错起来是静默的**:`stored` 时给的是 **`/users/<id>/avatar`(不带 `/api`)**,
 * 由前端补 `API_BASE` 再进 `<img>`。**绝不在这里拼绝对地址** —— 后端不知道部署前缀。
 * ⚠️ 前端那个坑:dev 下裸 `/users/...` 会被 SPA 兜底路由回 index.html ⇒ 破图且**不报错**。
 * 所以 `avatarSource` 那一格不是可选的(与 `persona-view.ts` 同款)。
 */
import type { User } from '../domain/entities/user.js';
import type { UserView } from '../domain/schemas/index.js';

/** 头像字节的对外那条路由(不带 `/api`,见文件头)。 */
export function userAvatarPath(id: string): string {
  return `/users/${id}/avatar`;
}

export function toUserView(user: User): UserView {
  // ★ 行里没有 `avatarMime` 就是没有头像(不是"头像地址为空")—— 两种情形在这里合成一格。
  const hasAvatar = user.avatarMime !== undefined;
  return {
    id: user.id,
    nickname: user.nickname,
    // ★ 行里没有这一格时给空串:**恒有这一格**是契约,见 DTO 那条注释。
    bio: user.bio ?? '',
    avatarUrl: hasAvatar ? userAvatarPath(user.id) : '',
    avatarSource: hasAvatar ? 'stored' : 'none',
    createdAt: user.createdAt,
  };
}
