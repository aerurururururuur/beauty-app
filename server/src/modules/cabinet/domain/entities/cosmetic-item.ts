/**
 * domain/entities/cosmetic-item.ts —— 衣橱条目(用户自己的化妆品)。
 * 一条 = 名称(必填) + 若干条**用户自定义**的特性(标签 / 值)+ 归属用户。
 *
 * 为什么特性是自定义的自由键值,而不是固定枚举(品类 / 质地 / 色调…):
 * 用户拍板「特性就自定义」——录入不被十几个固定字段劝退,信息量也不封顶。
 * 代价见模块 README:recommendations 拿不到稳定的「品类」锚点,
 * 只能依赖 UI 上那几个**约定标签**(品类 / 色号 / 质地),那是约定不是枚举。
 */
export interface CosmeticAttribute {
  /** 特性名,如「色号」;由用户自定,不设词表。 */
  label: string;
  /** 特性值,如「#420 豆沙」。 */
  value: string;
}

export interface CosmeticItem {
  /** 条目唯一标识(UUID)。 */
  id: string;
  /** 归属用户 id。★ 只做字符串层面的搬运,「用户是否存在」由 UserDirectory 端口判定。 */
  userId: string;
  /** 化妆品名称,如「豆沙色唇釉」。 */
  name: string;
  /** 自定义特性,可为空数组(允许"只记个名字")。顺序即用户录入顺序。 */
  attributes: CosmeticAttribute[];
  /** 建档时间(ISO 8601)。 */
  createdAt: string;
  /** 最后一次修改时间(ISO 8601);从未改过则不存在。 */
  updatedAt?: string;
}

/**
 * 单用户条目上限。
 * JSON 单表是「整表读改写」,不设上限的话演示时反复添加会越写越慢;
 * 这个数字只为兜住写入成本,不是产品约束。
 */
export const MAX_ITEMS_PER_USER = 100;

function nowIso(): string {
  return new Date().toISOString();
}

/** 建一条已归属的衣橱条目(id 由调用方生成;createdAt 取当前时刻)。 */
export function createCosmeticItem(
  id: string,
  userId: string,
  name: string,
  attributes: CosmeticAttribute[],
): CosmeticItem {
  return { id, userId, name, attributes, createdAt: nowIso() };
}

/** 应用一次修改:只改传进来的字段,并刷新 updatedAt(未传的字段原样保留)。 */
export function updateCosmeticItem(
  item: CosmeticItem,
  changes: { name?: string; attributes?: CosmeticAttribute[] },
): CosmeticItem {
  return {
    ...item,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.attributes !== undefined ? { attributes: changes.attributes } : {}),
    updatedAt: nowIso(),
  };
}
