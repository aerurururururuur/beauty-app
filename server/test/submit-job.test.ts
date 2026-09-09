/**
 * SubmitJob 用例单测(内存假端口)。
 */
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import { SubmitJob } from '../src/modules/jobs/index.js';
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
      brief: { occasion: 'interview', skinType: 'oily', skinTone: 'medium' },
    });

    expect(res.status).toBe('queued');
    expect(res.progress).toBe(0);
    expect(queue.enqueued).toEqual([res.id]);

    const rec = jobs.get(res.id);
    expect(rec).toBeDefined();
    expect(rec!.status).toBe('queued');
    expect(rec!.inputs.face.originalName).toBe('me.png');
    expect(rec!.inputs.scenes).toHaveLength(1);
    expect(rec!.inputs.brief?.occasion).toBe('interview');
    expect(rec!.inputs.brief?.skinType).toBe('oily');

    // 存储层确实落盘了两类输入(face + scene 文件)
    expect(artifactStore.fileCount()).toBe(2);
  });

  it('既无 occasion 也无 sceneText → CONTEXT_REQUIRED', async () => {
    const { queue, submitJob } = setup();
    await expect(
      submitJob.execute({ face: memFile(), scenes: [], brief: {} }),
    ).rejects.toMatchObject({ code: ErrorCode.CONTEXT_REQUIRED });
    expect(queue.enqueued).toHaveLength(0);
  });

  it('风景参考图超出上限 → SCENES_MAX_EXCEEDED', async () => {
    const { submitJob } = setup();
    const scenes = Array.from({ length: 7 }, () => memFile());
    await expect(
      submitJob.execute({ face: memFile(), scenes, brief: { occasion: 'interview' } }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
