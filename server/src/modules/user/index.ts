/**
 * modules/user —— 用户模块(public barrel)。
 * 账号 = 昵称 + 密码(只存哈希,不存明文);提供注册 / 登录核对 / 按 id 查档案。
 * 本轮不做登录态(不签发 token、不建会话),也尚未与 jobs / recommendations 联动
 * (任务归属 userId 是未来接缝,见模块 README)。跨模块协作只经由这里。
 */

// ---- 领域实体(纯数据 + 工厂)----
export type { User } from './domain/entities/user.js';
export { createUser } from './domain/entities/user.js';

// ---- schemas(形状/契约,无行为)----
export {
  MAX_NICKNAME,
  MAX_NICKNAME_RAW,
  MAX_PASSWORD,
  MIN_NICKNAME,
  MIN_PASSWORD,
  credentialsSchema,
  userIdSchema,
} from './domain/schemas/user.js';
export type { CredentialsRaw, UserIdScalar } from './domain/schemas/user.js';

// ---- validators(校验行为,语义错误码)----
export { validateCredentials, validateUserId } from './domain/validators/user.validator.js';
export type { Credentials } from './domain/validators/user.validator.js';

// ---- 对外 API 契约 / DTO ----
export type { UserView } from './domain/api/user-view.js';

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
export { registerUsersRoutes } from './presentation/controllers/users.controller.js';
export type { UsersDeps } from './presentation/controllers/users.controller.js';

// ---- 组合根 ----
export { createUserModule } from './compose.js';
export type { UserModuleOptions, UserModuleServices } from './compose.js';
