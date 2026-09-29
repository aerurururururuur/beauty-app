/**
 * domain/schemas/entities/cosmetic-item.ts —— 衣橱入参的「形状/契约」(zod,无行为)。
 *
 * ★ §4.2:这里只答「这是什么结构」——是字符串 / 是数组 / `.strict()`。
 *   名称、特性名与特性值的**长度上下限**、条数上限、id 的**格式正则**都是**业务规则**,
 *   一律在 `domain/validators/cosmetic-item.validator.ts`,与它们的错误文案同处一地。
 *   留在这里的只有:类型、`.strict()`、`optional()`(可空性)、数组元素形状。
 *
 * 这里不做动作、不写 refine/transform。
 *
 * 注:`ownerIdSchema` / `itemIdSchema` 与 `user` 模块的 `userIdSchema` 是**同款正则,但各持一份**
 * (在各自的 validator 里)——模块之间不互相 import(见模块 README 的依赖方向约定),
 * 不为了一个正则破例。
 */
import { z } from 'zod';

const attributeSchema = z
  .object({
    label: z.string(),
    value: z.string(),
  })
  .strict();

/** 特性列表的形状(条数上限是规则,在 validator)。 */
const attributesSchema = z.array(attributeSchema);

/** 路径参数 :id 的形状。 */
export const itemIdSchema = z.string();

/** 归属用户 id 的形状(请求体 / 查询串里传)。 */
export const ownerIdSchema = z.string();

/** 新增条目:名称必填,特性可省(省即空数组)。 */
export const createItemSchema = z
  .object({
    userId: ownerIdSchema,
    name: z.string(),
    attributes: attributesSchema.optional(),
  })
  .strict();

/**
 * 修改条目:名称与特性**都可选**,但至少要给一个(「给没给」是语义判断,见 validator)。
 * 两个都不给等于空操作,不当作合法请求。
 */
export const updateItemSchema = z
  .object({
    userId: ownerIdSchema,
    name: z.string().optional(),
    attributes: attributesSchema.optional(),
  })
  .strict();

/** 归属查询串(列表与删除共用):只认 userId 一个键。 */
export const ownerQuerySchema = z.object({ userId: ownerIdSchema }).strict();

/** 通过形状校验的新增入参(仍需清洗,见 validator)。 */
export type CreateItemRaw = z.output<typeof createItemSchema>;
/** 通过形状校验的修改入参(仍需清洗,见 validator)。 */
export type UpdateItemRaw = z.output<typeof updateItemSchema>;
