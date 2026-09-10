/**
 * domain/ports/user-repository.ts —— 用户仓库端口(本模块持契约)。
 * 实现见 infrastructure(JSON 落盘,仿 jobs/infrastructure/json/job-repository)。
 * 只有本模块自己实现/装配它,别处经 public barrel 拿不到具体实现——保持单向依赖。
 */
import type { User } from '../entities/user.js';

export interface UserRepository {
  /** 保存(新建或整覆写)用户档案。 */
  save(user: User): Promise<void>;
  /** 按 id 取用户;不存在返回 null。 */
  findById(id: string): Promise<User | null>;
  /**
   * 按昵称取用户(登录用);不存在返回 null。
   * 昵称是登录身份,唯一性由注册用例在保存前把关——本方法只按精确值匹配(区分大小写)。
   */
  findByNickname(nickname: string): Promise<User | null>;
}
