/**
 * domain/api/user-view.ts —— ★ 对外 API 契约 / DTO 类型。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 application/mapping/user-view.mapper.ts)。
 * 不引入网络/框架类型,保持纯数据。
 *
 * ★ 安全红线:此视图**不含 passwordHash**。任何新增字段前先确认它能否对外
 *   (凭据、盐、内部存储键一律不进视图)。
 */
export interface UserView {
  id: string;
  nickname: string;
  createdAt: string;
}
