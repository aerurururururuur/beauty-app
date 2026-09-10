/**
 * modules/jobs/compose.ts —— 组合根。
 * 把持久化(JsonJobRepository)、队列(InMemoryJobQueue)与四个用例装起来:
 * RunPipeline 收到队列出队 → 用外部注入的资产/参考/引擎端口跑完流水线
 * (妆容方向那一步不走端口:它是 `shared` 里的纯函数,流水线直接调);
 * SubmitJob / GetJob / GetJobResult 暴露给 web shell。换队列/仓库在此换实现。
 */
import path from 'node:path';
import type { ArtifactStore } from '../assets/index.js';
import type { Engine } from '../makeup/index.js';
import type { ReferenceProvider } from '../references/index.js';

import { RunPipeline } from './application/usecases/run-pipeline.js';
import { SubmitJob } from './application/usecases/submit-job.js';
import { GetJob } from './application/usecases/get-job.js';
import { GetJobResult } from './application/usecases/get-job-result.js';
import { JsonJobRepository } from './infrastructure/json/job-repository.js';
import { InMemoryJobQueue } from './infrastructure/queue/in-memory-queue.js';
import type { JobQueue } from './domain/ports/job-queue.js';
import type { JobRepository } from './domain/ports/job-repository.js';

export interface JobsModuleOptions {
  /** 数据根目录绝对路径;任务记录落在其下 jobs/ 子目录。 */
  dataDir: string;
  artifactStore: ArtifactStore;
  referenceProvider: ReferenceProvider;
  engine: Engine;
}

export interface JobsModuleServices {
  jobs: JobRepository;
  queue: JobQueue;
  runPipeline: RunPipeline;
  submitJob: SubmitJob;
  getJob: GetJob;
  getJobResult: GetJobResult;
}

export function createJobsModule(options: JobsModuleOptions): JobsModuleServices {
  const jobs: JobRepository = new JsonJobRepository(path.join(options.dataDir, 'jobs'));

  const runPipeline = new RunPipeline({
    jobs,
    artifactStore: options.artifactStore,
    referenceProvider: options.referenceProvider,
    engine: options.engine,
  });
  // 进程内串行队列;优雅停机时经 whenIdle 排空。
  const queue: JobQueue = new InMemoryJobQueue((jobId) => runPipeline.execute(jobId));

  const submitJob = new SubmitJob({ artifactStore: options.artifactStore, jobs, queue });
  const getJob = new GetJob(jobs);
  const getJobResult = new GetJobResult({ jobs, artifactStore: options.artifactStore });

  return { jobs, queue, runPipeline, submitJob, getJob, getJobResult };
}
