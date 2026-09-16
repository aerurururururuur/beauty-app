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
// ★ 对话那条路的补丁 schema。两条路的一致性由下面那组测试钉着。
import { briefPatchSchema } from '../src/modules/agent/index.js';

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

/**
 * ★ 两条入口的字段规则必须一致(表单 `metaSchema` ↔ 对话 `briefPatchSchema`)。
 *
 * 这一组测试**不是重复覆盖**,它钉的是一件具体的事:此前两份 schema 各写了一遍
 * 那五个字段,注释里写着「改 `MakeupBrief` 时两处都要看」——而那种约定守不住。
 * 现在两份都从 `shared` 的 `briefFields` 展开,这个 describe 就是那条规则的证据:
 * **同一份输入,两条路必须给同一个答案**。谁哪天把某一处改回手写、或给某一处加特例,
 * 这里就红。
 */
describe('★ 两条入口共用同一份简报字段(表单 ↔ 对话)', () => {
  // 只测两边**都有**的那五个字段;`weather` 是表单独有的成员,不在此列。
  const same = (input: unknown): { meta: boolean; patch: boolean } => ({
    meta: metaSchema.safeParse(input).success,
    patch: briefPatchSchema.safeParse(input).success,
  });

  const cases: Array<[string, unknown]> = [
    ['空对象', {}],
    ['合法场合', { occasion: 'interview' }],
    ['不存在的场合', { occasion: 'snow' }],
    ['合法肤质 + 肤色', { skinType: 'oily', skinTone: 'tan' }],
    ['不存在的肤色', { skinTone: 'fair' }],
    ['自由文字到上限', { sceneText: 'a'.repeat(MAX_SCENE_TEXT) }],
    ['自由文字超一个字', { sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) }],
    ['穿搭到上限', { dress: 'a'.repeat(MAX_DRESS) }],
    ['穿搭超一个字', { dress: 'a'.repeat(MAX_DRESS + 1) }],
    ['认不出的字段', { hobby: '滑雪' }],
    ['字段类型不对', { sceneText: 42 }],
  ];

  for (const [label, input] of cases) {
    it(`${label}:两条路给同一个答案`, () => {
      const { meta, patch } = same(input);
      expect(patch).toBe(meta);
    });
  }

  it('★ 上限常量本身也是同一个值(转发不许漂)', () => {
    // 表单侧从 `shared` 转发,对话侧也是——两边都不许再写字面量。
    expect(MAX_SCENE_TEXT).toBe(2000);
    expect(MAX_DRESS).toBe(80);
  });
});
