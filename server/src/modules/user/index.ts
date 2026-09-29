/**
 * modules/user —— 用户模块(public barrel)。
 * 账号 = 昵称 + 密码(只存哈希,不存明文);提供注册 / 登录核对 / 按 id 查档案。
 * 本轮不做登录态(不签发 token、不建会话),也**不与任何出图模块联动**
 * (会话归属 userId 是既有的事实,见模块 README 的「接缝」一节)。跨模块协作只经由这里。
 */

// ---- 领域实体(纯数据 + 工厂)----
export type { User } from './domain/entities/user.js';
export { createUser } from './domain/entities/user.js';

// ---- schemas(形状/契约,无行为)----
export { credentialsSchema, userIdSchema } from './domain/schemas/index.js';
export type { CredentialsRaw, UserIdScalar } from './domain/schemas/index.js';
/**
 * ★ **落盘行的形状也导出**(同 `cabinet` / `agent` 那条测试接缝的理由):
 * 读出口的解析依据是它(§7.2),而「盘上写下去的键集合与这份 schema 一格不差」
 * 只有拿到 schema 才验得了(`test/user.test.ts` 的往返那条)。**它是形状,不是规则。**
 */
export { userSchema, userTableSchema } from './domain/schemas/index.js';
export type { UserRow } from './domain/schemas/index.js';

// ---- validators(校验行为,语义错误码)----
// ★ 五个长度常量跟着规则搬到了 validator(§4.2)。**仍从这里转出**:不让既有调用方改
//   import 路径(同样的转发在 `shared` 的 `MAX_SCENE_TEXT` 上也有)。新代码请直接从
//   `domain/validators/user.validator.js` 引——barrel 上这条转发只是兼容。
export {
  MAX_NICKNAME,
  MAX_NICKNAME_RAW,
  MAX_PASSWORD,
  MIN_NICKNAME,
  MIN_PASSWORD,
  validateCredentials,
  validateUserId,
} from './domain/validators/user.validator.js';
export type { Credentials } from './domain/validators/user.validator.js';

// ---- 对外 API 契约 / DTO ----
export type { UserView } from './domain/schemas/index.js';

// ---- ports(本模块持契约;实现见 infrastructure)----
export type { PasswordHasher } from './domain/ports/password-hasher.js';
export type { UserRepository } from './domain/ports/user-repository.js';
// 默认实现的导出只为组合根与测试(同 makeup 导 MockEngine);业务代码请依赖上面的端口类型。
export { JsonUserRepository } from './infrastructure/json/user-repository.js';
export { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher.js';

// ---- 用例 ----
export { AuthenticateUser } from './application/usecases/authenticate-user.js';
export { GetUser } from './application/usecases/get-user.js';
export { RegisterUser } from './application/usecases/register-user.js';

// ---- presentation(HTTP 路由挂载)----
export { registerUsersRoutes } from './presentation/routes/users.route.js';
export type { UsersDeps } from './presentation/users.controller.js';

// ---- 组合根 ----
export { createUserModule } from './compose.js';
export type { UserModuleOptions, UserModuleServices } from './compose.js';
