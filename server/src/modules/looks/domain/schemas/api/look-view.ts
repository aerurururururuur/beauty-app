/**
 * domain/schemas/api/look-view.ts —— ★ 对外 API 契约 / DTO。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 application/look-view.ts)。
 *
 * ★ 它**在入参 schema 上 extend**,而不是把二十来格再抄一遍 —— 抄一份就是第二个定义,
 *   加一格忘一处的那种漂移没人拦得住(§4.1)。
 *
 * ★ 与实体只差**一格**:`coverUrl`。它是**裸路径**(`/looks/<id>/cover`)——
 *   不含 `API_BASE`、不含 `?userId=`。理由同 `avatarUrl` / `photoUrl` / 渲染图的 `url`:
 *   拼 base 与凭据是**前端 api 模块**的事(见 `api/looks.js` 的 `lookCoverHref`),
 *   后端给了就等于把部署地址焊进数据里。
 */
import { z } from 'zod';
import { createLookSchema } from '../entities/look.js';

export const lookViewSchema = createLookSchema.extend({
  id: z.string(),
  coverUrl: z.string(),
  createdAt: z.string(),
});

/** 列表响应:包一层对象而不是裸数组——将来加 total / 分页游标不必改形状。 */
export const lookListViewSchema = z
  .object({
    items: z.array(lookViewSchema),
  })
  .strict();

export type LookView = z.output<typeof lookViewSchema>;
export type LookListView = z.output<typeof lookListViewSchema>;
