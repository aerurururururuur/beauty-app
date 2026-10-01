/**
 * domain/entities/look-vocabulary.ts —— 引擎的**封闭词汇表**,以及它们与「人的话」之间的桥。
 *
 * ── 为什么这几个常量从 `makeup` 搬到了这里 ────────────────────────────────────
 *
 * `makeup/domain/entities/look-spec.ts` 的文件头早就写下了这次搬迁的条件:
 * 「规矩 1 的触发条件是前端要拿它渲染 chips——**那个前端现在还不存在**。
 *  在取值未定(§15.1)的阶段就把它固化成 shared 级公共契约,是反过来的顺序。
 *  ★ **待前端 chips 落地时再迁,那时规矩 1 才真正生效。**」
 *
 * 现在前端 chips 落地了(面部识别结果面板要按肤色档渲染色卡),条件成立,所以按它说的迁。
 * **这次搬迁不是新决定,是执行一条已经写好的待办。**
 *
 * ── 第二个、也是更硬的理由 ───────────────────────────────────────────────────
 *
 * 词表目录(`face-catalog`)要**校验** `skin-tones.json` 里的 `toneKeys` 是不是真色号。
 * 若 `TONE_KEYS` 还留在 `makeup` 里,`face-catalog` 就得反向 import 一个业务模块——
 * 层次立刻倒过来(`face-catalog` 与 `makeup` 是**平级**的,谁也不该依赖谁)。
 * 放进 `shared` 之后,两者都只依赖底层,方向是单一的。
 *
 * ★ **这几个是「代码」,不是「内容」。** 它们**刻意不进 JSON 目录**:
 *   `face-catalog` 里那份 `skin-tones.json` 可以改档位名、改色卡、改顺序,
 *   但它给出的每一个 `toneKey` / `route.slot` 都必须是**这里列出的值**。
 *   理由:值合法性靠的是「这是个编译期元组」——`z.enum(TONE_KEYS)` 能恢复它,
 *   **恰恰是因为 `TONE_KEYS` 还在代码里**。把调色板一起配置化,这层保证就找不回来了。
 *   (这也是为什么本文件里的东西改一行要重新编译,而档位名不用——那是刻意的分界。)
 */
import type { Occasion } from './brief.js';

/**
 * ⚠️ **PLACEHOLDER** —— 色相族,取值待定。
 * 原注释见 `makeup/domain/entities/look-spec.ts` 与 `validators/look-spec.validator.ts`:
 * §15.1 说 `LookSpec` 的枚举取值「一个都没定」,这里给最小词表**只为让类型能编译**;
 * 接线前必须按实测结果替换,并按 §6 规矩 4 **按肤色收窄合法取值空间**。
 * 收窄表的**内容**现在在 `face-catalog/skin-tones.json` 的 `toneKeys` 里(同样是占位),
 * 但**取值必须是下面这几个之一**。
 *
 * ✏️ **2026-10-01 加了 `brown`(7 → 8)。** 依据是拿配方自己的色值量的分布:
 *   130 个色号里 **66 个是棕系**(H 20~40、S 35~45%),而词表里**没有棕**——
 *   它们被硬塞进 `coral`(珊瑚橘)/ `brick`(砖红)。实测症状:模型给「淡颜清冷妆」配
 *   「珊瑚橘眼影」,而那条配方的眼妆自己写着「大地色系」、色号 `#c9a184` 就是浅棕。
 *   蓝 / 绿 / 黄**刻意不加**:配方里一个都没有(唯一的金色是音乐节创意妆的眼线),
 *   加进去等于给模型一份产品库兑现不了的菜单。
 *
 * ⚠️ 往这里加一个色,`skin-tones.json` 的 `toneKeys` **必须同时**至少让一档能用它,
 *   否则 `face-catalog` 的启动校验会以「死色」拒掉(那条校验是对的,别绕)。
 */
export const TONE_KEYS = [
  'rose',
  'coral',
  'peach',
  'berry',
  'brick',
  'nude',
  'plum',
  'brown',
] as const;
export type ToneKey = (typeof TONE_KEYS)[number];

/**
 * ★ **几何槽位** —— 引擎里**唯一**允许出现几何描述的几个地方,以及它们的名字。
 *
 * 这是一道**闸门**的词汇表,不是一份功能清单。依据是 §4.4 的实测结论:
 * 「真实的形状不是『具体度 ↔ 保真』的滑块,是『**几何词 ↔ 保真**』的开关。
 *  色 / 质地 / 浓度写得再细都不花身份。」
 *
 * 所以这几个槽位**默认不渲染**(见 `prompt-builder.ts` 的 `PromptOptions.geometry`)。
 * 词表目录里每条特征取值都声明它去向哪个槽位(`route.kind === 'geometry'`),
 * 而"去向哪个槽位"必须落在这里列出的值上——**目录不许发明新槽位**。
 *
 * ⚠️ 往这里加一个槽位 = 往图像提示词里加一类几何词。加之前先读 §4.4 四条 run 的记录,
 *   并且按 §12.1 的口径补一次实测。**这是本项目唯一一个"加字段要花钱"的地方。**
 */
export const GEOMETRY_SLOTS = [
  'eyeliner',
  'cheekPlacement',
  'contour',
  'lipLining',
  'browShape',
  'noseContour',
] as const;
export type GeometrySlot = (typeof GEOMETRY_SLOTS)[number];

/** 特征取值在提示词里的去向。见 §4.4.1「要么给一个受控的枚举槽位……不许留自由文本兜底」。 */
export type FeatureRoute =
  | { readonly kind: 'geometry'; readonly slot: GeometrySlot }
  /** 只进给用户的建议,**一个字都不进图像提示词**。 */
  | { readonly kind: 'advisory' };

/** 复用场合枚举的单一源(本来就是 shared 的)。仅为把上面几个常量收在一处而再导出。 */
export type { Occasion };
