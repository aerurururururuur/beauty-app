/**
 * domain/entities/style-read.ts —— 风格参考图的读数(实体)。
 *
 * 三分工,照 `face-catalog/domain/entities/face-vocabulary.ts` 的先例:
 *   `../schemas/contracts/look-spec.ts`     形状(zod;**一条取值都不查**)
 *   `../validators/look-spec.validator.ts`  取值规则 + 给模型看的中文清单
 *   本文件                                  把**已经校验过的**读数装成只读快照
 * 所以构造函数里没有规则,白名单与区间全在 validator;`#sealed` 见 `look-spec.ts`。
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
 *   7 个 `ToneKey` / 3 个 `Finish` / `1..5` / `-2..+2`,**结构性地**带不进几何词。
 *   连带好处:`prompt-builder.ts` 一字节不用动,`TEMPLATE_VERSION` 不用 +1。
 *
 * ⚠️ **现在没有具名守卫**(同 `FeatureValue`,它一个方法也没有)。要加的时候加在这里,
 *   不要加在用例的 `if` 里 —— `docs/module-architecture-spec.md` §5 那张表与 §8 第 3 步。
 */
import type { LookSpecBase, ZoneSpec } from './look-spec.js';

export class StyleRead {
  /** 名义化标记:只声明、不初始化、**不许读**。见 `look-spec.ts` 那段「为什么是类」。 */
  declare private readonly brand: void;

  constructor(
    /** 底妆:遮瑕度 / 质地 / 冷暖偏移。 */
    readonly base: LookSpecBase,
    /** 三个「色 + 质地 + 浓度」区。 */
    readonly zones: { readonly lip: ZoneSpec; readonly cheek: ZoneSpec; readonly eyeshadow: ZoneSpec },
  ) {}
}
