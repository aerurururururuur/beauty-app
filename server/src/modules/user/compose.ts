/**
 * modules/user/compose.ts —— 组合根。
 * 把持久化(JsonUserRepository)、密码凭据(ScryptPasswordHasher)与三个用例装起来,
 * 由 src/index.ts 注入 web shell。换存储 / 换哈希算法只在这里换实现,业务层不感知。
 */
import path from 'node:path';
import { RegisterUser } from './application/usecases/register-user.js';
import { AuthenticateUser } from './application/usecases/authenticate-user.js';
import { GetUser } from './application/usecases/get-user.js';
import { JsonUserRepository } from './infrastructure/json/user-repository.js';
import { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher.js';
import type { PasswordHasher } from './domain/ports/password-hasher.js';
import type { UserRepository } from './domain/ports/user-repository.js';

export interface UserModuleOptions {
  /** 数据根目录绝对路径;账号表落在其下 users/ 子目录(users.json)。 */
  dataDir: string;
}

export interface UserModuleServices {
  users: UserRepository;
  hasher: PasswordHasher;
  registerUser: RegisterUser;
  authenticateUser: AuthenticateUser;
  getUser: GetUser;
}

export function createUserModule(options: UserModuleOptions): UserModuleServices {
  const users: UserRepository = new JsonUserRepository(path.join(options.dataDir, 'users'));
  const hasher: PasswordHasher = new ScryptPasswordHasher();

  const registerUser = new RegisterUser({ users, hasher });
  const authenticateUser = new AuthenticateUser({ users, hasher });
  const getUser = new GetUser(users);

  return { users, hasher, registerUser, authenticateUser, getUser };
}
