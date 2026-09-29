/**
 * face-catalog 模块:词表加载 + **坏词表启动即失败** + 查表行为。
 *
 * ★ 本文件测的是这个模块唯一的实质判断:**什么样的词表算"坏了"**(炸),
 *   以及那条红线的**实质要求**有没有真被拦住 ——「缺省档不许是最浅档」。
 *
 * ★ 有一组用例直接跑**仓库里那份真词表**(`assests/face-catalog/`)。
 *   那不是在测"内容好不好看",是在测"**发出去的那份词表真的加载得起来**"——
 *   词表进 git 就等于是代码的一部分,它加载不起来 = **服务起不来**。
 *   (同 `test/products.test.ts` 里那组跑真内容的用例。)
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFaceCatalogModule, loadFaceVocabulary } from '../src/modules/face-catalog/index.js';
import {
  dimensionSchema,
  featureValueSchema,
  parseFaceVocabulary,
  toneTierSchema,
} from '../src/modules/face-catalog/index.js';
import { TONE_KEYS } from '../src/modules/shared/index.js';
import type { ToneKey } from '../src/modules/shared/index.js';
import { REAL_CATALOG_DIR } from './helpers/face-catalog.js';

/** 仓库里那份真词表。★ 改了它的内容,这个文件的部分用例会红——那是应该的。 */
const REAL_CATALOG = REAL_CATALOG_DIR;

// ── 内存里搭一份最小但合法的词表(纯规则用例走这条路,不碰磁盘) ──────────────

interface RawTone {
  id: string;
  label: string;
  order: number;
  isDefault: boolean;
  toneKeys: ToneKey[];
  swatch?: string;
}
interface RawValue {
  id: string;
  label: string;
  route: { kind: string; slot?: string };
}
interface Raw {
  skinTones: { version: string; disclaimer: string; tones: RawTone[] };
  features: { version: string; dimensions: { id: string; label: string; strategy: string; multi: boolean; values: RawValue[] }[] };
}

/**
 * ★ 基准样本必须**正好是那 8 档、且 id 与代码里的 `SKIN_TONES` 逐字相同**。
 *
 *   这不是"照着真词表描一遍"那么随便:校验器里有一条对账规则(档位 id 集合 ≡
 *   `SKIN_TONES`),它刻意**不接受任何残缺词表** —— 一份只有 3 档的词表在真实世界里
 *   没有存在理由,它就是"部署改坏了"。所以本文件的反例只能**在这 8 档的骨架上**
 *   制造坏点(挪 `isDefault`、撞 `order`、抽掉一个色),不能另起一套假 id;
 *   另起一套的话,每条反例都会先被对账那条拦住,测到的就不是它自己那条规则了。
 *
 * ★ 七个色也要**分完**("每个色至少有一档能用"),否则基准样本自己就带死色。
 */
function validRaw(): Raw {
  const all = [...TONE_KEYS];
  return {
    skinTones: {
      version: 'v-test',
      disclaimer: '照片难免有色差。',
      tones: [
        { id: 'cool_porcelain', label: '冷白皮·冷调', order: 1, isDefault: false, toneKeys: all.slice(0, 2) },
        { id: 'pink_porcelain', label: '粉一白·冷调', order: 2, isDefault: true, toneKeys: all.slice(2, 4) },
        { id: 'warm_ivory', label: '黄一白·暖调', order: 3, isDefault: false, toneKeys: all.slice(4, 5) },
        { id: 'warm_beige', label: '黄二白·暖调', order: 4, isDefault: false, toneKeys: all.slice(5, 6) },
        { id: 'olive', label: '橄榄皮·橄榄调', order: 5, isDefault: false, toneKeys: all.slice(6, 7) },
        // 后三档是补位:七个色已被上面分完,它们只需要非空(内容好坏不是本文件的事)。
        { id: 'warm_tan', label: '黄黑皮·暖调', order: 6, isDefault: false, toneKeys: all.slice(0, 1) },
        { id: 'wheat', label: '小麦色·暖调', order: 7, isDefault: false, toneKeys: all.slice(0, 2) },
        { id: 'deep_brown', label: '深棕皮·中性偏暖', order: 8, isDefault: false, toneKeys: all.slice(4, 7) },
      ],
    },
    features: {
      version: 'v-test',
      dimensions: [
        {
          id: 'eye_shape',
          label: '眼型',
          strategy: '决定眼线与眼影的走向',
          multi: true,
          values: [
            { id: 'upturned', label: '眼尾上扬', route: { kind: 'geometry', slot: 'eyeliner' } },
            { id: 'puffy', label: '肿眼泡', route: { kind: 'advisory' } },
          ],
        },
      ],
    },
  };
}

const FILES = { skinTones: 'skin-tones.json', features: 'features.json' };

/** 基准样本本身要能过 —— 否则下面每条反例都可能在测别的东西。 */
function parse(raw: Raw): unknown {
  return parseFaceVocabulary(raw, FILES);
}

// ── 仓库里那份真词表 ────────────────────────────────────────────────────────

describe('随包词表(assests/face-catalog)', () => {
  const vocabulary = loadFaceVocabulary(REAL_CATALOG);

  it('8 档,且按 order 升序(浅 → 深)', () => {
    expect(vocabulary.tones).toHaveLength(8);
    const orders = vocabulary.tones.map((t) => t.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('★ 缺省档不是最浅那一档(§13-3 红线的实质要求)', () => {
    const lightest = Math.min(...vocabulary.tones.map((t) => t.order));
    expect(vocabulary.defaultTier().order).toBeGreaterThan(lightest);
  });

  it('六类特征齐全', () => {
    expect(vocabulary.dimensions.map((d) => d.id)).toEqual([
      'eye_shape',
      'face_shape',
      'cheekbone',
      'lip_shape',
      'skin_type',
      'proportion',
    ]);
  });

  it('免责语是 owner 那句原文', () => {
    expect(vocabulary.disclaimer).toBe(
      '照片难免有色差,AI 给的是建议档,请按素颜自然光下的真实肤色确认。',
    );
  });

  it('每一档都取得到,色域非空,几何去向落在合法槽位上', () => {
    for (const tone of vocabulary.tones) {
      expect(vocabulary.tierById(tone.id)).toBe(tone);
      expect(tone.toneKeys.length).toBeGreaterThan(0);
    }
    for (const dimension of vocabulary.dimensions) {
      expect(dimension.values.length).toBeGreaterThan(0);
      for (const value of dimension.values) {
        expect(dimension.valueById(value.id)).toBe(value);
        if (value.route.kind === 'geometry') {
          expect(value.route.slot).toMatch(/^[a-zA-Z]+$/);
        }
      }
    }
  });
});

// ── 该炸的:规则(不碰磁盘) ─────────────────────────────────────────────────

describe('parseFaceVocabulary:坏词表一律抛错', () => {
  it('基准样本自己是合法的', () => {
    expect(() => parse(validRaw())).not.toThrow();
  });

  it('★ isDefault 那一档就是最浅档 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[0]!.isDefault = true;
    raw.skinTones.tones[1]!.isDefault = false;
    expect(() => parse(raw)).toThrow(/缺省档不许是最浅档/);
  });

  it('isDefault 一条都没有 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[1]!.isDefault = false;
    expect(() => parse(raw)).toThrow(/isDefault 必须恰好一条/);
  });

  it('isDefault 有两条 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[0]!.isDefault = true;
    expect(() => parse(raw)).toThrow(/isDefault 必须恰好一条/);
  });

  it('order 重复 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[2]!.order = 1;
    expect(() => parse(raw)).toThrow(/order 重复/);
  });

  it('档位 id 重复 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[1]!.id = raw.skinTones.tones[0]!.id;
    expect(() => parse(raw)).toThrow(/档位 id 重复/);
  });

  it('★ 词表少了一档(代码里有、词表里没有)→ 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones.splice(3, 1);
    expect(() => parse(raw)).toThrow(/与代码里的 SKIN_TONES 对不上/);
  });

  it('★ 词表多了一档(词表里有、代码里没有)→ 抛错', () => {
    const raw = validRaw();
    const extra: RawTone = {
      id: 'extra_tier',
      label: '编的一档',
      order: 9,
      isDefault: false,
      toneKeys: ['rose'],
    };
    raw.skinTones.tones.push(extra);
    expect(() => parse(raw)).toThrow(/与代码里的 SKIN_TONES 对不上/);
  });

  it('某个色在全部档位里都没人能用(死色)→ 抛错', () => {
    const raw = validRaw();
    // ★ 挑的是**在基准样本里只有一档带着的那个色**(peach 只出现在 tones[1])——
    //   换个色可能撞不出死色,因为别的档还带着它。
    raw.skinTones.tones[1]!.toneKeys = ['berry'];
    expect(() => parse(raw)).toThrow(/死色/);
  });

  it('toneKeys 空 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[0]!.toneKeys = [];
    expect(() => parse(raw)).toThrow(/面部词表内容不合法/);
  });

  it('toneKeys 含非法色 → 抛错', () => {
    const raw = validRaw();
    raw.skinTones.tones[0]!.toneKeys = ['rose', 'chartreuse' as ToneKey];
    expect(() => parse(raw)).toThrow(/面部词表内容不合法/);
  });

  it('route.slot 是词表里没有的槽位 → 抛错', () => {
    const raw = validRaw();
    raw.features.dimensions[0]!.values[0]!.route = { kind: 'geometry', slot: 'jawline' };
    expect(() => parse(raw)).toThrow(/面部词表内容不合法/);
  });

  it('同一类里取值 id 重复 → 抛错', () => {
    const raw = validRaw();
    raw.features.dimensions[0]!.values[1]!.id = 'upturned';
    expect(() => parse(raw)).toThrow(/取值 id 重复/);
  });

  it('两个文件版本对不上 → 抛错', () => {
    const raw = validRaw();
    raw.features.version = 'v-other';
    expect(() => parse(raw)).toThrow(/版本对不上/);
  });

  it('多一个不认识的键 → 抛错(.strict())', () => {
    const raw = validRaw();
    (raw.skinTones as Record<string, unknown>).tonez = [];
    expect(() => parse(raw)).toThrow(/面部词表内容不合法/);
  });
});

// ── 该炸的:文件系统那一层 ──────────────────────────────────────────────────

describe('loadFaceVocabulary:读不到就是起不来', () => {
  let dir: string;
  let tempDirs: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'face-catalog-'));
    tempDirs.push(dir);
  });
  afterEach(() => {
    for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('目录不存在 → 抛错(**不是**"安静地关掉识别")', () => {
    expect(() => loadFaceVocabulary(path.join(dir, 'nope'))).toThrow(/面部词表目录里没有/);
  });

  it('只有一半文件 → 抛错,并说清缺的是哪个', () => {
    writeFileSync(path.join(dir, 'skin-tones.json'), '{}');
    expect(() => loadFaceVocabulary(dir)).toThrow(/features\.json/);
  });

  it('JSON 语法坏 → 抛错', () => {
    writeFileSync(path.join(dir, 'skin-tones.json'), '{');
    writeFileSync(path.join(dir, 'features.json'), '{}');
    expect(() => loadFaceVocabulary(dir)).toThrow(/读不出来/);
  });

  it('createFaceCatalogModule 不吞错(缺目录 = 进程起不来)', () => {
    expect(() => createFaceCatalogModule({ contentDir: path.join(dir, 'nope') })).toThrow();
  });
});

// ── 查表行为 ────────────────────────────────────────────────────────────────

describe('FaceVocabulary 的查表', () => {
  const vocabulary = parseFaceVocabulary(validRaw(), FILES);

  it('tierById / dimensionById:查不到就是 undefined,不抛错', () => {
    expect(vocabulary.tierById('nope')).toBeUndefined();
    expect(vocabulary.dimensionById('nope')).toBeUndefined();
  });

  it('FeatureDimension.valueById 只在**本类**里找', () => {
    const eye = vocabulary.dimensionById('eye_shape');
    expect(eye?.valueById('upturned')?.label).toBe('眼尾上扬');
    // 「眼尾上扬」是眼型这一类的取值,不是别的类的。
    expect(eye?.valueById('puffy')?.route.kind).toBe('advisory');
  });

  it('allows():色域之外的色一律 false', () => {
    const light = vocabulary.tierById('cool_porcelain')!;
    expect(light.allows(light.toneKeys[0]!)).toBe(true);
    const deep = vocabulary.tierById('deep_brown')!;
    const notAllowed = deep.toneKeys.find((k) => !light.toneKeys.includes(k));
    expect(notAllowed).toBeDefined();
    expect(light.allows(notAllowed!)).toBe(false);
  });

  it('tones 按 order 升序,与书写顺序无关', () => {
    const reversed = validRaw();
    reversed.skinTones.tones.reverse();
    const v = parseFaceVocabulary(reversed, FILES);
    expect(v.tones.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

// ── ✏️ 2026-09-29:实体 ↔ schema 的对表 ──────────────────────────────────────
//
// 实体**不再自己声明字段**:形状在 `schemas/entities/vocabulary.ts` 写一次,
// 构造器 `Object.assign(this, row)` 搬过来。这么改的收益是"schema 加了字段实体不可能漏掉",
// 代价是**两个坏法都变成运行时看不出来的那种**:
//   ① 实体又手写了一个 schema 里没有的字段(键多出来);
//   ② schema 加了字段而某个构造点没传(键少一个)。
// 两边都不是报错,只是对象上多了/少了一个键 —— 只有**对表**照得见,所以下面这组就是那盏灯。
// (写法照 `test/cabinet.test.ts` 的往返那条。)

/** schema 那一份的键。写成结构类型是为了不 import zod —— 只用到 `isOptional()`。 */
const allKeys = (shape: Record<string, { isOptional(): boolean }>): string[] =>
  Object.keys(shape).sort();
const requiredKeys = (shape: Record<string, { isOptional(): boolean }>): string[] =>
  Object.keys(shape)
    .filter((k) => !shape[k]!.isOptional())
    .sort();

describe('★ 实体的键集合 = schema 的那一份(单源的对表)', () => {
  const raw = validRaw();
  // 第一档补上可选键 `swatch`:不补的话"可选键根本走不通"这条照不见。
  raw.skinTones.tones[0] = { ...raw.skinTones.tones[0]!, swatch: '#d9c79e' };
  const vocabulary = parseFaceVocabulary(raw, FILES);

  it('SkinToneTier:必填键一个不少,多出来的键一个不许有', () => {
    const tier = vocabulary.tierById('cool_porcelain')!;
    const keys = Object.keys(tier);
    // ① 少一个 = 那个构造点没接上 schema(或实体把某个字段名写错了)。
    expect(keys).toEqual(expect.arrayContaining(requiredKeys(toneTierSchema.shape)));
    // ② 多一个 = 实体又自己写了一个 schema 里没有的字段 —— 单源就白立了。
    for (const key of keys) expect(allKeys(toneTierSchema.shape)).toContain(key);
    expect(keys).toContain('swatch');
  });

  it('★ 没写 swatch 的那一档就没有这个键(可选键不许被补成 undefined)', () => {
    const tier = vocabulary.tierById('deep_brown')!;
    expect('swatch' in tier).toBe(false);
    // ★ 两边都排序:键的**顺序**是调用点书写的顺序(不是契约),集合才是。
    expect(Object.keys(tier).sort()).toEqual(requiredKeys(toneTierSchema.shape));
  });

  it('FeatureValue / FeatureDimension:同上', () => {
    const eye = vocabulary.dimensionById('eye_shape')!;
    for (const key of Object.keys(eye)) expect(allKeys(dimensionSchema.shape)).toContain(key);
    expect(Object.keys(eye)).toEqual(expect.arrayContaining(requiredKeys(dimensionSchema.shape)));

    const value = eye.valueById('upturned')!;
    for (const key of Object.keys(value)) expect(allKeys(featureValueSchema.shape)).toContain(key);
    expect(Object.keys(value).sort()).toEqual(requiredKeys(featureValueSchema.shape));
  });

  it('★ `#` 私有字段(`#byId`)不进键集合 —— JSON / `toEqual` 与改动前逐位一致', () => {
    const eye = vocabulary.dimensionById('eye_shape')!;
    expect(Object.keys(eye)).not.toContain('#byId');
    // 序列化出来应当**正好是文件里那一行**的形状(键与值都不多不少)。
    expect(JSON.parse(JSON.stringify(eye))).toEqual({
      id: 'eye_shape',
      label: '眼型',
      strategy: '决定眼线与眼影的走向',
      multi: true,
      values: [
        { id: 'upturned', label: '眼尾上扬', route: { kind: 'geometry', slot: 'eyeliner' } },
        { id: 'puffy', label: '肿眼泡', route: { kind: 'advisory' } },
      ],
    });
  });
});
