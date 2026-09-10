/**
 * domain/schemas/cosmetic-item.ts —— 衣橱入参的「形状/契约」(zod,无行为)。
 * 只声明结构:名称/标签/值是字符串、长度各有上界、条数有上界(先挡住超大 payload),
 * id 是路径参数,只认 URL 安全字符。
 *
 * ★ 语义规则(trim 后的上下限、禁止控制字符、标签去重、改与不改的取舍)、清洗、
 *   VALIDATION_ERROR 语义错误码一律放 domain/validators/cosmetic-item.validator.ts,
 *   这里不做动作、不写 refine/transform。
 *
 * 注:ownerIdSchema / itemIdSchema 与 user 模块的 userIdSchema 是**同款正则,但各持一份**——
 * 模块之间不互相 import(见模块 README 的依赖方向约定),不为了一个正则破例。
 */
import { z } from 'zod';

/** 名称原文上限(字,给 trim 留余量;清洗后的上下限另判)。 */
export const MAX_NAME_RAW = 80;
/** 名称清洗后上限(字)。 */
export const MAX_NAME = 40;

/** 单条目的特性条数上限。 */
export const MAX_ATTRIBUTES = 12;
/** 特性名原文 / 清洗后上限(字)。 */
export const MAX_ATTRIBUTE_LABEL_RAW = 32;
export const MAX_ATTRIBUTE_LABEL = 16;
/** 特性值原文 / 清洗后上限(字)。 */
export const MAX_ATTRIBUTE_VALUE_RAW = 96;
export const MAX_ATTRIBUTE_VALUE = 40;

const nameRawSchema = z.string().max(MAX_NAME_RAW, `名称最多 ${MAX_NAME_RAW} 字`);

const attributeRawSchema = z
  .object({
    label: z.string().max(MAX_ATTRIBUTE_LABEL_RAW, `特性名最多 ${MAX_ATTRIBUTE_LABEL_RAW} 字`),
    value: z.string().max(MAX_ATTRIBUTE_VALUE_RAW, `特性值最多 ${MAX_ATTRIBUTE_VALUE_RAW} 字`),
  })
  .strict();

const attributesRawSchema = z
  .array(attributeRawSchema)
  .max(MAX_ATTRIBUTES, `特性最多 ${MAX_ATTRIBUTES} 条`);

/** 路径参数 :id 的形状。 */
export const itemIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, '衣橱条目 id 不合法');

/** 归属用户 id 的形状(请求体 / 查询串里传)。 */
export const ownerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, '用户 id 不合法');

/** 新增条目:名称必填,特性可省(省即空数组)。 */
export const createItemSchema = z
  .object({
    userId: ownerIdSchema,
    name: nameRawSchema,
    attributes: attributesRawSchema.optional(),
  })
  .strict();

/**
 * 修改条目:名称与特性**都可选**,但至少要给一个(「给没给」是语义判断,见 validator)。
 * 两个都不给等于空操作,不当作合法请求。
 */
export const updateItemSchema = z
  .object({
    userId: ownerIdSchema,
    name: nameRawSchema.optional(),
    attributes: attributesRawSchema.optional(),
  })
  .strict();

/** 归属查询串(列表与删除共用):只认 userId 一个键。 */
export const ownerQuerySchema = z.object({ userId: ownerIdSchema }).strict();

/** 通过形状校验的新增入参(仍需清洗,见 validator)。 */
export type CreateItemRaw = z.output<typeof createItemSchema>;
/** 通过形状校验的修改入参(仍需清洗,见 validator)。 */
export type UpdateItemRaw = z.output<typeof updateItemSchema>;
