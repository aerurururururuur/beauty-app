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
import { frontendFeatureGroups, frontendFeatures } from './helpers/frontend-kb.js';

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
/**
 * ★ 四格文案(`label` / `desc` / `fix` / `products`)**不是可选的**:
 *   它们是 2026-09-30 从前端 `kb/features.js` 搬进来的,`featureValueSchema` 里都带 `min(1)`。
 *   基准样本漏掉任何一格,下面每条反例都会先被 zod 拦住,测到的就不是它自己那条规则了。
 *   (`products` 是知识库原文里的**产品名**,自由文本,别拿它当 `pid`。)
 */
interface RawValue {
  id: string;
  label: string;
  desc: string;
  fix: string;
  products: string[];
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
 *
 * ⚠️ **只有档位 id 有这条约束。** 特征类的 id / 取值 id 是**随手编的**
 *   (校验器不对它们与代码对账,只查重复),真词表那六个类叫什么、31 条取值叫什么,
 *   归下面「随包词表」那组管 —— 别从这里读真 id。
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
            {
              id: 'upturned',
              label: '眼尾上扬',
              desc: '眼头低、眼尾高。',
              fix: '眼线不要上扬,沿眼睑弧度自然下垂拉长。',
              products: ['眼线笔'],
              route: { kind: 'geometry', slot: 'eyeliner' },
            },
            {
              id: 'puffy',
              label: '肿眼泡',
              desc: '上眼皮脂肪层厚。',
              fix: '只用哑光大地色,避开珠光。',
              products: ['哑光眼影盘'],
              route: { kind: 'advisory' },
            },
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
    // ★ 这六个 id 2026-09-30 起就是**前端 `FEATURE_GROUPS` 那六个**(见下面跨端对表那条)。
    //   这里硬写一份不是重复:跨端对表管的是"两边一样",这条管的是"发出去的这份词表
    //   确实是这六类"——两边一起漂走的坏法只有这条看得见。
    expect(vocabulary.dimensions.map((d) => d.id)).toEqual([
      'eye',
      'face',
      'cheek',
      'lip',
      'skin',
      'ratio',
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

  // ★ 取值 id 查的是**全表唯一**,不是"类内唯一" —— `brief.features` 收的是裸 id,
  //   两个类里同名会反查错条目。所以下面两条都撞在这同一道闸门上,只是撞法不同。
  it('同一类里取值 id 重复 → 抛错', () => {
    const raw = validRaw();
    raw.features.dimensions[0]!.values[1]!.id = 'upturned';
    expect(() => parse(raw)).toThrow(/取值 id「upturned」.*都出现了/);
  });

  it('★ 不同类之间取值 id 撞了也抛错(错在这里的坏词表查表时会静默取错条目)', () => {
    const raw = validRaw();
    raw.features.dimensions.push({
      id: 'lip',
      label: '唇形',
      strategy: '决定唇线怎么勾',
      multi: true,
      // 抄的是上面「眼型」那一类的 id —— 单看这一类它完全合法。
      values: [
        {
          id: 'upturned',
          label: '嘴角上扬',
          desc: '嘴角天然高于唇中。',
          fix: '唇线不要重新勾勒唇角。',
          products: ['唇线笔'],
          route: { kind: 'advisory' },
        },
      ],
    });
    expect(() => parse(raw)).toThrow(/取值 id「upturned」在「眼型」和「唇形」里都出现了/);
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
        {
          id: 'upturned',
          label: '眼尾上扬',
          desc: '眼头低、眼尾高。',
          fix: '眼线不要上扬,沿眼睑弧度自然下垂拉长。',
          products: ['眼线笔'],
          route: { kind: 'geometry', slot: 'eyeliner' },
        },
        {
          id: 'puffy',
          label: '肿眼泡',
          desc: '上眼皮脂肪层厚。',
          fix: '只用哑光大地色,避开珠光。',
          products: ['哑光眼影盘'],
          route: { kind: 'advisory' },
        },
      ],
    });
  });
});

// ── ✏️ 2026-09-30:与前端 `kb/features.js` 的对表 ────────────────────────────
//
// 这 31 条特征 id / 名称 / 三格文案是**从用户数据那边来**的,不是后端发明的:
// `localStorage` 里的人设存的就是 `features: ['eye-drop', …]`。所以后端这一份
// 必须与前端那一份**逐字相同** —— 两边漂开的坏法是"用户勾了 A、方案里印出 B",
// 而界面上看不出来(§4.2 那条"内容与展示必须对得上")。
//
// ★ 分组 id 是**同一件事的另一半**:`brief.features` 存的是裸 id,
//   方案里要按 `group` 去查分组中文名,所以分组 id 也得对得上。

describe('★ 与前端 kb/features.js 的对表(用户数据那边说了算)', () => {
  const vocabulary = loadFaceVocabulary(REAL_CATALOG);

  it('31 条取值:id / label / desc / fix / products 逐条相同', async () => {
    const frontend = await frontendFeatures();

    // 先把两边的条数钉住:少了任何一边的条目,下面的对表会因为"找不到"而红,
    // 但那时候的错误信息会指向某一条,**看不出是"整体少了一半"**。
    expect(frontend).toHaveLength(31);

    const backendById = new Map(
      vocabulary.dimensions
        .flatMap((d) => d.values)
        .map((value) => [value.id, value] as const),
    );
    expect(backendById.size).toBe(31);

    for (const fe of frontend) {
      const be = backendById.get(fe.id);
      expect(be, `后端词表里没有 ${fe.id}`).toBeDefined();
      expect(be?.label).toBe(fe.name);
      expect(be?.desc).toBe(fe.desc);
      expect(be?.fix).toBe(fe.fix);
      // 展开成新数组再比:后端实体上那一格是 `readonly`,`toEqual` 会因只读标记不同而红。
      expect([...(be?.products ?? [])]).toEqual(fe.products);
    }
  });

  it('6 个分组:后端 label / strategy = 前端 name / hint', async () => {
    const groups = await frontendFeatureGroups();

    expect(groups).toHaveLength(6);
    expect(vocabulary.dimensions).toHaveLength(6);

    for (const [i, g] of groups.entries()) {
      const be = vocabulary.dimensionById(g.id);
      expect(be, `后端词表里没有分组 ${g.id}`).toBeDefined();
      expect(be?.label).toBe(g.name);
      expect(be?.strategy).toBe(g.hint);
      // 顺序也要一致:方案里「针对本人」那一块是按 `FEATURE_GROUPS` 的次序排的。
      expect(vocabulary.dimensions[i]?.id).toBe(g.id);
    }
  });

  it('★ 每条取值都落在前端**确实存在**的分组里(不是"分组名自己写的")', async () => {
    const groups = await frontendFeatureGroups();
    const groupIds = new Set(groups.map((g) => g.id));
    const frontend = await frontendFeatures();

    for (const fe of frontend) expect(groupIds.has(fe.group)).toBe(true);
    for (const d of vocabulary.dimensions) expect(groupIds.has(d.id)).toBe(true);
  });
});
