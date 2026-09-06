/**
 * src/index.ts —— 组装根(唯一认识所有实现的文件)。
 * 读配置 → new 基础设施适配器 → new 应用用例 → 装配 presentation → 启动/优雅停机。
 * 方向:依赖只从 presentation → application → domain;infrastructure 实现 domain/ports。
 */
import path from 'node:path';
import { SubmitJob } from './application/usecases/submit-job.js';
import { RunPipeline } from './application/usecases/run-pipeline.js';
import { GetJob } from './application/usecases/get-job.js';
import { GetJobResult } from './application/usecases/get-job-result.js';
import { loadConfig, loadDotEnvIfPresent } from './infrastructure/config.js';
import { FileSystemArtifactStore } from './infrastructure/file-system/artifact-store.js';
import { JsonJobRepository } from './infrastructure/json/job-repository.js';
import { InMemoryJobQueue } from './infrastructure/queue/in-memory-queue.js';
import { MockSceneAnalyzer } from './infrastructure/scene-analyzer/mock-scene-analyzer.js';
import { MockReferenceProvider } from './infrastructure/reference-provider/mock-reference-provider.js';
import { MockEngine } from './infrastructure/engine/mock-engine.js';
import { buildApp } from './presentation/app.js';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();

  // —— 基础设施适配器(将来换真实实现只改这里) ——
  const artifactStore = new FileSystemArtifactStore(config.dataDir);
  const jobs = new JsonJobRepository(path.join(config.dataDir, 'jobs'));

  // 当前配置只支持 mock;接入真实引擎/模型时按 MAKEUP_ENGINE 等开关分发。
  const sceneAnalyzer = new MockSceneAnalyzer();
  const referenceProvider = new MockReferenceProvider();
  const engine = new MockEngine();

  // —— 应用用例 ——
  const runPipeline = new RunPipeline({
    jobs,
    artifactStore,
    sceneAnalyzer,
    referenceProvider,
    engine,
  });
  const queue = new InMemoryJobQueue((jobId) => runPipeline.execute(jobId));

  const submitJob = new SubmitJob({ artifactStore, jobs, queue });
  const getJob = new GetJob(jobs);
  const getJobResult = new GetJobResult({ jobs, artifactStore });

  // —— presentation ——
  const app = await buildApp({ config, submitJob, getJob, getJobResult });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`收到 ${signal},排空队列后退出`);
    await queue.whenIdle();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
