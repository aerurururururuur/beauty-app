/**
 * domain/ports/reference-provider.ts —— 参考图来源端口(可选缝)。
 * 给定场景分析,返回带授权来源标注的参考图条目。
 * 骨架返回预设;未来可接网页/资源库搜索实现。
 */
import type { SceneDescriptor } from '../../../shared/index.js';
import type { ReferenceImage } from '../entities/reference.js';

export interface ReferenceProvider {
  readonly name: string;
  fetch(scene: SceneDescriptor): Promise<ReferenceImage[]>;
}
