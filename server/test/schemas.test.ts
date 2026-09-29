/**
 * domain/schemas —— 「形状/契约」测试 + 两条入口的规则一致性测试。
 *
 * ★ §4.2 之后分工变了,这个文件也跟着改了:
 *   - **schema 只答「这是什么结构」**:类型对不对、`.strict()`、`weather` 的数值区间。
 *   - **枚举白名单 / 长度上限 / trim 是业务规则**,在 validator 里
 *     (`shared/domain/validators/brief-fields.validator.ts`,两条路共用那一份)。
 *   所以「`occasion: 'snow'` 要被拒」这类断言**从 `safeParse` 挪到了 validator**
 *   ——它们原来测的是 schema,现在测的是规则。见下面第二个 describe。
 *
 * meta JSON 解析、跨字段业务规则与清洗在 validator 那几个测试文件里。
 */
import { describe, expect, it } from 'vitest';
import {
  jobSubmitSchema,
  MAX_DRESS,
  MAX_META_RAW,
  MAX_SCENE_TEXT,
  metaSchema,
  jobIdSchema,
  validateSubmitJob,
} from '../src/modules/jobs/index.js';
// ★ 对话那条路的补丁 schema + 它的 validator。两条路的一致性由下面那组测试钉着。
import { briefPatchSchema, checkBriefPatch } from '../src/modules/agent/index.js';

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
      skinTone: 'warm_tan',
      dress: '西装 · 藏青',
      sceneText: '正式终面',
      weather: { condition: '晴', temperatureC: 24, humidityPct: 45, uvIndex: 3 },
    });
    expect(res.success).toBe(true);
  });

  it('weather 数值越界(UV > 15)拒绝', () => {
    expect(metaSchema.safeParse({ weather: { uvIndex: 20 } }).success).toBe(false);
  });

  it('weather 严格模式:拒绝多余键', () => {
    expect(metaSchema.safeParse({ weather: { condition: '晴', wind: 3 } }).success).toBe(false);
  });

  it('字段类型不对仍是形状错误(sceneText 给了数字)', () => {
    expect(metaSchema.safeParse({ sceneText: 42 }).success).toBe(false);
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
 * ★ §4.2 的分工本身也要被钉住:schema **只答形状**,规则在 validator。
 *
 * 这条断言是**故意反过来**的:schema 现在**接受** `occasion: 'snow'`。
 * 如果谁哪天把 `z.enum` / `.max()` 加回 schema,这里就红——
 * 因为那意味着规则又有了第二个落点,而 schema 的松紧决定两条路会不会**一起**失守。
 * 「`'snow'` 最终被拒」由下面一致性那组测试保证(经 validator)。
 */
describe('★ §4.2:schema 只答形状,枚举与上限不在 schema 里', () => {
  it('metaSchema 不拦非法枚举(规则在 validator)', () => {
    expect(metaSchema.safeParse({ occasion: 'snow' }).success).toBe(true);
    expect(metaSchema.safeParse({ skinTone: 'fair' }).success).toBe(true);
  });

  it('metaSchema 不拦超长文字(上限在 validator)', () => {
    expect(metaSchema.safeParse({ sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) }).success).toBe(true);
  });

  it('briefPatchSchema 同样只答形状', () => {
    expect(briefPatchSchema.safeParse({ occasion: 'snow' }).success).toBe(true);
  });
});

/**
 * ★ 两条入口的规则必须一致(表单 `validateSubmitJob` ↔ 对话 `checkBriefPatch`)。
 *
 * 这一组测试**不是重复覆盖**,它钉的是一件具体的事:此前两份 schema 各写了一遍
 * 那五个字段,注释里写着「改 `MakeupBrief` 时两处都要看」——而那种约定守不住。
 * 现在两条路都调 `shared` 的 `checkBriefFields`(§4.2 把规则从 schema 搬进 validator 之后
 * **尤其**需要这条,因为 schema 变松了、没有第二道网),这个 describe 就是那条规则的证据:
 * **同一份输入,两条路必须给同一个答案**。谁哪天把某一处改回手写、或给某一处加特例,这里就红。
 *
 * ⚠️ 表单那条路自己还有一条**不属于简报字段**的规则:必须有风格信号
 *   (`occasion` 或 `sceneText`),否则报 `CONTEXT_REQUIRED`。那不是共用字段的规则,
 *   所以探针一律带上一份**合法基线**(两者都给),让这条规则永远不参与判定——
 *   否则测的就是「两条路的答案碰巧都是 false」。
 */
describe('★ 两条入口共用同一份简报规则(表单 ↔ 对话)', () => {
  /** 合法基线:同时给出 occasion 与 sceneText,保证 CONTEXT_REQUIRED 永不触发。 */
  const BASELINE = { occasion: 'interview', sceneText: '正式终面' } as const;

  /** 表单那条路:走真正的 validator(含 meta JSON 解析)。 */
  const viaForm = (input: unknown): boolean => {
    try {
      validateSubmitJob({
        faces: [meta()],
        scenes: [],
        metaRaw: JSON.stringify(input),
      });
      return true;
    } catch {
      return false;
    }
  };

  /** 对话那条路:走 `patch_brief` 的 validator。 */
  const viaChat = (input: unknown): boolean => checkBriefPatch(input).ok;

  const cases: Array<[string, unknown]> = [
    ['空补丁', {}],
    ['合法场合', { occasion: 'date' }],
    ['不存在的场合', { occasion: 'snow' }],
    ['合法肤质 + 肤色', { skinType: 'oily', skinTone: 'warm_tan' }],
    ['不存在的肤色', { skinTone: 'fair' }],
    ['不存在的肤质', { skinType: 'mixed' }],
    ['自由文字到上限', { sceneText: 'a'.repeat(MAX_SCENE_TEXT) }],
    ['自由文字超一个字', { sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) }],
    ['穿搭到上限', { dress: 'a'.repeat(MAX_DRESS) }],
    ['穿搭超一个字', { dress: 'a'.repeat(MAX_DRESS + 1) }],
    ['只要空白(trim 后视同没给)', { sceneText: '   ' }],
  ];

  for (const [label, probe] of cases) {
    it(`${label}:两条路给同一个答案`, () => {
      const input = { ...BASELINE, ...(probe as object) };
      expect(viaChat(input)).toBe(viaForm(input));
    });
  }

  it('认不出的字段:两条路都拒(形状层,各自 .strict())', () => {
    const input = { ...BASELINE, hobby: '滑雪' };
    expect(viaChat(input)).toBe(false);
    expect(viaForm(input)).toBe(false);
  });

  it('★ 非法取值两条路都真被拒(不是"碰巧都 false"的反面:这里要是 true)', () => {
    // 上一条只比「两边答案相同」,相同也可能是**一起放过**。这条把方向钉死。
    expect(viaChat({ ...BASELINE, occasion: 'snow' })).toBe(false);
    expect(viaChat({ ...BASELINE, skinTone: 'fair' })).toBe(false);
    expect(viaChat({ ...BASELINE, sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) })).toBe(false);
    expect(viaForm({ ...BASELINE, occasion: 'snow' })).toBe(false);
  });

  it('★ 上限常量本身也是同一个值(转发不许漂)', () => {
    // 表单侧经 jobs 的 barrel 转发,值在 `shared` 的 validator 里——两边都不许再写字面量。
    expect(MAX_SCENE_TEXT).toBe(2000);
    expect(MAX_DRESS).toBe(80);
  });
});
