/**
 * application/mapping/user-view.mapper.ts —— 领域 User → 对外 UserView。
 * 只做纯投影,不含任何 IO。★ 凭据(passwordHash)在此被剥掉——
 * 对外视图必须经这里产出,别把实体直接回给客户端。
 */
import type { User } from '../../domain/entities/user.js';
import type { UserView } from '../../domain/api/user-view.js';

export function toUserView(user: User): UserView {
  return {
    id: user.id,
    nickname: user.nickname,
    createdAt: user.createdAt,
  };
}
