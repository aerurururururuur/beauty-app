/**
 * makeup/domain/entities/look-spec.ts —— ★ 层 A(引擎)与层 B(agent)之间**唯一**的契约。
 *
 * 为什么这个文件值得存在(设计依据:`docs/plan/makeup-agent-design.md` §4 / §6):
 * 四次实测(§4.4)的结论是——**决定「像不像本人」的不是提示词写得多细,
 * 而是提示词里有没有几何词。** run 3 删掉构图条款但留着几何词 → 仍然漂移;
 * run 4 把几何词也删掉、只留色/质地/浓度 → 身份保住且妆效清楚可见。
 *
 * 所以工程上的结论是:**LLM 不许写 prompt,只许填这份结构化妆面单**,
 * 措辞由 `prompt-builder` 的模板负责(§5.2)。本文件就是那道闸门的输入类型。
 *
 * ★ 字段设计遵循 §6 规矩 5(最高优先):**区分「色 / 质地 / 浓度」与「几何」**。
 *   - `tone` / `finish` / `intensity` 是 §4.4 实测里**唯一没有**推动五官漂移的那类描述;
 *   - `brow.shape` 是现存的**例外**,属几何描述(与 run 3 翻车的「放大感美瞳」同类)。
 *     §6 明写「**重新评估后再保留**」——**它现在是欠债,不是设计**,不要照着它加新维度。
 *
 * ⚠️ **枚举取值是占位,不是定案。** §15.1 原话:「`LookSpec` 的具体枚举值
 *   (哪些 `ToneKey`、`BrowShape` 取值)——**一个都没定**。需要先有阶段 0 / 1 的实测
 *   才能定,现在定就是拍脑袋。」这里给最小词表**只为让类型能编译**。
 *   接线前必须按 5 档肤色的实测结果替换,并按 §6 规矩 4 **按 `skinTone` 收窄合法取值空间**。
 *
 * 为什么放在 makeup 而不是 shared(§6 规矩 1 说的是「枚举定义在 shared」):
 *   规矩 3 同时写着「`LookSpec` 是**引擎私有契约**,不是新的契约层……**不要让它泄漏进 `JobView`**」。
 *   ✏️ 2026-09-29:`JobView`(连同 `jobs` 模块)已删,那句引用**现在没有指向的类型**。
 *      ⚠️ 而今天的对外视图 `AgentSessionView` **是带着 `lookSpec?` 的**
 *      (见 `agent/application/agent-view.ts`,对话页要靠它渲染妆面)——所以那句
 *      「不要泄漏」在新视图上**已经被有意放宽**:泄漏的是**字段**,不是类型的家
 *      (类型仍只住在 `makeup`,没搬进 `shared`)。**「待前端 chips 落地时再迁」那个条件已经到了**,
 *      迁不迁是单独一件事,别顺手在这里动。
 *   规矩 1 的触发条件是前端要拿它渲染 chips——**那个前端现在还不存在**。
 *   在取值未定(§15.1)的阶段就把它固化成 shared 级公共契约,是反过来的顺序。
 *   **待前端 chips 落地时再迁,那时规矩 1 才真正生效。**
 */
// ★ 色汇表按 `look-spec.ts` 头部那条待办迁去了 `shared`(条件:"待前端 chips 落地时再迁"),
//   这里**再导出**而不是另写一份——`makeup/index.ts` 的对外契约一个字不变。
//   ⚠️ `export ... from` 只再导出、**不建立本地绑定**,所以下面还有一条 import
//   —— 本文件自己要用 `ToneKey`(见 `ZoneSpec`)。
import type { Occasion, ToneKey } from '../../../shared/index.js';
export { TONE_KEYS } from '../../../shared/index.js';
export type { ToneKey } from '../../../shared/index.js';
// ★ 下面这 8 个名字就是「形状的单源」:本文件**一个字段都不声明**,全靠它们。
//   `*Row`(不带品牌)= 构造参数;`*Shape`(带品牌)= 实例那一侧,见下面每个类。
import type {
  BaseRow,
  BrowRow,
  BrowSpecShape,
  LookSpecBaseShape,
  LookSpecRaw,
  LookSpecShape,
  ZoneRow,
  ZoneSpecShape,
} from '../schemas/index.js';

/** 浓度档位(1..5)。§6 里 `coverage` / `intensity` 共用同一档。 */
export type Intensity = 1 | 2 | 3 | 4 | 5;

/** 浓度上下界(单源:校验器与工具 JSON Schema 都从这里取,避免各写一遍)。 */
export const INTENSITY_MIN = 1;
export const INTENSITY_MAX = 5;

/** 冷暖偏移上下界(0 = 中性,-2 偏冷,+2 偏暖)。 */
export const WARMTH_MIN = -2;
export const WARMTH_MAX = 2;

/**
 * 质地。§6 规矩 2:这正是 `roadmap.md` §6 那条「阻塞自建路线」的待办——
 * 原文写着现有 `Look{style,palette,zones}` **没有任何地方**放 satin/matte/glossy,
 * 而这恰恰是「像涂的 vs 像染的」的分水岭。本次顺手补上,**不是新需求**。
 */
export const FINISHES = ['satin', 'matte', 'glossy'] as const;
export type Finish = (typeof FINISHES)[number];

// `TONE_KEYS` / `ToneKey` 已迁至 `shared/domain/entities/look-vocabulary.ts`(见文件头 import 处)。
// ⚠️ 它们仍是 **PLACEHOLDER**:§15.1 说枚举取值「一个都没定」,这里是让类型能编译的最小词表。
//    按肤色收窄的那张表现在在 `face-catalog/skin-tones.json` 的 `toneKeys` 里,同样占位。

/**
 * ⚠️ **PLACEHOLDER,且是几何维度。**
 * 眉形属 §6 规矩 5 点名的**已知例外**——「形状」正是 run 3 实测到的漂移来源一类。
 * 保留它是因为「眉毛画成什么样」暂时没有色/质地/浓度的替代表达;
 * **但不要以它为样板再加几何字段**(§6 规矩 5:新增字段前先问「这是色/质地/浓度,还是形状?」)。
 */
export const BROW_SHAPES = ['natural', 'soft_arch', 'straight'] as const;
export type BrowShape = (typeof BROW_SHAPES)[number];

/** 三个「色 + 质地 + 浓度」区。**这三个维度是实测里安全的那一类。** */
export const ZONE_ROLES = ['lip', 'cheek', 'eyeshadow'] as const;
export type ZoneRole = (typeof ZONE_ROLES)[number];

// ── ★ 下面四个类:字段不在这里声明,名义化也不靠 `declare` ──────────────────
//
// 机制(形状单源 / `Object.assign` / `.brand()` / 构造参数收未加品牌的 row)写在
// `../schemas/contracts/look-spec.ts` 的文件头,不抄第二遍。这里只说**本文件特有**的两件事:
//
// ① **收窄后的类型在这里重声明**(枚举白名单在 validator,§4.2。都是标量、且窄类型
//    与宽的那格兼容 —— `ToneKey ⊂ string`、`Intensity ⊂ number`,所以是覆盖不是冲突)。
//    ⚠️ **只读数组/元组覆盖不了**(`readonly T[]` 当不了 `T[]`),那种收窄要先 `Omit`;
//    本文件用不到,`look.ts` 的 `MakeupZone.rgb` 是那一处。
// ② ⚠️ **重声明时字段名要逐字对着 schema 写**:接口**允许多出成员**,把 `tone` 写成
//    `tones` 不报错、运行时也不炸 —— 只会静默退化成"多一个谁都不填的键 + 真的那格退回宽 `string`"。
//    **只有编译期的钉子照得见它**:`test/schemas.test.ts` 的「收窄与品牌是真的」那组。
// ⚠️ `docs/module-architecture-spec.md` §7.3 曾把上一版写法(类型谓词 + 复合守卫 +
//    逐字段装配)立为合规样板 —— 那份文档是用户的;以代码为准时记得这一行已被本轮口径取代。

/**
 * 底妆:遮瑕度 / 质地 / 冷暖偏移。
 * ★ 抽出来是为了被 `LookSpec` 与 `StyleRead` 共用 —— 写两遍就会有一天不一样(§4.1)。
 */
export class LookSpecBase {
  constructor(row: BaseRow) {
    Object.assign(this, row);
  }
}
export interface LookSpecBase extends LookSpecBaseShape {
  readonly coverage: Intensity;
  readonly finish: Finish;
}

/** 单区位的妆面:色 / 质地 / 浓度。 */
export class ZoneSpec {
  constructor(row: ZoneRow) {
    Object.assign(this, row);
  }
}
export interface ZoneSpec extends ZoneSpecShape {
  readonly tone: ToneKey;
  readonly finish: Finish;
  readonly intensity: Intensity;
}

/** 眉。⚠️ 几何字段,见 {@link BROW_SHAPES}。 */
export class BrowSpec {
  constructor(row: BrowRow) {
    Object.assign(this, row);
  }
}
export interface BrowSpec extends BrowSpecShape {
  readonly shape: BrowShape;
  readonly intensity: Intensity;
}

/**
 * 一份完整的妆面单。**层 A 与层 B 之间只认这一种形状**(§6)。
 *
 * ⚠️ **不存在自由文本字段,这是故意的,不许"顺手加一个备注字段"。**
 * §6 规矩 5 末 + §13 范围外都点名盯着这条:
 * 「放大感美瞳」这类诉求目前无处安放,**一旦开了自由文本口子,§4.1 的约束就形同虚设**。
 * 要么给受控枚举,要么明确告诉用户这类诉求不支持。
 */
export class LookSpec {
  constructor(row: LookSpecRaw) {
    Object.assign(this, row);
  }
}
export interface LookSpec extends LookSpecShape {
  /** 复用 shared 的场合枚举(单一源)。 */
  readonly occasion: Occasion;
  readonly base: LookSpecBase;
  /** 三个区 + 眉。分组用内联形状即可:成员全是名义类型,不必再加一层。 */
  readonly zones: {
    readonly lip: ZoneSpec;
    readonly cheek: ZoneSpec;
    readonly eyeshadow: ZoneSpec;
    /** ⚠️ 几何字段(见 {@link BROW_SHAPES})。 */
    readonly brow: BrowSpec;
  };
}
