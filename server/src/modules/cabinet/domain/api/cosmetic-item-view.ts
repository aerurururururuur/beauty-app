/**
 * domain/api/cosmetic-item-view.ts —— ★ 对外 API 契约 / DTO 类型。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 application/mapping/)。
 * 不引入网络/框架类型,保持纯数据。
 *
 * 本模块目前没有需要挡在视图之外的字段(实体本身就是可对外的),
 * 但视图仍然独立声明:将来若实体长出内部字段,改这里即可,不牵动实体。
 */
export interface CosmeticAttributeView {
  label: string;
  value: string;
}

export interface CosmeticItemView {
  id: string;
  userId: string;
  name: string;
  attributes: CosmeticAttributeView[];
  createdAt: string;
  updatedAt?: string;
}

/** 列表响应:包一层对象而不是裸数组——将来加 total / 分页游标不必改形状。 */
export interface CosmeticListView {
  items: CosmeticItemView[];
}
