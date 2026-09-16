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
 *   规矩 1 的触发条件是前端要拿它渲染 chips——**那个前端现在还不存在**。
 *   在取值未定(§15.1)的阶段就把它固化成 shared 级公共契约,是反过来的顺序。
 *   **待前端 chips 落地时再迁,那时规矩 1 才真正生效。**
 */
import type { Occasion } from '../../../shared/index.js';

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

/**
 * ⚠️ **PLACEHOLDER** —— 低饱和色相族,取值待定。
 * §6 规矩 4:合法取值空间**本身就要按 `skinTone` 收窄**,而不是生成完再检查
 *   (红线 §13-3 肤色包容;依据是 ICCCW 2026 肤色偏差审计,DOI `10.1145/3810417.3810425`:
 *   Black-presenting 脸退化最严重且出现**非预期肤色漂移**)。
 * 收窄表见 `validators/look-spec.validator.ts` 的 `TONE_KEYS_BY_SKIN_TONE`——**同样是占位**。
 */
export const TONE_KEYS = ['rose', 'coral', 'peach', 'berry', 'brick', 'nude', 'plum'] as const;
export type ToneKey = (typeof TONE_KEYS)[number];

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

/** 单区位的妆面:色 / 质地 / 浓度。 */
export interface ZoneSpec {
  tone: ToneKey;
  finish: Finish;
  /** 1..5。 */
  intensity: Intensity;
}

/**
 * 一份完整的妆面单。**层 A 与层 B 之间只认这一种形状**(§6)。
 *
 * ⚠️ **不存在自由文本字段,这是故意的,不许"顺手加一个备注字段"。**
 * §6 规矩 5 末 + §13 范围外都点名盯着这条:
 * 「放大感美瞳」这类诉求目前无处安放,**一旦开了自由文本口子,§4.1 的约束就形同虚设**。
 * 要么给受控枚举,要么明确告诉用户这类诉求不支持。
 */
export interface LookSpec {
  /** 复用 shared 的场合枚举(单一源)。 */
  occasion: Occasion;
  /** 底妆:遮瑕度 / 质地 / 冷暖偏移。 */
  base: {
    coverage: Intensity;
    finish: Finish;
    /** -2..+2,0 = 中性。 */
    warmth: number;
  };
  zones: {
    lip: ZoneSpec;
    cheek: ZoneSpec;
    eyeshadow: ZoneSpec;
    /** ⚠️ 几何字段(见 {@link BROW_SHAPES})。 */
    brow: { shape: BrowShape; intensity: Intensity };
  };
}
