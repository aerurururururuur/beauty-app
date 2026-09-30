/**
 * application/skin-tone-view.ts —— 领域 SkinTone → 对外 SkinToneView。纯投影,无 IO。
 * ★ 丢掉 `userId` / `createdAt`:那两格是库内记账,画一个色点用不上它们,
 *   而下发一次就多一次"前端以为它有用"的机会。
 */
import type { SkinTone } from '../domain/entities/skin-tone.js';
import type { SkinToneView } from '../domain/schemas/index.js';

export function toSkinToneView(tone: SkinTone): SkinToneView {
  return { id: tone.id, name: tone.name, hex: tone.hex };
}
