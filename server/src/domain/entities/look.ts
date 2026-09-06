/**
 * domain/entities/look.ts —— 妆容与文案的领域结构。
 * Look 对流水线而言是不透明数据(引擎私有契约);ResultText 为面向用户的文案结果。
 *
 * 说明:mock 引擎会在 look 里放一份前端可直接渲染的 preview(zones/palette),
 * 未来真实引擎换成别的形状即可,流水线与 HTTP 不感知。
 */
export type Look = Record<string, unknown>;

/** 面向用户的文案结果。 */
export interface ResultText {
  analysis: string;
  explain: string;
  tips: string[];
}

/** 任务失败时的领域错误(无 HTTP 概念;状态码映射在 presentation 层)。 */
export interface JobError {
  code: string;
  message: string;
}

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
