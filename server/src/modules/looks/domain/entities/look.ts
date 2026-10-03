/**
 * domain/entities/look.ts —— 一版存下来的妆容(「我的妆容档案」里的一条)。
 * 一条 = **复制过来的封面字节** + 那一版的方案(场景 / 风格 / 步骤 / 色板 / 产品)+ 归属账号。
 * ★ 封面为什么必须复制(而不是存 `sessionId + seq` 引用):见模块 README。
 *
 * ★ 字段不在本文件里写第二遍:`Look` 的全部字段来自 `schemas/entities/look.ts` 的
 *   `lookSchema`,走下面那个声明合并的 interface。本文件只加**行为**:归属守卫 + 工厂(§4.1)。
 * ★ 别在这里补 `id: string` 之类的字段声明 —— 那是第二份定义,而且会**盖过** schema:
 *   字段改了 schema 没改类,编译不报错,只在写盘时悄悄丢。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { LookRow } from '../schemas/index.js';

/**
 * 一版妆容。
 *
 * ★ 构造器只收**已经过校验的行**(仓库读出口或 `createLook`)。
 *   裸字面量当不了档案 —— 它没有 {@link Look.assertOwnedBy},编译器当场报错。
 */
export class Look {
  constructor(row: LookRow) {
    Object.assign(this, row);
  }

  /**
   * 归属守卫。§5 那张表:需要「归属」的规则落在实体的具名守卫上,不写在用例的 if 里 ——
   * 写在用例里的话,换一条路径就漏判。
   */
  assertOwnedBy(userId: string): void {
    if (this.userId !== userId) throw lookNotFound();
  }
}

/** 字段全部来自 schema(声明合并);本文件不重抄一遍。 */
export interface Look extends LookRow {}

/**
 * 「档案不存在」与「档案不属于你」**共用同一个错误**(§9 越权探测)。
 * ★ 报 403 等于告诉对方「这一版存在,只是不是你的」,逐 id 试一遍就能枚举别人的档案。
 *   两种情况的码与文案必须逐字相同。
 */
export function lookNotFound(): AppError {
  // ★ 文案用前端的词(「我的妆容档案」),不回显 id——那是 UUID,用户从没见过它。
  return new AppError(ErrorCode.LOOK_NOT_FOUND, '我的妆容档案里没有这一版');
}

/** 存档案时源图已经找不到了(会话过期 / 重启后会话没了 / 序号不在里面)。 */
export function coverUnavailable(): AppError {
  return new AppError(
    ErrorCode.LOOK_COVER_UNAVAILABLE,
    '这次生成的图已经找不到了，保存不了。请重新生成一版再来。',
  );
}

/** 档案在、但它的封面字节读不到(记录与盘不一致)。 */
export function coverNotFound(): AppError {
  return new AppError(ErrorCode.LOOK_COVER_NOT_FOUND, '这一版的封面图读不到了');
}

/**
 * 单账号档案上限。
 * JSON 单表是「整表读改写」,不设上限的话反复保存会越写越慢;
 * 这个数字只为兜住写入成本,不是产品约束。
 */
export const MAX_ITEMS_PER_USER = 100;

/** 建一版已归属的档案(`id` 与 `coverMime` 由调用方给;`createdAt` 取当前时刻)。 */
export function createLook(row: Omit<LookRow, 'createdAt'>): Look {
  return new Look({ ...row, createdAt: new Date().toISOString() });
}

/** 同一版妆容的判据:`(sessionId, seq)` 相同即同一张图。用来做保存的幂等。 */
export function isSameSource(look: Look, sessionId: string, seq: number): boolean {
  return look.sessionId === sessionId && look.seq === seq;
}
