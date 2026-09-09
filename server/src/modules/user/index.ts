/**
 * modules/user —— 用户模块(public barrel,空壳)。
 * 用户系统起点:账号实体 + 仓库端口已立,实现未 wire。
 * 本轮「只做账号本身」:不接 jobs(任务归属 userId 是未来接缝)、不接 recommendations。
 * 跨模块协作只经由这里;将来加鉴权/档案用例也由此导出。
 */
export type { User } from './domain/entities/user.js';
export type { UserRepository } from './domain/ports/user-repository.js';
export { createUserModule } from './compose.js';
export type { UserModuleServices } from './compose.js';
