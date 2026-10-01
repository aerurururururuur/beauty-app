/**
 * domain/entities/style-read.ts —— 风格参考图的读数(实体)。
 *
 * 三分工,照 `face-catalog/domain/entities/face-vocabulary.ts` 的先例:
 *   `../schemas/contracts/look-spec.ts`     形状(zod;**一条取值都不查**)
 *   `../validators/look-spec.validator.ts`  取值规则 + 给模型看的中文清单
 *   本文件                                  把**已经校验过的**读数装成只读快照
 * 所以构造函数里没有规则,白名单与区间全在 validator;类怎么写见 `look-spec.ts` 那段
 * 「字段不在这里声明」。
 *
 * ★ 它**不是** `LookSpec` 的别名,而是它的**子集**,少两块各有理由:
 *   · `occasion` —— 场合归场景图(`scene` 分析)与用户填写。「这张图的配色」与
 *     「这是什么场合」是两个问题,不该由同一次读图一起回答。
 *   · `zones.brow` —— 几何字段。它是 §6 规矩 5 点名的欠债,连 `renderLookClauses`
 *     都刻意不渲染;不该让视觉模型去填一个我们自己都还没定的几何维度。
 *
 * ★★ **为什么是"闭集里的字段",而不是"一段描述"** —— 这是本类型的全部要害。
 *   `LookSpec` 头上那条禁令(不许自由文本)与 `prompt-builder.ts` 的立论
 *   (「坏话**根本没有地方生成**」)合起来只允许这一种形状:视觉模型唯一的出口是
 *   **把图分类进既有闭集**。让它回一段话,那段话就是几何词的生成口 —— run 3 的翻车
 *   (「放大感美瞳」「外眼角加长」)正是几何词造成的。做成闭集字段之后能填的只有
 *   8 个 `ToneKey` / 3 个 `Depth` / 3 个 `Saturation` / 3 个 `Finish` / `1..5` / `-2..+2`,
 *   **结构性地**带不进几何词。
 *   ⚠️ **但字数不是"连带好处"**:`zones` 复用的就是 `ZoneSpec`,所以 `ZoneSpec` 加一格,
 *   这里与 `STYLE_PROMPT` 一起变(2026-10-01 加 `depth` / `saturation` 时各改过一次)。
 *
 * ⚠️ **现在没有具名守卫**(同 `FeatureValue`,它一个方法也没有)。要加的时候加在这里,
 *   不要加在用例的 `if` 里 —— `docs/module-architecture-spec.md` §5 那张表与 §8 第 3 步。
 */
import type { LookSpecBase, ZoneSpec } from './look-spec.js';
import type { StyleReadRaw, StyleReadShape } from '../schemas/index.js';

export class StyleRead {
  constructor(row: StyleReadRaw) {
    Object.assign(this, row);
  }
}
/**
 * ★ 字段不在这里声明,收窄后的类型在这里**标出来** —— 口径与 `look-spec.ts` 那四个类
 *   完全一致(形状 `extends StyleReadShape`,名义化来自 `styleReadSchema` 的 `.brand()`),
 *   理由写在那个文件的「字段不在这里声明」那段,不抄第二遍。
 */
export interface StyleRead extends StyleReadShape {
  /** 底妆:遮瑕度 / 质地 / 冷暖偏移。 */
  readonly base: LookSpecBase;
  /** 三个「色 + 质地 + 浓度」区。 */
  readonly zones: { readonly lip: ZoneSpec; readonly cheek: ZoneSpec; readonly eyeshadow: ZoneSpec };
}
