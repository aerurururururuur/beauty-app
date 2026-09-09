/**
 * domain/ports/user-repository.ts —— 用户仓库端口(本模块持契约)。
 * 空壳模块:契约先立,实现后补(infrastructure,仿 jobs/infrastructure/json/job-repository 的 JSON 落盘)。
 * 只有本模块自己实现/装配它,别处经 public barrel 拿不到具体实现——保持单向依赖。
 */
import type { User } from '../entities/user.js';

export interface UserRepository {
  /** 保存(新建或整覆写)用户档案。 */
  save(user: User): Promise<void>;
  /** 按 id 取用户;不存在返回 null。 */
  findById(id: string): Promise<User | null>;
}
