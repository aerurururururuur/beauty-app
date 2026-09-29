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
import { MakeupZone } from '../../domain/entities/look.js';
import type { Look } from '../../domain/entities/look.js';
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

/**
 * 肤色档 → 色板校正系数(>0 向白提亮偏柔,<0 向黑加深偏实;`olive` 为基准 0)。
 * ⚠️ 档位 id 改了要跟着改(`shared/domain/entities/brief.ts` 那 8 个)。
 */
const TONE_MIX: Record<SkinTone, number> = {
  cool_porcelain: 0.22,
  pink_porcelain: 0.16,
  warm_ivory: 0.1,
  warm_beige: 0.05,
  olive: 0,
  warm_tan: -0.08,
  wheat: -0.12,
  deep_brown: -0.18,
};

/**
 * 肤色档缺省。★ **必须与词表的 `isDefault` 那一档一致**(现在是 `olive`)——
 * 不一致会让"没填肤色"走的色板和界面显示的缺省档对不上。
 * 有一条测试钉着这件事(`test/mock-engine.test.ts` 里对着真词表断言)。
 */
const DEFAULT_TONE: SkinTone = 'olive';

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
    // 风格只认 brief 里的场合;拿不到就是 `STYLES.daily` 那套基线。
    const { style, palette } = specFor(input.brief?.occasion, tone);

    // ★ 对象实参,不是位置参数:七格里 `anchor` / `size` 同型,位置参数能悄悄传反。
    const zones: MakeupZone[] = ZONES.map(
      (z) =>
        new MakeupZone({
          role: z.role,
          anchor: z.anchor,
          size: z.size,
          rgb: palette[z.role],
          blend: 'multiply',
          blur: z.blur,
          opacity: z.opacity,
        }),
    );

    // ⚠️ **这份 `look` 目前没有任何消费者读它。** 出图那条路(`agent` 的 `render_look`)只取
    //    `result.image`,给人看的那句话是 `describeLook(spec)` 现算的;
    //    `validateEngineResult` 会验 `zones` / `palette` 的形状,**验完就丢**。
    //    所以下面这些格子今天等于**写完不读**——留着是因为前端设计那一轮可能要把
    //    `zones` 拿回去做「本人照片 + CSS 叠加」的预览(红线没变:要展示就得先让会话视图
    //    把它透出来)。**别当成"有人正在用"往下改**;真要删是单独一件事。
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
      // ✏️ 2026-09-29:这句原来写着「妆容按 look.zones 由前端 CSS 叠加预览」——那句话现在是假的
      //   (前端不再做这件事,而且它根本看不到 `look`)。改成只描述产物本身。
      note: '骨架演示:产物为本人照片原图,像素未改。真实像素渲染在 roadmap W2 替换。',
    };

    return {
      // mock 不真正改图:返回原图本身,由 artifact-store 收编。
      image: input.face,
      look,
    };
  }
}
