/**
 * modules/user/compose.ts —— 组合根(空壳)。
 * repository 为 null:未实现、也未在 src/index.ts 接入。
 * 实现 UserRepository 后(如 JSON 落盘)于此返回实例,并在 src/index.ts 里 createUserModule()
 * 真正 wire;届时再按需补鉴权/档案端点与错误码。
 */
import type { UserRepository } from './domain/ports/user-repository.js';

export interface UserModuleServices {
  /** 账号仓库;未实现为 null。 */
  repository: UserRepository | null;
}

export function createUserModule(): UserModuleServices {
  return { repository: null };
}
