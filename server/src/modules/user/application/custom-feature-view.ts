/**
 * application/custom-feature-view.ts —— 领域 CustomFeature → 对外 CustomFeatureView。纯投影,无 IO。
 * ★ 丢掉 `userId`:那是库内记账,摆一个 chip 用不着,而下发一次就多一次"前端以为它有用"的机会。
 * ★ **留着 `id`**(与肤色档那格不同):删这一条要按 id 走 `DELETE /personas/features/:id`。
 */
import type { CustomFeature } from '../domain/entities/custom-feature.js';
import type { CustomFeatureView } from '../domain/schemas/index.js';

export function toCustomFeatureView(item: CustomFeature): CustomFeatureView {
  return { id: item.id, group: item.group, text: item.text };
}
