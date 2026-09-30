/**
 * domain/entities/cosmetic-item.ts —— 衣橱条目(用户自己的化妆品)。
 * 一条 = 名称(必填) + 若干条**用户自定义**的特性(标签 / 值)+ 归属用户。
 *
 * 为什么特性是自定义的自由键值,而不是固定枚举(品类 / 质地 / 色调…):
 * 用户拍板「特性就自定义」——录入不被十几个固定字段劝退,信息量也不封顶。
 * 代价见模块 README:将来做「平价同款推荐」时拿不到稳定的「品类」锚点,
 * 只能依赖 UI 上那几个**约定标签**(品类 / 色号 / 质地),那是约定不是枚举。
 *
 * ── ★ 字段不在本文件里写第二遍 ────────────────────────────────────────────────
 * `CosmeticItem` 的字段**全部**来自 `schemas/entities/cosmetic-item.ts` 的
 * `cosmeticItemSchema`,走下面那个声明合并的 interface。本文件只加**行为**:
 * 归属守卫 + 两个工厂。§4.1「同一个形状只有一份定义」在这里是结构性的,不靠自觉。
 *
 * ★ 所以别在这里补 `id: string` 之类的字段声明 —— 那就是第二份定义,
 *   而且它会**盖过** schema:字段改了 schema 没改类,编译不报错,只在写盘时悄悄丢。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { CosmeticAttribute, CosmeticItemRow } from '../schemas/index.js';

export type { CosmeticAttribute } from '../schemas/index.js';

/**
 * 一条衣橱条目。
 *
 * ★ 构造器只收**已经过校验的行**(仓库读出口或 `createCosmeticItem`)。
 *   裸字面量与 `{ ...实例 }` 都当不了条目 —— 它们没有 {@link CosmeticItem.assertOwnedBy},
 *   编译器当场报错(实测:`{...item}` 的类型不含原型上的方法)。
 */
export class CosmeticItem {
  constructor(row: CosmeticItemRow) {
    Object.assign(this, row);
  }

  /**
   * 归属守卫。§5 那张表:需要「归属」的规则落在实体的具名守卫上,不写在用例的 if 里 ——
   * 写在用例里的话,换一条路径(比如将来的批量删除)就漏判。
   */
  assertOwnedBy(userId: string): void {
    if (this.userId !== userId) throw itemNotFound(this.id);
  }
}

/** 字段全部来自 schema(声明合并);本文件不重抄一遍。 */
export interface CosmeticItem extends CosmeticItemRow {}

/**
 * 「条目不存在」与「条目不属于你」**共用同一个错误**(§9 越权探测)。
 * ★ 报 403 等于告诉对方「这条存在,只是不是你的」,逐 id 试一遍就能枚举别人的条目。
 *   两种情况的码与文案必须逐字相同 —— 分两处写的那天,差异就从文案里漏出去了。
 */
export function itemNotFound(itemId: string): AppError {
  // ★ 文案用前端的词;不回显 itemId——那是 UUID,用户从没见过它(见 validator 文件头)
  return new AppError(ErrorCode.CABINET_ITEM_NOT_FOUND, '我的化妆包里没有这条');
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
  return new CosmeticItem({ id, userId, name, attributes, createdAt: nowIso() });
}

/** 应用一次修改:只改传进来的字段,并刷新 updatedAt(未传的字段原样保留)。 */
export function updateCosmeticItem(
  item: CosmeticItem,
  changes: { name?: string; attributes?: CosmeticAttribute[] },
): CosmeticItem {
  return new CosmeticItem({
    ...item,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.attributes !== undefined ? { attributes: changes.attributes } : {}),
    updatedAt: nowIso(),
  });
}
