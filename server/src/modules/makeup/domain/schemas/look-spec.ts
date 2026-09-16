/**
 * makeup/domain/schemas/look-spec.ts —— `LookSpec` 的「形状 / 契约」(zod,**无行为**)。
 *
 * 只声明结构:字段在不在、类型对不对、数值在不在闭区间内。
 * **形状表达不了的规则一律不在这里**——具体说就是 §6 规矩 4 那条
 * 「合法取值空间按 `skinTone` 收窄」:**它依赖上下文(用户的肤色),而 schema 是上下文无关的**,
 * 所以它属于 `domain/validators/look-spec.validator.ts`(`schema ≠ validator` 的既有分工)。
 * 这里不写 `refine` / `transform`,不做任何动作。
 */
import { z } from 'zod';
import { OCCASIONS } from '../../../shared/index.js';
import {
  BROW_SHAPES,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  TONE_KEYS,
  WARMTH_MAX,
  WARMTH_MIN,
} from '../entities/look-spec.js';

/** 浓度档:整数 1..5(上下界与实体同源)。 */
const intensitySchema = z.number().int().min(INTENSITY_MIN).max(INTENSITY_MAX);

/** 一个「色 + 质地 + 浓度」区。 */
const zoneSchema = z
  .object({
    tone: z.enum(TONE_KEYS),
    finish: z.enum(FINISHES),
    intensity: intensitySchema,
  })
  .strict();

/** 妆面单的形状。`.strict()` 与仓库其它 schema 一致:多余的键是错误,不是可忽略的噪音。 */
export const lookSpecSchema = z
  .object({
    occasion: z.enum(OCCASIONS),
    base: z
      .object({
        coverage: intensitySchema,
        finish: z.enum(FINISHES),
        warmth: z.number().min(WARMTH_MIN).max(WARMTH_MAX),
      })
      .strict(),
    zones: z
      .object({
        lip: zoneSchema,
        cheek: zoneSchema,
        eyeshadow: zoneSchema,
        brow: z
          .object({
            shape: z.enum(BROW_SHAPES),
            intensity: intensitySchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

/** 通过形状校验的妆面单(仍需 validator 做肤色收窄等行为校验)。 */
export type LookSpecRaw = z.output<typeof lookSpecSchema>;
