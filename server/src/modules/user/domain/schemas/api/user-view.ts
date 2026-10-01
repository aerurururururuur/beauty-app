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

/** 头像的来源。★ 前端据此决定要不要把 `avatarUrl` 补成绝对地址(见下面那一格)。 */
export const userAvatarSourceSchema = z.enum(['none', 'stored']);

export const userViewSchema = z
  .object({
    id: z.string(),
    nickname: z.string(),
    /**
     * 「我的」页上那一句自我介绍。★ **恒有这一格**(没有就是空串)——
     * 它给 `<textarea>` 回填用,`undefined` 会让输入框在 Vue 里变成非受控,而那是**静默**的坏法。
     */
    bio: z.string(),
    /**
     * 给 `<img :src>` 用的地址。`avatarSource` 为 `stored` 时是
     * **`/users/<id>/avatar`(不含 `/api`)**,由前端补前缀;`none` 时是空串。
     */
    avatarUrl: z.string(),
    avatarSource: userAvatarSourceSchema,
    createdAt: z.string(),
  })
  .strict();

export type UserView = z.output<typeof userViewSchema>;
