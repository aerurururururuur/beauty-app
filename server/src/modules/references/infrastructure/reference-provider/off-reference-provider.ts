/**
 * infrastructure/reference-provider/off-reference-provider.ts —— `REFERENCE_PROVIDER=off` 的实现。
 *
 * 「不检索」就是回空列表 —— 结果页的参考区本来就是 `v-if="references.length"` 才渲染,
 * 所以这是一条真能用的开关:素材没备齐 / 想验证「没有参考时整条链路照样跑通」时拨它。
 *
 * 与 `MockReferenceProvider` 的区别不在形状,在**它不声称任何来源** ——
 * 空列表没有 license 要标,也没有「自绘演示素材」这种占位话术要还。
 */
import type { SceneAnalysis } from '../../../understanding/index.js';
import type { ReferenceImage } from '../../domain/entities/reference.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';

export class OffReferenceProvider implements ReferenceProvider {
  readonly name = 'off';

  async fetch(_scene: SceneAnalysis): Promise<ReferenceImage[]> {
    return [];
  }
}
