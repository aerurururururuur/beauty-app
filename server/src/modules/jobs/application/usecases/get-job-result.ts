/**
 * application/usecases/get-job-result.ts —— 读取成品图用例。
 * 仅当任务 done 才允许下载;失败/未完成分别映射为 JOB_FAILED / JOB_NOT_READY。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { ArtifactStore } from '../../../assets/index.js';
import type { JobRepository } from '../../domain/ports/job-repository.js';
import type { Readable } from 'node:stream';

export class GetJobResult {
  constructor(
    private readonly deps: { jobs: JobRepository; artifactStore: ArtifactStore },
  ) {}

  async execute(id: string): Promise<{ stream: Readable; mimeType: string }> {
    const record = await this.deps.jobs.find(id);
    if (!record) {
      throw new AppError(ErrorCode.JOB_NOT_FOUND, `任务不存在:${id}`);
    }
    if (record.status === 'failed') {
      throw new AppError(ErrorCode.JOB_FAILED, record.error?.message ?? '任务处理失败');
    }
    if (record.status !== 'done') {
      throw new AppError(ErrorCode.JOB_NOT_READY, '任务尚未完成,暂无可下载的成品图');
    }
    const artifact = await this.deps.artifactStore.readResult(id);
    if (!artifact) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, '任务产物缺失');
    }
    return artifact;
  }
}
