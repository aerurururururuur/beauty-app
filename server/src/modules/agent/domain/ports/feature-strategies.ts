/**
 * agent/domain/ports/feature-strategies.ts —— 面部特征 id → 一条「针对本人该怎么调」。
 *
 * ★ **端口声明在消费方**(§7.1):agent 不 import `face-catalog`,由组装根把词表的实现
 *   包一层注进来 —— 与 `SkinTonePalette` 完全同类(那也是 `face-catalog` 的一条缝,
 *   声明在 `makeup/domain/ports/`)。
 *
 * ★ **策略文案是内容,不是这里拼的。** `desc` / `fix` / `products` 逐条写在
 *   `assests/face-catalog/features.json` 里(它自己那条 `note` 记着这份文案的来历)。
 *   本端口**只做查表** —— 模型只能决定"用哪几条",决定不了"那条说的是什么"。
 *
 * ★ **查不到返回 `undefined`,不回落、不补一条通用的。** 未知 id 由调用方 `filter` 掉,
 *   与前端 `featureById()` 返回 `null` 的行为一致:用户人设里存的 id 可能比后端词表旧,
 *   那是正常情况,静默给一张对不上特征的卡片才是 bug。
 */
import type { PlanPersonalized } from '../../../styling/index.js';

export interface FeatureStrategies {
  byId(id: string): PlanPersonalized | undefined;
}
