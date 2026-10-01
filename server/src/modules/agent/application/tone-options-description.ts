/**
 * agent/application/tone-options-description.ts —— 把「这个肤色能用哪些色」讲给模型。
 *
 * ★ 起因(2026-10-01 实测):`propose_look` 的 schema 里 `tone` 的 `enum` 是**全量色相**,
 *   而真能用的只有该肤色那一档的 3~6 个(`look-spec.validator.ts` 的 ③)。
 *   ⇒ **schema 报了一个校验器会拒的值**,模型照菜单选了 `peach`、当场被打回,白花一个回合。
 *   这句话就是把那张**改对了的**菜单补给它。同 `style-options-description.ts` 的道理。
 *
 * 值的出处只有 `palette` 一个,**不许在这里写死色表**(写死就是 §6 规矩 4 静默失效)。
 * ⚠️ 它只是提示,不是闸门:真正的拦截仍是 `validateLookSpec`,所以查不到时返回 `undefined`
 *   让调用方整行不印,不抛错。
 */
import type { SkinTonePalette } from '../../makeup/index.js';

/** 肤色未知、或那一档不在词表里 → `undefined`(调用方据此整行不印)。 */
export function describeToneOptions(
  skinTone: string | undefined,
  palette: SkinTonePalette,
): string | undefined {
  if (!skinTone) return undefined;
  const allowed = palette.toneKeysFor(skinTone);
  if (!allowed || allowed.length === 0) return undefined;
  return `肤色「${palette.labelOf(skinTone) ?? skinTone}」可用色:${allowed.join(' / ')}`;
}
