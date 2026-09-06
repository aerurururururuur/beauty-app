/**
 * RunPipeline 用例单测:全 mock 走通 + 引擎异常 → failed。
 */
import { describe, expect, it } from 'vitest';
import { RunPipeline } from '../src/application/usecases/run-pipeline.js';
import { SubmitJob } from '../src/application/usecases/submit-job.js';
import { GetJob } from '../src/application/usecases/get-job.js';
import { GetJobResult } from '../src/application/usecases/get-job-result.js';
import { ErrorCode } from '../src/domain/errors/app-error.js';
import {
  FakeArtifactStore,
  FakeEngine,
  FakeJobRepository,
  FakeQueue,
  FakeReferenceProvider,
  FakeSceneAnalyzer,
  ThrowingEngine,
  memFile,
} from './helpers/fakes.js';

function setup(engine = new FakeEngine()) {
  const jobs = new FakeJobRepository();
  const artifactStore = new FakeArtifactStore();
  const queue = new FakeQueue();
  const submitJob = new SubmitJob({ jobs, artifactStore, queue });
  const sceneAnalyzer = new FakeSceneAnalyzer();
  const referenceProvider = new FakeReferenceProvider();
  const runPipeline = new RunPipeline({
    jobs,
    artifactStore,
    sceneAnalyzer,
    referenceProvider,
    engine,
  });
  const getJob = new GetJob(jobs);
  const getJobResult = new GetJobResult({ jobs, artifactStore });
  return { jobs, queue, submitJob, runPipeline, getJob, getJobResult };
}

describe('RunPipeline', () => {
  it('提交 → 流水线跑完 → done,含 scene/references/result', async () => {
    const { jobs, queue, submitJob, runPipeline, getJob, getJobResult } = setup();
    const created = await submitJob.execute({
      face: memFile('me.png', 'image/png', 'FACE'),
      scenes: [],
      sceneText: '雪景 清透',
    });
    expect(queue.enqueued).toEqual([created.id]);

    await runPipeline.execute(created.id);

    const rec = jobs.get(created.id)!;
    expect(rec.status).toBe('done');
    expect(rec.progress).toBe(100);
    expect(rec.scene?.label).toBe('snow');
    expect(rec.references).toHaveLength(1);
    expect(rec.result?.engine).toBe('fake');
    expect(rec.result?.resultUrl).toBe(`/jobs/${created.id}/result`);
    expect(rec.result?.explain.length).toBeGreaterThan(0);

    // 查询视图 & 产物可读
    const view = await getJob.execute(created.id);
    expect(view.result?.references).toHaveLength(1);
    const artifact = await getJobResult.execute(created.id);
    expect(artifact.mimeType).toBe('image/png');
  });

  it('引擎抛错 → 任务 failed,错误可查', async () => {
    const { submitJob, runPipeline, getJob } = setup(new ThrowingEngine());
    const created = await submitJob.execute({
      face: memFile(),
      scenes: [memFile('s.png')],
    });

    await runPipeline.execute(created.id);
    const view = await getJob.execute(created.id);
    expect(view.status).toBe('failed');
    expect(view.error?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(view.error?.message).toContain('引擎炸了');
  });

  it('任务不存在时不抛错(队列空跑)', async () => {
    const { runPipeline } = setup();
    await expect(runPipeline.execute('no-such-job')).resolves.toBeUndefined();
  });

  it('未完成任务读产物 → JOB_NOT_READY', async () => {
    const { jobs, queue, getJobResult } = setup();
    // 用 FakeQueue(不入队执行),任务停在 queued → 不可下载产物
    const submitJob = new SubmitJob({
      jobs,
      artifactStore: new FakeArtifactStore(),
      queue,
    });
    const created = await submitJob.execute({ face: memFile(), scenes: [], sceneText: '城市' });
    await expect(getJobResult.execute(created.id)).rejects.toMatchObject({
      code: ErrorCode.JOB_NOT_READY,
    });
  });
});
