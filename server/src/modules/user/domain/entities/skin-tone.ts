/**
 * domain/entities/skin-tone.ts —— 一个**自建**肤色档:名字 + 真实肤底色 + 归属账号。
 * 字段一律来自 `schemas/entities/skin-tone.ts`(声明合并),本文件只加**行为**。
 * ★ 别在这里补 `id: string` 之类的字段声明——那会盖过 schema:编译不报错,只在写盘时悄悄丢。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { SkinToneRow, SkinToneShape } from '../schemas/index.js';

/**
 * 一个自建肤色档。构造器只收**已过校验的行**(仓库读出口或 `createSkinTone`)。
 */
export class SkinTone {
  constructor(row: SkinToneRow) {
    Object.assign(this, row);
  }

  /** 归属守卫:不属于就抛 `SKIN_TONE_NOT_FOUND`(同 `Persona.assertOwnedBy` 的理由)。 */
  assertOwnedBy(userId: string): void {
    if (this.userId !== userId) throw skinToneNotFound(this.id);
  }
}

/** 字段全部来自 schema(声明合并);本文件不重抄一遍。 */
export interface SkinTone extends SkinToneShape {}

/**
 * 「不存在」与「不属于你」**共用同一个错误**:报 403 等于告诉对方「这一档存在」,逐 id 试就能枚举别人的库。
 * ★ 文案不回显 id —— 那是 UUID,用户从没见过。
 */
export function skinToneNotFound(skinToneId: string): AppError {
  void skinToneId;
  return new AppError(ErrorCode.SKIN_TONE_NOT_FOUND, '肤色库里没有这一档');
}

/**
 * 还有人在用这一档时不让删。
 * ★ **不能静默删**:那几份人设的 `skinTone` 会变成悬空 id,前端渲染成「未定档」+ 无色块,
 *   而且**不报错** —— 正是本仓最怕的那种坏法。所以这里拦下来,让用户先去改那几份。
 */
export function skinToneInUse(skinToneId: string, count: number): AppError {
  void skinToneId;
  return new AppError(
    ErrorCode.SKIN_TONE_IN_USE,
    `还有 ${count} 份人设在用这一档肤色,先把它们改到别的档再删`,
    { count },
  );
}

/** 单账号自建档上限:整表读写,这个数只为兜住写入成本,不是产品约束(同 `MAX_PERSONAS_PER_USER`)。 */
export const MAX_TONES_PER_USER = 20;

function nowIso(): string {
  return new Date().toISOString();
}

/** 建一个已归属的自建档(id 由调用方生成;createdAt 取当前时刻)。 */
export function createSkinTone(
  id: string,
  userId: string,
  fields: { name: string; hex: string },
): SkinTone {
  return new SkinTone({
    id,
    userId,
    name: fields.name,
    hex: fields.hex,
    createdAt: nowIso(),
  });
}
