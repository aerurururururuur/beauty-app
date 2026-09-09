/**
 * domain/schemas —— 「形状/契约」测试。
 * 只验证结构声明本身(字段格式、类型、长度、枚举取值、严格模式);
 * meta JSON 解析、跨字段业务规则与清洗在 validator.test.ts。
 */
import { describe, expect, it } from 'vitest';
import {
  jobSubmitSchema,
  MAX_DRESS,
  MAX_META_RAW,
  MAX_SCENE_TEXT,
  metaSchema,
  jobIdSchema,
} from '../src/modules/jobs/index.js';

const meta = (mimeType = 'image/png', originalName = 'a.png') => ({ originalName, mimeType });

describe('jobSubmitSchema(形状)', () => {
  it('接受 face + scene + metaRaw(JSON 字符串)的结构', () => {
    const res = jobSubmitSchema.safeParse({
      faces: [meta()],
      scenes: [meta()],
      metaRaw: JSON.stringify({ occasion: 'interview', skinType: 'oily' }),
    });
    expect(res.success).toBe(true);
  });

  it('仅 face + scene(无 meta)结构合法', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [meta()] });
    expect(res.success).toBe(true);
  });

  it('拒绝非 image/* 的文件(格式是形状的一部分)', () => {
    const res = jobSubmitSchema.safeParse({
      faces: [meta('application/json')],
      scenes: [meta('text/plain')],
    });
    expect(res.success).toBe(false);
  });

  it('拒绝超长 meta JSON 原文(长度是形状的一部分)', () => {
    const res = jobSubmitSchema.safeParse({
      faces: [meta()],
      scenes: [],
      metaRaw: 'a'.repeat(MAX_META_RAW + 1),
    });
    expect(res.success).toBe(false);
  });

  it('严格模式:拒绝多余字段', () => {
    const res = jobSubmitSchema.safeParse({ faces: [meta()], scenes: [], surprise: 1 });
    expect(res.success).toBe(false);
  });
});

describe('metaSchema(简报形状)', () => {
  it('合法完整简报(occasion/肤质肤色/穿搭/天气/自由文字)', () => {
    const res = metaSchema.safeParse({
      occasion: 'interview',
      skinType: 'oily',
      skinTone: 'tan',
      dress: '西装 · 藏青',
      sceneText: '正式终面',
      weather: { condition: '晴', temperatureC: 24, humidityPct: 45, uvIndex: 3 },
    });
    expect(res.success).toBe(true);
  });

  it('occasion / skinTone / skinType 只接受既定枚举', () => {
    expect(metaSchema.safeParse({ occasion: 'snow' }).success).toBe(false);
    expect(metaSchema.safeParse({ skinTone: 'fair' }).success).toBe(false);
    expect(metaSchema.safeParse({ skinType: 'mixed' }).success).toBe(false);
  });

  it('weather 数值越界(UV > 15)拒绝', () => {
    expect(metaSchema.safeParse({ weather: { uvIndex: 20 } }).success).toBe(false);
  });

  it('weather 严格模式:拒绝多余键', () => {
    expect(metaSchema.safeParse({ weather: { condition: '晴', wind: 3 } }).success).toBe(false);
  });

  it('sceneText / dress 超长拒绝(长度是形状的一部分)', () => {
    expect(metaSchema.safeParse({ sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) }).success).toBe(false);
    expect(metaSchema.safeParse({ dress: 'a'.repeat(MAX_DRESS + 1) }).success).toBe(false);
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
