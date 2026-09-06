/**
 * infrastructure/engine/mock-engine.ts —— Engine 的 mock 实现。
 * 骨架不做真实像素级上妆:把本人照片原样作为成品,同时返回结构化 look.preview
 * (palette + zones,图片归一化坐标),前端据此做 CSS 叠加预览。
 * ★ 真实引擎(参数化上妆 / 第三方图像 API)只需实现 domain/ports/engine.ts 的 2 个成员。
 */
import type { Look, MakeupZone } from '../../domain/entities/look.js';
import type { Engine, EngineInput, EngineResult } from '../../domain/ports/engine.js';

type RGB = [number, number, number];

interface ZoneSpec {
  role: string;
  anchor: { x: number; y: number };
  size: { w: number; h: number };
  rgb: RGB;
  opacity: number;
  blur: number;
}

interface StyleSpec {
  style: string;
  palette: { role: string; rgb: RGB }[];
  zones: ZoneSpec[];
}

/** 每个场景 label 对应一套「风格 + 色板 + 叠加区」,坐标假设为正面自拍。 */
const STYLES: Record<string, StyleSpec> = {
  snow: mk(
    '清透冷调 · 柔雾玫瑰',
    { 唇: [230, 178, 186], 颊: [246, 198, 190], 眼影: [198, 190, 214] },
  ),
  beach: mk(
    '元气橘粉 · 水光感',
    { 唇: [236, 132, 108], 颊: [248, 160, 128], 眼影: [224, 168, 116] },
  ),
  'red-leaf': mk(
    '枫叶暖调 · 显气色',
    { 唇: [196, 74, 62], 颊: [212, 120, 98], 眼影: [190, 118, 78] },
  ),
  city: mk(
    '冷调都市 · 轻烟熏',
    { 唇: [172, 72, 96], 颊: [198, 122, 122], 眼影: [94, 92, 116] },
  ),
  desert: mk(
    '大地暖棕 · 哑光修容',
    { 唇: [168, 96, 62], 颊: [202, 142, 100], 眼影: [152, 112, 82] },
  ),
  mountain: mk(
    '裸感自然 · 透光',
    { 唇: [210, 140, 140], 颊: [222, 170, 160], 眼影: [162, 152, 152] },
  ),
};

/** 兜底风格(未识别场景)。 */
const DEFAULT_STYLE = mk('自然日常 · 百搭', {
  唇: [204, 120, 130],
  颊: [226, 170, 160],
  眼影: [182, 162, 162],
});

function styleFor(label: string | undefined): StyleSpec {
  return STYLES[label ?? 'unknown'] ?? DEFAULT_STYLE;
}

function mk(style: string, palette: Record<string, RGB>): StyleSpec {
  const lip = palette['唇']!;
  const cheek = palette['颊']!;
  const eye = palette['眼影']!;
  return {
    style,
    palette: [
      { role: '唇', rgb: lip },
      { role: '颊', rgb: cheek },
      { role: '眼影', rgb: eye },
    ],
    zones: [
      { role: '唇', anchor: { x: 0.5, y: 0.47 }, size: { w: 0.26, h: 0.13 }, rgb: lip, opacity: 0.8, blur: 12 },
      { role: '颊', anchor: { x: 0.66, y: 0.6 }, size: { w: 0.17, h: 0.1 }, rgb: cheek, opacity: 0.28, blur: 22 },
      { role: '颊', anchor: { x: 0.34, y: 0.6 }, size: { w: 0.17, h: 0.1 }, rgb: cheek, opacity: 0.28, blur: 22 },
      { role: '眼影', anchor: { x: 0.42, y: 0.38 }, size: { w: 0.16, h: 0.05 }, rgb: eye, opacity: 0.18, blur: 8 },
      { role: '眼影', anchor: { x: 0.58, y: 0.38 }, size: { w: 0.16, h: 0.05 }, rgb: eye, opacity: 0.18, blur: 8 },
    ],
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockEngine implements Engine {
  readonly name = 'mock';

  async generate(input: EngineInput): Promise<EngineResult> {
    // 模拟“渲染”耗时,让前端轮询能看到进度。
    await sleep(450);
    const spec = styleFor(input.sceneAnalysis?.label);
    const zones: MakeupZone[] = spec.zones.map((z) => ({
      role: z.role,
      anchor: z.anchor,
      size: z.size,
      rgb: z.rgb,
      blend: 'multiply',
      blur: z.blur,
      opacity: z.opacity,
    }));

    const look: Look = {
      engine: 'mock',
      style: spec.style,
      palette: spec.palette,
      zones,
      note: '骨架演示:产物为本人照片原图,妆容由前端按 look.preview 以 CSS 叠加预览。',
    };

    return {
      // mock 不真正改图:返回原图路径,由 artifact-store 收编。
      resultFilePath: input.face.filePath,
      mimeType: input.face.mimeType,
      look,
    };
  }
}
