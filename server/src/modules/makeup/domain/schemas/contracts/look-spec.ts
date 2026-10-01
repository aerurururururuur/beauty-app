/**
 * makeup/domain/schemas/contracts/look-spec.ts —— `LookSpec` 的「形状 / 契约」(zod,**无行为**)。
 *
 * ★ §4.2:这里只答「这是什么结构」——
 *   · 是字符串 / 是数字 / 是对象 / `.strict()`(**多余的键是错误,不是可忽略的噪音**);
 *   · `.int()` 是**类型声明**(「这不是一个小数」),不是规则。
 *   **留在这里的只有这些。** 枚举白名单(场合 / 色 / 质地 / 眉形)与数值区间(浓度 1..5、
 *   明暗 -2..2)是**业务规则**,搬去了 `domain/validators/look-spec.validator.ts`,
 *   与它们那句要给模型看的「可用:…」同处一地(§7.3 第 4 条:错误消息是 prompt)。
 *
 * ★ 还有一条规则**形状表达不了**、也**必须在 validator** 里:§6 规矩 4 的
 *   「合法取值空间按 `skinTone` 收窄」——**它依赖上下文(用户的肤色),而 schema 是上下文无关的**。
 *
 * 这里不写 `refine` / `transform`,不做任何动作。
 *
 * ── ✏️ 2026-09-29:品牌与「一份形状两份 schema」──────────────────────────────
 *
 * `entities/look-spec.ts` 那 6 个类的字段不再自己声明,改成从这个文件**继承**
 * (`Object.assign` + 声明合并,§4.1);它们的**名义化**(让字面量写不出来)也从
 * `declare private readonly brand` 换成 zod 的 `.brand<'X'>()`(§7.4)。
 * 于是每个形状有**两份**,职责不同、不许合并:
 *
 *   · `xxxRowSchema` —— **不带品牌**。它是构造参数的类型:调用点传的是普通字面量,
 *     带品牌的话调用点自己就先写不出来了。
 *   · `xxxSchema`(= `xxxRowSchema.brand<'X'>()`)—— **带品牌**。它是**实例**的类型,
 *     实体接口 `extends` 的就是它。
 *
 * ⚠️ 品牌是**编译期**的东西(`unique symbol` 属性,运行时不存在),所以
 *   `Object.keys` / `JSON.stringify` / `structuredClone` / `toEqual` 与改动前逐位一致。
 * ⚠️ 别把 `xxxRowSchema` 拿出去当契约用 —— 宽的那份不是任何东西的类型,只是过一手。
 */
import { z } from 'zod';

/** 浓度档的形状(整数的**类型**声明;1..5 的**区间**在 validator)。 */
const intensitySchema = z.number().int();

// ── 三个子形状:每个都是「宽 row + 品牌过的形状」两份 ──────────────────────

/** 一个「色 + 深浅 + 饱和 + 质地 + 浓度」区。 */
const zoneRowSchema = z
  .object({
    tone: z.string(),
    depth: z.string(),
    saturation: z.string(),
    finish: z.string(),
    intensity: intensitySchema,
  })
  .strict();

/** ★ 实体 `ZoneSpec` 继承的形状(带品牌;见文件头「一份形状两份 schema」)。 */
export const zoneSchema = zoneRowSchema.brand<'ZoneSpec'>();
export type ZoneRow = z.output<typeof zoneRowSchema>;
export type ZoneSpecShape = z.output<typeof zoneSchema>;

/** 底妆。★ 抽出来是为了被 `lookSpecSchema` 与 `styleReadSchema` **共用**：
 *  风格图读数里的底妆与妆面单里的底妆是同一件事,写两遍就会有一天不一样(§4.1)。 */
const baseRowSchema = z
  .object({
    coverage: intensitySchema,
    finish: z.string(),
    /** 明暗(负数偏冷、正数偏暖;0 = 中性)。-2..+2 的区间在 validator。 */
    warmth: z.number(),
  })
  .strict();

/** ★ 实体 `LookSpecBase` 继承的形状。 */
export const baseSchema = baseRowSchema.brand<'LookSpecBase'>();
export type BaseRow = z.output<typeof baseRowSchema>;
export type LookSpecBaseShape = z.output<typeof baseSchema>;

/**
 * 眉。⚠️ 几何字段,见 `entities/look-spec.ts` 的 `BROW_SHAPES`。
 * ★ 抽成具名形状(原先是 `lookSpecSchema` 里的一段内联)是为了让实体 `BrowSpec` 接得上。
 */
const browRowSchema = z
  .object({
    shape: z.string(),
    intensity: intensitySchema,
  })
  .strict();

/** ★ 实体 `BrowSpec` 继承的形状。 */
export const browSchema = browRowSchema.brand<'BrowSpec'>();
export type BrowRow = z.output<typeof browRowSchema>;
export type BrowSpecShape = z.output<typeof browSchema>;

const zonesSchema = z
  .object({
    lip: zoneSchema,
    cheek: zoneSchema,
    eyeshadow: zoneSchema,
    /** ⚠️ 几何字段(见 {@link browRowSchema})。 */
    brow: browSchema,
    // ★ ✏️ 2026-10-01 新增的六个区,**可选**(见 `entities/look-spec.ts` 的 `ADDED_ZONE_ROLES`)。
    //   「该不该有它」不是形状问题——那要对着**本套配方的步骤**判,所以判在 validator 里。
    //   ⚠️ 六格全是 `zoneSchema`,与上面三个**同一个形状对象**:改一处两边一起改。
    concealer: zoneSchema.optional(),
    contour: zoneSchema.optional(),
    highlight: zoneSchema.optional(),
    aegyoSal: zoneSchema.optional(),
    liner: zoneSchema.optional(),
    lash: zoneSchema.optional(),
  })
  .strict();

// ── 妆面单 ─────────────────────────────────────────────────────────────────

/** 妆面单的形状。 */
const lookSpecRowSchema = z
  .object({
    /** 复用 shared 的场合枚举(单一源);白名单在 validator。 */
    occasion: z.string(),
    base: baseSchema,
    /** 三个区 + 眉。分组用内联形状即可:成员全是名义类型,不必再加一层。 */
    zones: zonesSchema,
  })
  .strict();

/** ★ 实体 `LookSpec` 继承的形状(带品牌)。 */
export const lookSpecSchema = lookSpecRowSchema.brand<'LookSpec'>();

/**
 * 通过形状校验的妆面单,**未加品牌**——也就是 `LookSpec` 的 row(构造参数的类型)。
 * ⚠️ **它不是 `LookSpec`**:字段都还是宽泛的 `string` / `number`,取值一条都没查过。
 *   要 `LookSpec` 请走 `validateLookSpec`(它逐字段收窄,不做断言)。
 */
export type LookSpecRaw = z.output<typeof lookSpecRowSchema>;

/** 实例那一侧的形状(= `LookSpecRaw` + 品牌)。 */
export type LookSpecShape = z.output<typeof lookSpecSchema>;

// ── 风格参考图读数 ──────────────────────────────────────────────────────────

/**
 * 「风格参考图读数」的形状 —— `lookSpecSchema` 的**子集**。
 *
 * ★ 只比妆面单少了 `occasion` 与 `zones.brow` 两块,理由写在 `entities/style-read.ts`。
 *   其余部分**复用上面同几个子形状**,不复制 —— §4.1:同一个字段名出现在两个类型定义里,
 *   就要问「这两份会不会有一天不一样」。
 *
 * ⚠️ 与 `lookSpecSchema` 一样,**这里一条取值都没查**:`tone` / `finish` 仍是宽泛的
 *   `string`,浓度区间也没查。要 `StyleRead` 请走 `validateStyleRead`。
 */
const styleReadRowSchema = z
  .object({
    /** 底妆:遮瑕度 / 质地 / 冷暖偏移。 */
    base: baseSchema,
    /** 三个「色 + 质地 + 浓度」区。 */
    zones: z
      .object({
        lip: zoneSchema,
        cheek: zoneSchema,
        eyeshadow: zoneSchema,
      })
      .strict(),
  })
  .strict();

/** ★ 实体 `StyleRead` 继承的形状(带品牌)。 */
export const styleReadSchema = styleReadRowSchema.brand<'StyleRead'>();

/** 未加品牌的 row(= `StyleRead` 的构造参数类型)。 */
export type StyleReadRaw = z.output<typeof styleReadRowSchema>;
export type StyleReadShape = z.output<typeof styleReadSchema>;
