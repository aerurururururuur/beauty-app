/**
 * domain/schemas/entities/style-recipes.ts —— 风格配方的**形状**(zod 单源)。
 *
 * §4.1:形状只写这一次。`domain/entities/style-recipes.ts` 那边一个字段都不声明——
 * 它只 `type X = XRow`,因为这三个都是**只读内容,没有一行行为可挂**(同 `products`)。
 * 在那边重抄一份字段声明,就会变成第二份定义,而且它会**盖过**这份:
 * 字段改了 schema 没改类,编译不报错,只在读的时候悄悄少一格。
 *
 * ★ **这里只有形状,没有业务规则**(§4.2)。取值白名单之类留在别处:
 *   「`SCENE_STYLES` 里的每个 id 都得在 `STYLE_LIBRARY` 里查得到」是一条**跨条目**规则,
 *   钉它的地方是 `test/styling-plan.test.ts`。
 */
import { z } from 'zod';

/** 步骤内的产品引用:name 为知识库原文写法,pid 用于回查色值,code 为色号。 */
export const styleProductSchema = z
  .object({
    /** 知识库原文写法,不是品牌官方名。直接上界面。 */
    name: z.string().min(1),
    /**
     * 色号库(`vue/src/api/kb/shades.js`)里的产品 id。
     * ★ **空串是合法的**——配方里有整支产品不带色号的情况(如睫毛膏)。
     */
    pid: z.string(),
    /** 色号。同样允许空串(整支产品不带色号)。 */
    code: z.string(),
  })
  .strict();

/** 步骤:name 步骤名,action 操作手法,products 用到的产品。 */
export const styleStepSchema = z
  .object({
    name: z.string().min(1),
    action: z.string().min(1),
    products: z.array(styleProductSchema).min(1),
  })
  .strict();

/**
 * 一条风格配方。
 * ★ 步骤的**数量、名称、顺序**由本数组决定,不同风格之间本来就不同——
 * 读它的人不得写死任何一步、也不得假设固定顺序。
 */
export const styleRecipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 风格家族,如「原生美学类」。直接上界面。 */
    family: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
    /** 预计用时(分钟)。 */
    minutes: z.number().int().positive(),
    /** 难度档,如「新手友好」/「进阶」/「日常」/「创作向」。直接上界面。 */
    level: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(styleStepSchema).min(1),
  })
  .strict();

export type StyleProductRow = z.output<typeof styleProductSchema>;
export type StyleStepRow = z.output<typeof styleStepSchema>;
export type StyleRecipeRow = z.output<typeof styleRecipeSchema>;
