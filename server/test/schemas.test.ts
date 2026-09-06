/**
 * domain/schemas —— 「形状/契约」测试。
 * 只验证结构声明本身(字段格式、类型、长度);跨字段业务规则与清洗在 validator.test.ts。
 */
import { describe, expect, it } from 'vitest';
import { jobSubmitSchema, MAX_SCENE_TEXT } from '../src/domain/schemas/job-submit.js';
import { jobIdSchema } from '../src/domain/schemas/job-id.js';

const meta = (mimeType = 'image/png', originalName = 'a.png') => ({ originalName, mimeType });

describe('jobSubmitSchema(形状)', () => {
  it('接受 face + scene + sceneText 的结构', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [meta()], sceneText: '雪' });
    expect(res.success).toBe(true);
  });

  it('仅 face + scene(无文字)结构合法', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [meta()] });
    expect(res.success).toBe(true);
  });

  it('拒绝非 image/* 的文件(格式是形状的一部分)', () => {
    const res = jobSubmitSchema.safeParse({
      faces: [meta('application/json')],
      scenes: [meta('text/plain')],
      sceneText: '城市',
    });
    expect(res.success).toBe(false);
  });

  it('拒绝超长场景文字(长度是形状的一部分)', () => {
    const res = jobSubmitSchema.safeParse({
      faces: [meta()],
      scenes: [],
      sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1),
    });
    expect(res.success).toBe(false);
  });

  it('严格模式:拒绝多余字段', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [], surprise: 1 });
    expect(res.success).toBe(false);
  });
});

describe('jobIdSchema(形状)', () => {
  it('接受 UUID 风格 id', () => {
    expect(jobIdSchema.safeParse('3fa85f64-5717-4562-b3fc-2c963f66afa6').success).toBe(true);
  });
  it('拒绝含空格/路径字符的 id', () => {
    expect(jobIdSchema.safeParse('../etc').success).toBe(false);
  });
});
