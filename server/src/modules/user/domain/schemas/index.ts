/**
 * user/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `entities/` 是账号表那一行的形状（凭据入参与 id），`api/` 是对外 DTO。
 * ★ `UserView` 不含 `passwordHash`，落地在 `application/user-view.ts` 的投影里。
 */
export {
  MAX_NICKNAME_RAW,
  MAX_NICKNAME,
  MIN_NICKNAME,
  MIN_PASSWORD,
  MAX_PASSWORD,
  credentialsSchema,
  userIdSchema,
} from './entities/user.js';
export type { CredentialsRaw, UserIdScalar } from './entities/user.js';

export type { UserView } from './api/user-view.js';
