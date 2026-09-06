/**
 * domain Job 状态机单测:合法/非法迁移、进度推进。
 */
import { describe, expect, it } from 'vitest';
import {
  advanceTo,
  createQueuedJob,
  failJob,
  finishJob,
  recordReferences,
  recordScene,
  startJob,
} from '../src/domain/entities/job.js';
import type { JobRecord, JobResult } from '../src/domain/entities/job.js';

function sampleJob(id = 'job-1'): JobRecord {
  return createQueuedJob(id, {
    face: { storeKey: 'inputs/job-1/face/face-1.png', mimeType: 'image/png', originalName: 'me.png' },
    scenes: [],
    sceneText: '雪景 冷调',
  });
}

function sampleResult(): JobResult {
  return {
    engine: 'mock',
    resultUrl: '/jobs/job-1/result',
    scene: { label: 'snow', direction: '清透', tags: ['冷调'], confidence: 0.7, source: 'mock' },
    look: { style: '清透' },
    references: [],
    analysis: 'a',
    explain: 'b',
    tips: ['c'],
  };
}

describe('Job 状态机', () => {
  it('queued → running → 各步骤 → done,进度单调递增', () => {
    let rec = sampleJob();
    expect(rec.status).toBe('queued');
    rec = startJob(rec);
    expect(rec.scene).toBeUndefined();
    expect(rec.startedAt).toBeDefined();

    const sceneAnalysis = { label: 'snow', direction: '清透冷调', tags: ['雪'], confidence: 0.7, source: 'mock' };
    rec = recordScene(advanceTo(rec, 'scene_understand'), sceneAnalysis);
    expect(rec.step).toBe('scene_understand');
    expect(rec.progress).toBe(20);

    const refs = [{ id: 'r1', title: '参考', license: 'cc0', sourceUrl: 'https://x' }];
    rec = recordReferences(advanceTo(rec, 'reference_gather'), refs);
    expect(rec.step).toBe('reference_gather');
    expect(rec.progress).toBe(40);

    rec = advanceTo(rec, 'makeup_generate');
    expect(rec.progress).toBe(70);

    const done = finishJob(rec, sampleResult());
    expect(done.status).toBe('done');
    expect(done.progress).toBe(100);
    expect(done.step).toBe('store_result');
    expect(done.result?.engine).toBe('mock');
    expect(done.completedAt).toBeDefined();
  });

  it('queued 不能直接 done', () => {
    expect(() => finishJob(sampleJob(), sampleResult())).toThrow();
  });

  it('步骤不能回退', () => {
    let rec = startJob(sampleJob());
    rec = advanceTo(rec, 'scene_understand');
    expect(() => advanceTo(rec, 'queued')).toThrow();
    expect(() => advanceTo(rec, 'reference_gather')).not.toThrow();
  });

  it('终态后不能再次迁移', () => {
    let rec = startJob(sampleJob());
    rec = finishJob(rec, sampleResult());
    expect(() => startJob(rec)).toThrow();
    expect(() => failJob(rec, 'X', 'msg')).toThrow();
  });

  it('running 可标记失败', () => {
    const rec = startJob(sampleJob());
    const failed = failJob(rec, 'ENGINE_ERROR', 'boom');
    expect(failed.status).toBe('failed');
    expect(failed.error?.code).toBe('ENGINE_ERROR');
    expect(failed.completedAt).toBeDefined();
  });
});
