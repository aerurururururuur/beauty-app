/**
 * infrastructure/engine/mock-engine.ts —— Engine 的 mock 实现。
 * 骨架不做真实像素级上妆:把本人照片原样作为成品,同时返回结构化 look
 * (palette + zones,图片归一化坐标),前端据此做 CSS 叠加预览。
 * 风格按「场合 label」选,再按 brief.skinTone 调色——体现 roadmap 的
 * 「按真实肤色走、不默认浅肤色审美」。坐标几何沿用自拍正面照约定。
 *
 * ★ 真实引擎(参数化上妆 / 第三方图像 API)只需实现 domain/ports/engine.ts 的 2 个成员。
 */
import type { SkinTone } from '../../../shared/index.js';
import type { Look, MakeupZone } from '../../domain/entities/look.js';
import type { Engine, EngineInput, EngineResult } from '../../domain/ports/engine.js';

type RGB = [number, number, number];

interface PaletteDict {
  唇: RGB;
  颊: RGB;
  眼影: RGB;
}

interface StyleSpec {
  style: string;
  base: PaletteDict;
}

/** 每个场合 label 对应一套「风格 + 基准色板」;颜色在 medium 肤色基准上调。 */
const STYLES: Record<string, StyleSpec> = {
  interview: {
    style: '正式得体 · 哑光大地色',
    base: { 唇: [188, 118, 122], 颊: [214, 150, 130], 眼影: [166, 128, 104] },
  },
  date: {
    style: '温柔水光 · 粉调提气色',
    base: { 唇: [214, 132, 138], 颊: [244, 178, 168], 眼影: [210, 156, 158] },
  },
  stage: {
    style: '上台高显色 · 立体哑光',
    base: { 唇: [178, 66, 84], 颊: [226, 130, 108], 眼影: [122, 88, 120] },
  },
  family: {
    style: '温婉自然 · 豆沙提气色',
    base: { 唇: [198, 128, 132], 颊: [228, 168, 150], 眼影: [186, 150, 142] },
  },
  daily: {
    style: '自然伪素颜 · 通透百搭',
    base: { 唇: [212, 142, 144], 颊: [232, 176, 160], 眼影: [188, 170, 168] },
  },
};

/** 肤色档 → 色板校正系数(>0 向白提亮偏柔,<0 向黑加深偏实;medium 为基准)。 */
const TONE_MIX: Record<SkinTone, number> = {
  light: 0.22,
  light_medium: 0.1,
  medium: 0,
  tan: -0.08,
  deep: -0.16,
};

/** 肤色档缺省走中间档(不以浅肤色为默认)。 */
const DEFAULT_TONE: SkinTone = 'medium';

function mixWith(c: RGB, towardWhite: number): RGB {
  const target = towardWhite >= 0 ? 255 : 0;
  const f = Math.abs(towardWhite);
  const t = (v: number) => Math.round(v + (target - v) * f);
  return [t(c[0]), t(c[1]), t(c[2])];
}

/** 选场合基准风格并按肤色档校正色板。 */
function specFor(label: string | undefined, tone: SkinTone): { style: string; palette: PaletteDict } {
  const s = STYLES[label ?? ''] ?? STYLES.daily!;
  const mix = TONE_MIX[tone] ?? TONE_MIX[DEFAULT_TONE];
  const adjust = (c: RGB): RGB => mixWith(c, mix);
  const palette: PaletteDict = {
    唇: adjust(s.base.唇),
    颊: adjust(s.base.颊),
    眼影: adjust(s.base.眼影),
  };
  return { style: s.style, palette };
}

const ZONES = [
  { role: '唇' as const, anchor: { x: 0.5, y: 0.47 }, size: { w: 0.26, h: 0.13 }, opacity: 0.8, blur: 12 },
  { role: '颊' as const, anchor: { x: 0.66, y: 0.6 }, size: { w: 0.17, h: 0.1 }, opacity: 0.28, blur: 22 },
  { role: '颊' as const, anchor: { x: 0.34, y: 0.6 }, size: { w: 0.17, h: 0.1 }, opacity: 0.28, blur: 22 },
  { role: '眼影' as const, anchor: { x: 0.42, y: 0.38 }, size: { w: 0.16, h: 0.05 }, opacity: 0.18, blur: 8 },
  { role: '眼影' as const, anchor: { x: 0.58, y: 0.38 }, size: { w: 0.16, h: 0.05 }, opacity: 0.18, blur: 8 },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockEngine implements Engine {
  readonly name = 'mock';

  async generate(input: EngineInput): Promise<EngineResult> {
    // 模拟“渲染”耗时,让前端轮询能看到进度。
    await sleep(450);
    const tone = input.brief?.skinTone ?? DEFAULT_TONE;
    const { style, palette } = specFor(input.scene?.label, tone);

    const zones: MakeupZone[] = ZONES.map((z) => ({
      role: z.role,
      anchor: z.anchor,
      size: z.size,
      rgb: palette[z.role],
      blend: 'multiply',
      blur: z.blur,
      opacity: z.opacity,
    }));

    const look: Look = {
      engine: 'mock',
      style,
      skinTone: tone,
      palette: [
        { role: '唇', rgb: palette['唇'] },
        { role: '颊', rgb: palette['颊'] },
        { role: '眼影', rgb: palette['眼影'] },
      ],
      zones,
      note: '骨架演示:产物为本人照片原图,妆容按 look.zones 由前端 CSS 叠加预览;真实像素渲染在 roadmap W2 替换。',
    };

    return {
      // mock 不真正改图:返回原图路径,由 artifact-store 收编。
      resultFilePath: input.face.filePath,
      mimeType: input.face.mimeType,
      look,
    };
  }
}
