/**
 * domain/schemas/entities/custom-feature.ts —— 用户**自建**特征那一行的形状(zod,无行为)。
 * 只答「这是什么结构」;长度上限与清洗在 `custom-feature.validator.ts`。
 * ★ `group` 只是形状,不是白名单:六个分组词表住在前端 kb,服务端再抄一份就是第二份会漂的表。
 * ★ 只收自建档:前端 kb 里那 31 条目录**不进这张表**。
 */
import { z } from 'zod';

/** 落盘行的形状(`features.json` 里的一条)。别另立第二份字段清单:实体类也只 `Object.assign` 这一份。 */
export const customFeatureRowSchema = z
  .object({
    /** 条目标识(UUID,服务端生成)。★ 它**不进人设行**——人设里存的是 `group/text` 那串原话。 */
    id: z.string(),
    /** 归属账号。★ 归属不符一律 404,同人设那条。 */
    userId: z.string(),
    /** 属于哪一组(`eye` / `face` / …)。前端 kb 的分组 id,服务端不校验它在不在那六个里。 */
    group: z.string(),
    /** 用户写的原话(「眼尾有点垂」)。**不含分组前缀。** */
    text: z.string(),
    /** 建这一条的时间(ISO 8601)。 */
    createdAt: z.string(),
  })
  .strict();

/** 带品牌的行(实例那一侧)。 */
export const customFeatureSchema = customFeatureRowSchema.brand<'CustomFeature'>();

/** 落盘表的形状:`{ [id]: CustomFeatureRow }`。 */
export const customFeatureTableSchema = z.record(z.string(), customFeatureRowSchema);

/** 建档入参。 */
export const customFeatureCreateSchema = z
  .object({
    userId: z.string(),
    group: z.string(),
    text: z.string(),
  })
  .strict();

/** 通过形状校验的一条自建档。 */
export type CustomFeatureRow = z.output<typeof customFeatureRowSchema>;
/** 带品牌的实例形状(实体类 `CustomFeature` 的实例那一侧)。 */
export type CustomFeatureShape = z.output<typeof customFeatureSchema>;
/** 通过形状校验的建档入参。 */
export type CustomFeatureCreateRaw = z.output<typeof customFeatureCreateSchema>;
