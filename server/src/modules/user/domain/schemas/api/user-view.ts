/**
 * domain/schemas/api/user-view.ts —— ★ 对外 API 契约 / DTO。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 application/user-view.ts)。
 * 不引入网络/框架类型,保持纯数据。
 *
 * ★ 形状的单源是下面那份 schema,`UserView` 由它 `z.output` 推出(§4.1)。
 *
 * ★ 安全红线:此视图**不含 passwordHash**。任何新增字段前先确认它能否对外
 *   (凭据、盐、内部存储键一律不进视图)。
 */
import { z } from 'zod';

export const userViewSchema = z
  .object({
    id: z.string(),
    nickname: z.string(),
    createdAt: z.string(),
  })
  .strict();

export type UserView = z.output<typeof userViewSchema>;
