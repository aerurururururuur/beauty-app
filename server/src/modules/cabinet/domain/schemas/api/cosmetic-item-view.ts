/**
 * domain/schemas/api/cosmetic-item-view.ts —— ★ 对外 API 契约 / DTO。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 application/cabinet-view.ts)。
 * 不引入网络/框架类型,保持纯数据。
 *
 * 本模块目前没有需要挡在视图之外的字段(实体本身就是可对外的),
 * 但视图仍然独立声明:将来若实体长出内部字段,改这里即可,不牵动实体。
 *
 * ★ 形状的单源就是下面那三份 schema,三个 `…View` 由它们 `z.output` 推出(§4.1)。
 */
import { z } from 'zod';

export const cosmeticAttributeViewSchema = z
  .object({
    label: z.string(),
    value: z.string(),
  })
  .strict();

export const cosmeticItemViewSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    attributes: z.array(cosmeticAttributeViewSchema),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .strict();

/** 列表响应:包一层对象而不是裸数组——将来加 total / 分页游标不必改形状。 */
export const cosmeticListViewSchema = z
  .object({
    items: z.array(cosmeticItemViewSchema),
  })
  .strict();

export type CosmeticAttributeView = z.output<typeof cosmeticAttributeViewSchema>;
export type CosmeticItemView = z.output<typeof cosmeticItemViewSchema>;
export type CosmeticListView = z.output<typeof cosmeticListViewSchema>;
