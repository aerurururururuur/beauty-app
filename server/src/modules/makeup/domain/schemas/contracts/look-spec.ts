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

/** 妆面单的形状。 */
export const lookSpecSchema = z
  .object({
    occasion: z.string(),
    base: z
      .object({
        coverage: intensitySchema,
        finish: z.string(),
        /** 明暗(负数偏冷、正数偏暖)。区间在 validator。 */
        warmth: z.number(),
      })
      .strict(),
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
