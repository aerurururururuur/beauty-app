/**
 * makeup/domain/schemas/entities/makeup-zone.ts —— 一个叠加区的形状(zod,**无行为**)。
 *
 * ★ `Look` 本身是 `Record<string, unknown>`(**引擎私有**、形状由各引擎自定,见
 *   `entities/look.ts`),所以**没有**一份 `Look` 的 schema —— 这里只给
 *   `look.zones[]` 里那**一个已知成员**的形状,因为它是代码里真在造的那个
 *   (`MockEngine` 造它,`engine-output.validator` 按字段验它)。
 *
 * ★ 与 `contracts/look-spec.ts` 同规矩:这里只答结构,数值界与色值/坐标的合法性
 *   **不在 schema 里** —— 坐标 0..1、rgb 0..255、blur 非负、opacity 0..1 是
 *   `domain/validators/engine-output.validator.ts` 的 `assertZone` 在管
 *   (那边面对的是 `unknown`,而且要按「字段存在才查」放行未知引擎)。
 *
 * ⚠️ 两份形状(这份 schema 的键、`assertZone` 查的字段)是**各自写**的,而且不能合并:
 *   它们的**宽严本就不同** —— 这边七个字段全必填,那边是"字段在才查"(未知引擎可以少给)。
 *   代价是**改字段名时两处都要动**,而 `assertZone` 那边**改名不会报错**:它按字符串取键,
 *   取不到就跳过,那一格的检查会**静默消失**(本仓库的头号 bug 类型:假开关)。
 *   盯住它的是 `test/validator.test.ts` 里那七条「逐格改成非法值必须被拒」——
 *   改这里的键名时,那七条得跟着绿。
 *
 * 同 `contracts/look-spec.ts`:形状两份 —— `makeupZoneRowSchema`(不带品牌,构造参数用)
 * 与 `makeupZoneSchema`(带品牌,实例类型用)。
 */
import { z } from 'zod';

const makeupZoneRowSchema = z
  .object({
    /** '唇' | '颊' | '眼影' | … */
    role: z.string(),
    /** 锚点(相对图片宽高比例)。 */
    anchor: z.object({ x: z.number(), y: z.number() }).strict(),
    /** 尺寸(相对图片宽高比例)。 */
    size: z.object({ w: z.number(), h: z.number() }).strict(),
    /** 叠加色 [r,g,b] 0..255。 */
    rgb: z.tuple([z.number(), z.number(), z.number()]),
    /** CSS mix-blend-mode。 */
    blend: z.string(),
    /** CSS 模糊像素。 */
    blur: z.number(),
    /** 不透明度 0..1。 */
    opacity: z.number(),
  })
  .strict();

/** ★ 实体 `MakeupZone` 继承的形状(带品牌)。 */
export const makeupZoneSchema = makeupZoneRowSchema.brand<'MakeupZone'>();

/** 未加品牌的 row(= `MakeupZone` 的构造参数类型)。 */
export type MakeupZoneRow = z.output<typeof makeupZoneRowSchema>;
export type MakeupZoneShape = z.output<typeof makeupZoneSchema>;
