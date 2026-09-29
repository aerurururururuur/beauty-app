/**
 * makeup/domain/ports/vision.ts —— 「给几张图 + 一句中文,回一段文本」的唯一一条缝。
 *
 * ★ **出了这里,三个分析器看到的是中性的东西。** 厂商名、多模态请求体的形状、重试与超时,
 *   全关在 `infrastructure/vision/` 里 —— 与 `engine.ts` 对 `image-engine.ts` 的关系一样。
 *
 * ★ 返回**原始文本**,不是解析过的对象。解析是边界上的事,§7.2 指定它的落点在
 *   `domain/validators/analysis.validator.ts` 的 `parseVisionReply`。在这里解析的话,
 *   三个分析器各要处理一次「模型没按格式回答」—— 而那是同一件事。
 */
import type { ResolvedImage } from '../../../shared/index.js';

export interface VisionRequest {
  /**
   * 要看的图,**按顺序**(顺序对模型是语义的一部分)。
   * 复用 `ResolvedImage`:它已经是一张可读的本机绝对路径,不新造类型。
   */
  images: readonly ResolvedImage[];
  /** 中文提问。**只做分类**,不做描述 —— 理由见 `infrastructure/vision/*-analyzer.ts`。 */
  prompt: string;
}

export interface VisionClient {
  /** 进日志用的名字,形如 `dashscope:qwen-vl-max`。 */
  readonly name: string;
  ask(request: VisionRequest): Promise<string>;
}
