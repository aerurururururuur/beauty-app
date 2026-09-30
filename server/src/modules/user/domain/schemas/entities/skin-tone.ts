/**
 * domain/schemas/entities/skin-tone.ts —— 用户**自建**肤色档那一行的形状(zod,无行为)。
 * 只答「这是什么结构」;名字 / 色值的长度与格式在 `skin-tone.validator.ts`。
 * ★ 只收自建档:前端那 8 档预置住在前端 kb 里,**不进这张表**。
 */
import { z } from 'zod';

/** 落盘行的形状(`tones.json` 里的一条)。别另立第二份字段清单:实体类也只 `Object.assign` 这一份。 */
export const skinToneRowSchema = z
  .object({
    /** 档位标识(UUID,服务端生成)。人设行里那一格存的就是它。 */
    id: z.string(),
    /** 归属账号。★ 归属不符一律 404,同人设那条。 */
    userId: z.string(),
    /** 用户给这一档起的名字(「暖茶皮」)。 */
    name: z.string(),
    /** 真实肤底色,`#rrggbb`。★ 它会被渲染成色点,不许在这里做任何"提亮"。 */
    hex: z.string(),
    /** 建这一档的时间(ISO 8601)。 */
    createdAt: z.string(),
  })
  .strict();

/** 带品牌的行(实例那一侧)。 */
export const skinToneSchema = skinToneRowSchema.brand<'SkinTone'>();

/** 落盘表的形状:`{ [id]: SkinToneRow }`。 */
export const skinToneTableSchema = z.record(z.string(), skinToneRowSchema);

/** 建档入参。 */
export const skinToneCreateSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    hex: z.string(),
  })
  .strict();

/** 通过形状校验的一条自建档。 */
export type SkinToneRow = z.output<typeof skinToneRowSchema>;
/** 带品牌的实例形状(实体类 `SkinTone` 的实例那一侧)。 */
export type SkinToneShape = z.output<typeof skinToneSchema>;
/** 通过形状校验的建档入参。 */
export type SkinToneCreateRaw = z.output<typeof skinToneCreateSchema>;
