/**
 * SubmitJob 用例单测(内存假端口)。
 */
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/domain/errors/app-error.js';
import { SubmitJob } from '../src/application/usecases/submit-job.js';
import {
  FakeArtifactStore,
  FakeJobRepository,
  FakeQueue,
  memFile,
} from './helpers/fakes.js';

function setup() {
  const jobs = new FakeJobRepository();
  const artifactStore = new FakeArtifactStore();
  const queue = new FakeQueue();
  const submitJob = new SubmitJob({ jobs, artifactStore, queue });
  return { jobs, artifactStore, queue, submitJob };
}

describe('SubmitJob', () => {
  it('提交成功:建 queued 记录、落盘 face/scene、入队', async () => {
    const { jobs, artifactStore, queue, submitJob } = setup();
    const res = await submitJob.execute({
      face: memFile('me.png', 'image/png', 'FACE'),
      scenes: [memFile('scene1.png', 'image/png', 'SCENE1')],
      sceneText: '雪景 冷调',
    });

    expect(res.status).toBe('queued');
    expect(res.progress).toBe(0);
    expect(queue.enqueued).toEqual([res.id]);

    const rec = jobs.get(res.id);
    expect(rec).toBeDefined();
    expect(rec!.status).toBe('queued');
    expect(rec!.inputs.face.originalName).toBe('me.png');
    expect(rec!.inputs.scenes).toHaveLength(1);
    expect(rec!.inputs.sceneText).toBe('雪景 冷调');

    // 存储层确实落盘了两类输入
    expect(artifactStore.fileCount()).toBe(2);
  });

  it('无场景(无图且无文字) → SCENES_REQUIRED', async () => {
    const { queue, submitJob } = setup();
    await expect(
      submitJob.execute({ face: memFile(), scenes: [], sceneText: '   ' }),
    ).rejects.toMatchObject({ code: ErrorCode.SCENES_REQUIRED });
    expect(queue.enqueued).toHaveLength(0);
  });

  it('场景图超出上限 → SCENES_MAX_EXCEEDED', async () => {
    const { submitJob } = setup();
    const scenes = Array.from({ length: 7 }, () => memFile());
    await expect(submitJob.execute({ face: memFile(), scenes })).rejects.toBeInstanceOf(AppError);
  });
});
