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

/** 一条自定义特性的形状。 */
export const cosmeticAttributeSchema = z
  .object({
    label: z.string(),
    value: z.string(),
  })
  .strict();

/** 特性列表的形状(条数上限是规则,在 validator)。 */
const attributesSchema = z.array(cosmeticAttributeSchema);

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

/**
 * ★ **落盘行的形状**(`dataDir/cabinet/items.json` 里的一条)。
 *
 * 与上面几个入参 schema 不是一回事:入参答的是「用户能提交什么」,这里答的是
 * 「盘上存了什么」。`id` / `userId` / `createdAt` 这三格入参里没有,只有这里齐全 ——
 * 仓库读出口靠它兜底(§7.2),少了它的那天,一份手改过的 `items.json` 会一路读进领域层。
 *
 * ⚠️ 这里**只有形状**:长度上限、条数上限、id 格式都是规则,在 validator 里
 *   (§4.2)。读出口不重跑那一套 —— 盘上的数据是**本服务自己写下去**的,
 *   拿入参规则去回溯校验,只会在某天收紧一条上限后让旧数据整个读不出来。
 */
export const cosmeticItemSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    attributes: attributesSchema,
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .strict();

/** 落盘表的形状:`{ [itemId]: CosmeticItemRow }`。 */
export const cosmeticItemTableSchema = z.record(z.string(), cosmeticItemSchema);

/** 一条自定义特性。 */
export type CosmeticAttribute = z.output<typeof cosmeticAttributeSchema>;
/**
 * 一条衣橱条目(落盘行)。
 * ★ 名字带 `Row`,是为了与领域实体 `domain/entities/cosmetic-item.ts` 的
 *   `CosmeticItem`(类)分开。**两者不是两份定义**:那个类的字段就是把本类型
 *   经声明合并接过去的,本类型仍是唯一真源(§4.1)。
 */
export type CosmeticItemRow = z.output<typeof cosmeticItemSchema>;

/** 通过形状校验的新增入参(仍需清洗,见 validator)。 */
export type CreateItemRaw = z.output<typeof createItemSchema>;
/** 通过形状校验的修改入参(仍需清洗,见 validator)。 */
export type UpdateItemRaw = z.output<typeof updateItemSchema>;
