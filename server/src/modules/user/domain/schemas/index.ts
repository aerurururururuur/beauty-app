/**
 * user/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `entities/` 是账号表那一行的形状（凭据入参与 id），`api/` 是对外 DTO。
 * ★ 这里只有形状;长度上下限与 id 格式在 `domain/validators/user.validator.ts`(§4.2)。
 * ★ `UserView` 不含 `passwordHash`，落地在 `application/user-view.ts` 的投影里。
 */
export { credentialsSchema, userIdSchema, userSchema, userTableSchema } from './entities/user.js';
export type { CredentialsRaw, UserIdScalar, UserRow } from './entities/user.js';

export { userViewSchema } from './api/user-view.js';
export type { UserView } from './api/user-view.js';
