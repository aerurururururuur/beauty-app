/**
 * infrastructure/reference-provider/off-reference-provider.ts —— `REFERENCE_PROVIDER=off` 的实现。
 *
 * 「不检索」就是回空列表 —— 结果页的参考区本来就是 `v-if="references.length"` 才渲染,
 * 所以这是一条真能用的开关:素材没备齐 / 想验证「没有参考时整条链路照样跑通」时拨它。
 *
 * 与 `MockReferenceProvider` 的区别不在形状,在**它一条记录都不产生** ——
 * mock 会给出「有标题、没图片、没出处」的条目,而 off 是彻底的空。
 * 想验证「没有参考时整条链路照样跑通」用 off;想在结果页看到参考区长什么样用 mock。
 */
import type { SceneDescriptor } from '../../../shared/index.js';
import type { ReferenceImage } from '../../domain/entities/reference.js';
import type { ReferenceProvider } from '../../domain/ports/reference-provider.js';

export class OffReferenceProvider implements ReferenceProvider {
  readonly name = 'off';

  async fetch(_scene: SceneDescriptor): Promise<ReferenceImage[]> {
    return [];
  }
}
