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
  FINISHES,
  IDENTITY_ANCHOR,
  TEMPLATE_VERSION,
  TONE_KEYS,
  buildPrompt,
  renderLookClauses,
} from '../src/modules/makeup/index.js';
import type { LookSpec } from '../src/modules/makeup/index.js';
import { INTENSITY_MAX, INTENSITY_MIN } from '../src/modules/makeup/index.js';

/** 一份合法的底稿,各用例在它上面改一处。 */
const SPEC: LookSpec = {
  occasion: 'interview',
  base: { coverage: 3, finish: 'satin', warmth: 0 },
  zones: {
    lip: { tone: 'rose', finish: 'matte', intensity: 3 },
    cheek: { tone: 'coral', finish: 'satin', intensity: 2 },
    eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 },
    brow: { shape: 'natural', intensity: 2 },
  },
};

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
  '睫毛',
  '眼线',
];

/** 把一句话里的每个禁词都找出来(便于失败时一次看清全貌)。 */
function hits(text: string, words: readonly string[]): string[] {
  return words.filter((w) => text.includes(w));
}

/** 穷举所有合法取值组合,产出每一份措辞。 */
function allClauseBodies(): string[] {
  const bodies: string[] = [];
  for (const tone of TONE_KEYS) {
    for (const finish of FINISHES) {
      for (const intensity of [INTENSITY_MIN, 3, INTENSITY_MAX]) {
        for (const baseFinish of FINISHES) {
          for (const warmth of [-2, -1, 0, 1, 2]) {
            const spec: LookSpec = {
              ...SPEC,
              base: { coverage: intensity as 1, finish: baseFinish, warmth },
              zones: {
                lip: { tone, finish, intensity: intensity as 1 },
                cheek: { tone, finish, intensity: intensity as 1 },
                eyeshadow: { tone, finish, intensity: intensity as 1 },
                brow: { shape: 'natural', intensity: intensity as 1 },
              },
            };
            bodies.push(renderLookClauses(spec).join('\n'));
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
    // 7 色 × 3 质地 × 3 浓度 × 3 底妆质地 × 5 冷暖 = 945 组
    expect(bodies.length).toBe(TONE_KEYS.length * FINISHES.length * 3 * FINISHES.length * 5);

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
      const withShape = renderLookClauses({
        ...SPEC,
        zones: { ...SPEC.zones, brow: { shape, intensity: 2 } },
      });
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
        renderLookClauses({
          ...SPEC,
          zones: { ...SPEC.zones, lip: { tone, finish: 'matte', intensity: 3 } },
        })
          .join('\n')
          .match(/唇部用([^、]+)、/)![1]!,
      );
    }
    expect(seen.size).toBe(TONE_KEYS.length);
  });
});

describe('buildPrompt', () => {
  it('★ 锚句之外的部分不含构图 / 服装 / 头发词', () => {
    const { prompt } = buildPrompt(SPEC, { skinTone: 'medium' });

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

  it('★ 肤色知道才写肤色锚句 —— 「不知道」和「知道但不提」是两回事', () => {
    const known = buildPrompt(SPEC, { skinTone: 'deep' }).prompt;
    expect(known).toContain('真实肤色');

    const unknown = buildPrompt(SPEC).prompt;
    expect(unknown).not.toContain('真实肤色');
    // 而且不许暗示任何一档肤色(那等于默认了一个浅肤色审美)。
    for (const t of ['浅肤色', 'light', 'deep', 'tan']) expect(unknown).not.toContain(t);
  });

  it('反向提示词覆盖身份保真的四项', () => {
    const { negativePrompt } = buildPrompt(SPEC);
    for (const w of ['变形', '换脸', '改变五官', '改变脸型']) {
      expect(negativePrompt).toContain(w);
    }
  });

  it('纯函数:同输入必同输出(夹具才可复现)', () => {
    const a = buildPrompt(SPEC, { skinTone: 'tan' });
    const b = buildPrompt(SPEC, { skinTone: 'tan' });
    expect(a).toEqual(b);
  });

  it('模板版本是个非空常量 —— 措辞一改它就得 +1,否则历史夹具变成假证据', () => {
    expect(TEMPLATE_VERSION).toBe('v1');
  });

  it('场合只作为一句语境,不带 SCENE_RULES 的 direction / tags(那里有「利落」「立体」这类词)', () => {
    const { prompt } = buildPrompt({ ...SPEC, occasion: 'stage' });
    expect(prompt).toContain('场合');
    // stage 的 tags 里有「立体」「高显色」,都不该进 prompt。
    expect(prompt).not.toContain('立体');
    expect(prompt).not.toContain('利落');
  });
});
