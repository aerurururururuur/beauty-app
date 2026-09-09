/**
 * domain/ports/job-repository.ts —— 任务仓库端口(仓库模式)。
 * 具体实现(磁盘 JSON/SQLite…)属于 infrastructure。domain 只定义契约。
 */
import type { JobRecord } from '../entities/job.js';

export interface JobRepository {
  create(record: JobRecord): Promise<void>;
  find(id: string): Promise<JobRecord | null>;
  /** 读-改-写原子化:调用方传入领域迁移函数,返回更新后的记录。 */
  update(id: string, mutate: (prev: JobRecord) => JobRecord): Promise<JobRecord>;
}
