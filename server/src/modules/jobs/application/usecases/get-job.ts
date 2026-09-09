/**
 * application/usecases/get-job.ts —— 查询任务用例(供轮询)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { JobView } from '../../domain/api/job-view.js';
import type { JobRepository } from '../../domain/ports/job-repository.js';
import { toJobView } from '../mapping/job-view.mapper.js';

export class GetJob {
  constructor(private readonly jobs: JobRepository) {}

  async execute(id: string): Promise<JobView> {
    const record = await this.jobs.find(id);
    if (!record) {
      throw new AppError(ErrorCode.JOB_NOT_FOUND, `任务不存在:${id}`);
    }
    return toJobView(record);
  }
}
