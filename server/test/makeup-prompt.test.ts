/**
 * 提示词模板单测 —— **阶段 1 的验收门槛之一**(§5.2 / §12.1「提示词零漂移」)。
 *
 * ★ 这一组盯的不是"文案好不好",是**一条硬断言**:
 *   **模板产出里不许出现几何词、构图词、服装词、背景词。**
 *
 * 依据是 §4.4 的四次实测:
 * - run 1:照旧妆面稿跑(含构图/服装/背景)→ **五官身份全换**;
 * - run 3:剥掉构图条款但留着几何词(「放大感美瞳」「外眼角加长」)→ **仍然漂**;
 * - run 4:几何词也删掉、只留色/质地/浓度 → **身份保住且妆效清楚可见**。
 *
 * 所以"无几何词"不是风格偏好,是**这条路径唯一被实测支持的约束**。
 *
 * ⚠️ **扫描范围有个刻意的切法。** 整段 prompt 里有 `IDENTITY_ANCHOR`,
 *   而锚句里必然出现「背景」「发型」——那是**保护性**表述(「背景不变」),
 *   与 run 1 翻车的「纯白工作室背景」(**改成**它)是两回事。
 *   因此:`renderLookClauses()` 的输出按**全表**扫,整段 prompt 按**窄表**扫。
 *   这个切法本身是有意的,不是为了让测试变绿而放宽。
 */
import { describe, expect, it } from 'vitest';
import {
  ADDED_ZONE_ROLES,
  BrowSpec,
  FINISHES,
  IDENTITY_ANCHOR,
  LookSpec,
  LookSpecBase,
  TEMPLATE_VERSION,
  TONE_KEYS,
  ZONE_ROLES,
  ZoneSpec,
  buildPrompt,
  renderLookClauses,
} from '../src/modules/makeup/index.js';
import { DEPTHS, INTENSITY_MAX, INTENSITY_MIN, SATURATIONS } from '../src/modules/makeup/index.js';
import type { Depth, Saturation } from '../src/modules/makeup/index.js';
import { SKIN_TONES } from '../src/modules/shared/index.js';

/** 一份合法的底稿,各用例在它上面改一处。 */
const SPEC = new LookSpec({
  occasion: 'interview',
  base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
  zones: {
    lip: new ZoneSpec({ tone: 'rose', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
    cheek: new ZoneSpec({ tone: 'coral', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    eyeshadow: new ZoneSpec({ tone: 'nude', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
  },
});

/**
 * ✏️ 2026-10-01:**九个区全填上**的那一份底稿。
 * ★ 新区用**内联字面量**逐格写出来(不写循环):六格各有各的名字,而 `.strict()` 的
 *   妆面单里多一格少一格都编译不过——循环写会把这个保护绕掉。
 */
const FULL_SPEC = new LookSpec({
  occasion: 'interview',
  base: SPEC.base,
  zones: {
    lip: SPEC.zones.lip,
    cheek: SPEC.zones.cheek,
    eyeshadow: SPEC.zones.eyeshadow,
    brow: SPEC.zones.brow,
    concealer: new ZoneSpec({ tone: 'peach', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    contour: new ZoneSpec({ tone: 'brick', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    highlight: new ZoneSpec({ tone: 'nude', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    aegyoSal: new ZoneSpec({ tone: 'peach', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    liner: new ZoneSpec({ tone: 'plum', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
    lash: new ZoneSpec({ tone: 'plum', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
  },
});

/**
 * ★ **几何词表** —— 逐条来自 §4.4.1 与 §4.4.3 的表,不是随手列的。
 * 前两组是 run 3 漂移的直接原因;第三组是 run 4 删掉后才成功的那些。
 */
const GEOMETRY_WORDS = [
  // §4.4.1:妆面描述里的几何动词
  '放大',
  '拉长',
  '上扬',
  '加长',
  '加厚',
  '浓密',
  '卷翘',
  '缩小',
  '变宽',
  '变窄',
  '渐变',
  // §4.4.3:run 4 删掉的「位置 / 轮廓」类
  '眼尾',
  '眼角',
  '唇线',
  '外环',
  '下眼',
  '轮廓',
  '晕染',
  // §4.4.3:run 4 删掉的眉形那个字
  '眉形',
  '平眉',
  '挑眉',
  '眉峰',
  '拱',
];

/** 构图 / 服装 / 背景 / 头发类。§4.1:模板里**没有这些槽位**。 */
const STAGING_WORDS = [
  '特写',
  '构图',
  '裁切',
  '取景',
  '镜头',
  '分辨率',
  '工作室',
  '背景',
  '裸肩',
  '服装',
  '穿搭',
  '发型',
  '发丝',
  '碎发',
  '刘海',
  '盘发',
  '美瞳',
  // ⚠️ ✏️ 2026-10-01 **从这里删掉了「睫毛」「眼线」两条**。它们进这张表是因为
  //   §4.1「模板里没有这些槽位」;现在每一步都要出图,这两个部位就得有槽位。
  //   这是**明知故犯**:这两句措辞没有实测支撑,风险与 run 3 的「放大感美瞳」同类,
  //   记在 `modules/makeup/README.md` 的重测待办里。
];

/** 把一句话里的每个禁词都找出来(便于失败时一次看清全貌)。 */
function hits(text: string, words: readonly string[]): string[] {
  return words.filter((w) => text.includes(w));
}

/** 穷举所有合法取值组合,产出每一份措辞。 */
function allClauseBodies(): string[] {
  const bodies: string[] = [];
  for (const tone of TONE_KEYS) {
    for (const depth of DEPTHS) {
      for (const saturation of SATURATIONS) {
        for (const finish of FINISHES) {
          for (const intensity of [INTENSITY_MIN, 3, INTENSITY_MAX]) {
            for (const baseFinish of FINISHES) {
              for (const warmth of [-2, -1, 0, 1, 2]) {
              // ★ 不再写 `as 1` 断言:构造器收的 row 里浓度就是宽的 `number`
              //   (`.int()` 是类型声明,`1..5` 的区间在 validator,§4.2),循环变量本来就是这个类型。
              //   改口径前那句 `as 1` 是把 3 和 5 说成 `1` —— 一个假断言,顺手去掉。
                const spec = new LookSpec({
                  occasion: SPEC.occasion,
                  base: new LookSpecBase({ coverage: intensity, finish: baseFinish, warmth }),
                  zones: {
                    lip: new ZoneSpec({ tone, depth, saturation, finish, intensity }),
                    cheek: new ZoneSpec({ tone, depth, saturation, finish, intensity }),
                    eyeshadow: new ZoneSpec({ tone, depth, saturation, finish, intensity }),
                    brow: new BrowSpec({ shape: 'natural', intensity }),
                  },
                });
                bodies.push(renderLookClauses(spec).join('\n'));
              }
            }
          }
        }
      }
    }
  }
  return bodies;
}

describe('renderLookClauses —— 只输出色 / 质地 / 浓度', () => {
  it('★ 穷举全部合法取值组合,一个几何词都不出现', () => {
    const bodies = allClauseBodies();
    // 8 色 × 3 深浅 × 3 饱和 × 3 质地 × 3 浓度 × 3 底妆质地 × 5 冷暖 = 9720 组
    expect(bodies.length).toBe(
      TONE_KEYS.length * DEPTHS.length * SATURATIONS.length * FINISHES.length * 3 * FINISHES.length * 5,
    );

    const bad = bodies.filter((b) => hits(b, GEOMETRY_WORDS).length > 0);
    expect(bad, `以下组合产出了几何词:\n${bad.slice(0, 3).join('\n')}`).toEqual([]);
  });

  it('★ 穷举全部组合,也没有构图 / 服装 / 背景 / 头发的槽位', () => {
    const bad = allClauseBodies().filter((b) => hits(b, STAGING_WORDS).length > 0);
    expect(bad, `以下组合产出了置景词:\n${bad.slice(0, 3).join('\n')}`).toEqual([]);
  });

  it('★ 眉部只输出浓度 —— run 4 删掉的正是眉形那个字', () => {
    const lines = renderLookClauses(SPEC);
    const brow = lines.find((l) => l.startsWith('眉部'))!;

    // 三种眉形都不该改变这一行:形状字段被刻意忽略。
    for (const shape of ['natural', 'soft_arch', 'straight'] as const) {
      const withShape = renderLookClauses(
        new LookSpec({
          occasion: SPEC.occasion,
          base: SPEC.base,
          zones: { ...SPEC.zones, brow: new BrowSpec({ shape, intensity: 2 }) },
        }),
      );
      expect(withShape.find((l) => l.startsWith('眉部'))).toBe(brow);
    }
  });

  it('色 / 质地 / 浓度确实被写出来了(不是把内容删空换来的"无禁词")', () => {
    const body = renderLookClauses(SPEC).join('\n');
    expect(body).toContain('玫瑰粉'); // 色
    expect(body).toContain('雾面'); // 质地
    expect(body).toContain('中等'); // 浓度
    expect(body).toContain('底妆');
    expect(body).toContain('唇部');
    expect(body).toContain('腮红');
    expect(body).toContain('眼影');
  });

  it('枚举加一档会编译不过(每张词表都是完整 Record)', () => {
    // 这里只钉住"覆盖是穷举的"这个事实:7 个色相、3 种质地各有一条措辞。
    const seen = new Set<string>();
    for (const tone of TONE_KEYS) {
      seen.add(
        renderLookClauses(
          new LookSpec({
            occasion: SPEC.occasion,
            base: SPEC.base,
            zones: {
              ...SPEC.zones,
              lip: new ZoneSpec({ tone, depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
            },
          }),
        )
          .join('\n')
          .match(/唇部用([^、]+)、/)![1]!,
      );
    }
    expect(seen.size).toBe(TONE_KEYS.length);
  });

  /**
   * ★★ **深浅是"新增取值",不是"改写那三句"** —— 这条测试就是这两件事的分界:
   *   `medium` 档的产出必须与加 `depth` 之前**逐字相同**(v2 的实测条款还在),
   *   `light` / `deep` 只是在色相词前面多一个字。
   */
  it('★ 深浅只有浅 / 深两个前缀,中档逐字同 v2', () => {
    const withDepth = (depth: Depth): string =>
      renderLookClauses(
        new LookSpec({
          occasion: SPEC.occasion,
          base: SPEC.base,
          zones: { ...SPEC.zones, lip: new ZoneSpec({ tone: 'rose', depth, saturation: 'medium', finish: 'matte', intensity: 3 }) },
        }),
      )[1]!;

    // 中档逐字:就是 v2 那句原话,连标点都没动。
    expect(withDepth('medium')).toBe('唇部用玫瑰粉、雾面质地、中等浓度。');
    expect(withDepth('light')).toBe('唇部用浅玫瑰粉、雾面质地、中等浓度。');
    expect(withDepth('deep')).toBe('唇部用深玫瑰粉、雾面质地、中等浓度。');

    // 三个档位三种产出 —— 没有哪一档是"另一档的别名"。
    expect(new Set(DEPTHS.map(withDepth)).size).toBe(DEPTHS.length);
  });

  /**
   * ★★ 与深浅**同一条分界**:`medium` 档逐字同 v3(也就是同 v2),
   *   `low` / `high` 只是再往色相词前面叠一层。顺序是「饱和 → 深浅 → 色相」。
   */
  it('★ 饱和只有低 / 高两个前缀,中档逐字同 v3', () => {
    const withSat = (saturation: Saturation): string =>
      renderLookClauses(
        new LookSpec({
          occasion: SPEC.occasion,
          base: SPEC.base,
          zones: { ...SPEC.zones, lip: new ZoneSpec({ tone: 'rose', depth: 'medium', saturation, finish: 'matte', intensity: 3 }) },
        }),
      )[1]!;

    expect(withSat('medium')).toBe('唇部用玫瑰粉、雾面质地、中等浓度。');
    expect(withSat('low')).toBe('唇部用低饱和玫瑰粉、雾面质地、中等浓度。');
    expect(withSat('high')).toBe('唇部用高饱和玫瑰粉、雾面质地、中等浓度。');

    expect(new Set(SATURATIONS.map(withSat)).size).toBe(SATURATIONS.length);
  });

  it('★ 饱和与深浅同时给时,顺序是「低饱和浅玫瑰粉」', () => {
    const line = renderLookClauses(
      new LookSpec({
        occasion: SPEC.occasion,
        base: SPEC.base,
        zones: {
          ...SPEC.zones,
          lip: new ZoneSpec({ tone: 'rose', depth: 'light', saturation: 'low', finish: 'matte', intensity: 3 }),
        },
      }),
    )[1]!;
    expect(line).toBe('唇部用低饱和浅玫瑰粉、雾面质地、中等浓度。');
  });

  it('★ 棕色进了词表,渲染成「棕色」', () => {
    const line = renderLookClauses(
      new LookSpec({
        occasion: SPEC.occasion,
        base: SPEC.base,
        zones: { ...SPEC.zones, lip: new ZoneSpec({ tone: 'brown', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }) },
      }),
    )[1]!;
    expect(line).toBe('唇部用棕色、雾面质地、中等浓度。');
  });
});

/** 九个区在措辞里的名字。★ 测试**故意抄一份**:这条断言要钉的就是"那句话长什么样"。 */
const ZONE_NAME = {
  lip: '唇部',
  cheek: '腮红',
  eyeshadow: '眼影',
  concealer: '遮瑕',
  contour: '修容',
  highlight: '提亮',
  aegyoSal: '卧蚕',
  liner: '眼线',
  lash: '睫毛',
} as const;

const MEASURED_NAMES = ['唇部', '腮红', '眼影'];

/**
 * 某个区那条措辞在第几行。
 * ⚠️ **认行首不认包含**:底妆那句里就有「遮瑕」二字(「中等遮瑕的…」),
 *   拿 `includes` 找 `concealer` 会认到那一行上去。
 */
function zoneLine(lines: readonly string[], name: string): number {
  return lines.findIndex((l) => l.startsWith(`${name}用`));
}

describe('✏️ 2026-10-01 新增的六个区', () => {
  it('每一个新区都真的被写出来了(不是把内容删空换来的"无禁词")', () => {
    const lines = renderLookClauses(FULL_SPEC);
    // 底妆 + 九个区 + 眉部 = 11 行:一个区都没漏。
    expect(lines).toHaveLength(ZONE_ROLES.length + 2);
    for (const role of ADDED_ZONE_ROLES) {
      expect(zoneLine(lines, ZONE_NAME[role]), `${role} 没有措辞`).toBeGreaterThan(-1);
    }
  });

  it('★ 新增的六个区不含几何词 —— 那两条禁词这次放行了,别处不许再漏进来', () => {
    const body = renderLookClauses(FULL_SPEC).join('\n');
    expect(hits(body, GEOMETRY_WORDS)).toEqual([]);
    expect(hits(body, STAGING_WORDS)).toEqual([]);
  });

  it('★ 新区追加在实测那三句之后 —— 插进中间等于对那份实测做第二次未验证的改动', () => {
    const lines = renderLookClauses(FULL_SPEC);
    for (const measured of MEASURED_NAMES) {
      for (const added of ADDED_ZONE_ROLES) {
        expect(zoneLine(lines, measured)).toBeLessThan(zoneLine(lines, ZONE_NAME[added]));
      }
    }
  });
});

describe('renderLookClauses(spec, applied) —— 逐步累积出图', () => {
  it('只渲染 `applied` 里那几个区,底妆与眉部照旧每一张都带', () => {
    const lines = renderLookClauses(FULL_SPEC, ['lip']);
    expect(lines).toHaveLength(3); // 底妆 + 唇部 + 眉部
    expect(lines[0]).toContain('底妆');
    expect(zoneLine(lines, ZONE_NAME.lip)).toBe(1);
  });

  it('`applied` 是空数组 ⇒ 只剩底妆与眉部(**不是**"等于没给")', () => {
    expect(renderLookClauses(FULL_SPEC, [])).toHaveLength(2);
  });

  it('★ 给全套 ⇒ 与不给时逐字相同(最后一张累积图 = 今天那张成片)', () => {
    expect(renderLookClauses(FULL_SPEC, ZONE_ROLES)).toEqual(renderLookClauses(FULL_SPEC));
  });
});

describe('buildPrompt', () => {
  it('★ 锚句之外的部分不含构图 / 服装 / 头发词', () => {
    const { prompt } = buildPrompt(SPEC, { skinTone: 'olive' });

    // ★ 必须先剥掉锚句再扫,这不是为了让测试变绿:
    //   锚句是**固定文本**,里面有「背景」「发型」——那是**保护性**表述(「…背景、光线 全部不变」),
    //   与 run 1 翻车的「纯白工作室背景」(**改成**它)是两回事。
    //   真正该断言的是「**随 spec 变化的那部分**不许下令重摆设景」,所以扫描从锚句之后开始。
    expect(prompt.startsWith(IDENTITY_ANCHOR)).toBe(true);
    const body = prompt.slice(IDENTITY_ANCHOR.length);

    const staging = ['特写', '构图', '裁切', '取景', '工作室', '裸肩', '发型', '发丝', '刘海', '盘发'];
    expect(hits(body, staging)).toEqual([]);

    // 反向断言:锚句里确实**有**这些词,否则上面那条剥离就是多余的仪式。
    expect(hits(IDENTITY_ANCHOR, ['背景', '发型']).length).toBe(2);
  });

  it('带身份锚句,且锚句在最前面', () => {
    const { prompt } = buildPrompt(SPEC);
    expect(prompt.startsWith(IDENTITY_ANCHOR)).toBe(true);
  });

  it('★ 分步那张补「未列出的部位保持素颜」;全套那张**一个字都不加**', () => {
    expect(buildPrompt(FULL_SPEC, { appliedZones: ['lip'] }).prompt).toContain('保持素颜');
    // ⚠️ 全套那张加了这句 = 改掉今天那张成片的措辞,而它没有实测支撑。
    expect(buildPrompt(FULL_SPEC, { appliedZones: ZONE_ROLES }).prompt).not.toContain('保持素颜');
    expect(buildPrompt(FULL_SPEC).prompt).not.toContain('保持素颜');
  });

  it('★ 肤色知道才写肤色锚句 —— 「不知道」和「知道但不提」是两回事', () => {
    const known = buildPrompt(SPEC, { skinTone: 'deep_brown' }).prompt;
    expect(known).toContain('真实肤色');

    const unknown = buildPrompt(SPEC).prompt;
    expect(unknown).not.toContain('真实肤色');
    // 而且不许暗示任何一档肤色(那等于默认了一个浅肤色审美)。
    // ★ 扫的是**代码里那份元组的全部 8 档**,不是手抄几个:手抄的清单会在加档时静默过期,
    //   而"新加的那一档没被扫到"恰好是这条断言唯一会漏的方式。
    for (const t of ['浅肤色', ...SKIN_TONES]) expect(unknown).not.toContain(t);
  });

  it('反向提示词覆盖身份保真的四项', () => {
    const { negativePrompt } = buildPrompt(SPEC);
    for (const w of ['变形', '换脸', '改变五官', '改变脸型']) {
      expect(negativePrompt).toContain(w);
    }
  });

  it('纯函数:同输入必同输出(夹具才可复现)', () => {
    const a = buildPrompt(SPEC, { skinTone: 'warm_tan' });
    const b = buildPrompt(SPEC, { skinTone: 'warm_tan' });
    expect(a).toEqual(b);
  });

  it('模板版本是个非空常量 —— 措辞一改它就得 +1,否则历史夹具变成假证据', () => {
    expect(TEMPLATE_VERSION).toBe('v4');
  });

  it('场合只作为一句语境,不带 SCENE_RULES 的 direction / tags(那里有「利落」「立体」这类词)', () => {
    const { prompt } = buildPrompt(
      new LookSpec({ occasion: 'stage', base: SPEC.base, zones: SPEC.zones }),
    );
    expect(prompt).toContain('场合');
    // stage 的 tags 里有「立体」「高显色」,都不该进 prompt。
    expect(prompt).not.toContain('立体');
    expect(prompt).not.toContain('利落');
  });
});
