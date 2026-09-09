/**
 * makeup/domain/entities/look.ts —— 妆容的结构化元信息。
 * Look 对流水线而言是不透明数据(引擎私有契约),makeup 模块自持。
 * ResultText 已拆至本模块 entities/result-text.ts;JobError 属 jobs 模块(entities/error.ts)。
 *
 * 说明:mock 引擎会在 look 里放一份前端可直接渲染的 zones/palette,
 * 未来真实引擎换成别的形状即可,流水线与 HTTP 不感知。
 */
export type Look = Record<string, unknown>;

/** 妆容叠加区(图片归一化坐标 0..1;骨架约定为正面自拍照片)。 */
export interface MakeupZone {
  /** '唇' | '颊' | '眼影' | … */
  role: string;
  /** 锚点(相对图片宽高比例)。 */
  anchor: { x: number; y: number };
  /** 尺寸(相对图片宽高比例)。 */
  size: { w: number; h: number };
  /** 叠加色 [r,g,b] 0..255。 */
  rgb: [number, number, number];
  /** CSS mix-blend-mode。 */
  blend: string;
  /** CSS 模糊像素。 */
  blur: number;
  /** 不透明度 0..1。 */
  opacity: number;
}
