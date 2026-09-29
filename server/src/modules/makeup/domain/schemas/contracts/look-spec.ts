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
 */
import { z } from 'zod';

/** 浓度档的形状(整数的**类型**声明;1..5 的**区间**在 validator)。 */
const intensitySchema = z.number().int();

/** 一个「色 + 质地 + 浓度」区。 */
const zoneSchema = z
  .object({
    tone: z.string(),
    finish: z.string(),
    intensity: intensitySchema,
  })
  .strict();

/** 底妆。★ 抽出来是为了被 `lookSpecSchema` 与 `styleReadSchema` **共用**：
 *  风格图读数里的底妆与妆面单里的底妆是同一件事,写两遍就会有一天不一样(§4.1)。 */
const baseSchema = z
  .object({
    coverage: intensitySchema,
    finish: z.string(),
    /** 明暗(负数偏冷、正数偏暖)。区间在 validator。 */
    warmth: z.number(),
  })
  .strict();

/** 妆面单的形状。 */
export const lookSpecSchema = z
  .object({
    occasion: z.string(),
    base: baseSchema,
    zones: z
      .object({
        lip: zoneSchema,
        cheek: zoneSchema,
        eyeshadow: zoneSchema,
        brow: z
          .object({
            shape: z.string(),
            intensity: intensitySchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

/**
 * 通过形状校验的妆面单。
 * ⚠️ **它不是 `LookSpec`**:字段都还是宽泛的 `string` / `number`,取值一条都没查过。
 *   要 `LookSpec` 请走 `validateLookSpec`(它逐字段收窄,不做断言)。
 */
export type LookSpecRaw = z.output<typeof lookSpecSchema>;

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
export const styleReadSchema = z
  .object({
    base: baseSchema,
    zones: z
      .object({
        lip: zoneSchema,
        cheek: zoneSchema,
        eyeshadow: zoneSchema,
      })
      .strict(),
  })
  .strict();

export type StyleReadRaw = z.output<typeof styleReadSchema>;
