/**
 * domain/schemas 的 zod 校验单测。
 */
import { describe, expect, it } from 'vitest';
import { jobSubmitSchema, MAX_SCENES } from '../src/domain/schemas/job-submit.js';
import { jobIdSchema } from '../src/domain/schemas/job-id.js';

const meta = (mimeType = 'image/png', originalName = 'a.png') => ({ originalName, mimeType });

describe('jobSubmitSchema', () => {
  it('风景图 + 文字都为空 → 拒绝', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [], sceneText: '  ' });
    expect(res.success).toBe(false);
    if (!res.success) expect(JSON.stringify(res.error.issues)).toContain('场景文字');
  });

  it('缺少本人照片 → 拒绝', () => {
    const res = jobSubmitSchema.safeParse({ faces: [], scenes: [meta()] });
    expect(res.success).toBe(false);
  });

  it('非图片类型 → 拒绝', () => {
    const res = jobSubmitSchema.safeParse({
      faces: [meta('application/json')],
      scenes: [meta('text/plain')],
      sceneText: '城市',
    });
    expect(res.success).toBe(false);
  });

  it('风景图超出上限 → 拒绝', () => {
    const scenes = Array.from({ length: MAX_SCENES + 1 }, () => meta());
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes });
    expect(res.success).toBe(false);
  });

  it('仅文字即可通过,且 sceneText 被 trim/去空', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [], sceneText: ' 雪景 清透 ' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.face.originalName).toBe('a.png');
      expect(res.data.sceneText).toBe('雪景 清透');
      expect(res.data.scenes).toEqual([]);
    }
  });

  it('仅风景图即可通过', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [meta()], sceneText: undefined });
    expect(res.success).toBe(true);
  });
});

describe('jobIdSchema', () => {
  it('接受 UUID 风格 id', () => {
    expect(jobIdSchema.safeParse('3fa85f64-5717-4562-b3fc-2c963f66afa6').success).toBe(true);
  });
  it('拒绝含空格/路径字符的 id', () => {
    expect(jobIdSchema.safeParse('../etc').success).toBe(false);
  });
});
