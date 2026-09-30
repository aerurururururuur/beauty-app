/**
 * domain/entities/persona.ts —— 一份人设:名字 + 关系档 + 肤色档 + 面部特征 + 照片 + 归属账号。
 * 人设是**挂在账号下的一张脸**,一个账号可以有多份,所以是独立一张表、带 `userId` 外键。
 *
 * 字段一律来自 `schemas/entities/persona.ts`(下面的声明合并),本文件只加**行为**。
 * ★ 别在这里补 `id: string` 之类的字段声明——那会盖过 schema:编译不报错,只在写盘时悄悄丢。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { PersonaPhoto, PersonaRow, PersonaShape } from '../schemas/index.js';
import type { PersonaSeed } from './persona-seeds.js';

export type { PersonaPhoto } from '../schemas/index.js';

/**
 * 一份人设。构造器只收**已过校验的行**(仓库读出口或 `createPersona`)。
 */
export class Persona {
  constructor(row: PersonaRow) {
    Object.assign(this, row);
  }

  /** 归属守卫:不属于就抛 `PERSONA_NOT_FOUND`。★ 规则落在实体上,不写在用例的 if 里。 */
  assertOwnedBy(userId: string): void {
    if (this.userId !== userId) throw personaNotFound(this.id);
  }
}

/** 字段全部来自 schema(声明合并);本文件不重抄一遍。 */
export interface Persona extends PersonaShape {}

/**
 * 「不存在」与「不属于你」**共用同一个错误**:报 403 等于告诉对方「这份存在」,逐 id 试就能枚举别人的脸。
 * ★ 文案不回显 id —— 那是 UUID,用户从没见过。
 */
export function personaNotFound(personaId: string): AppError {
  void personaId;
  return new AppError(ErrorCode.PERSONA_NOT_FOUND, '人设库里没有这份人设');
}

/**
 * 「这份人设没有服务端照片」(取照片那条在 `none` / `seed` 两态下给的话)。
 * ★ 与 {@link personaNotFound} 分开:那时人设**确实在**,回「没有这份人设」是句反话,而前端原样上屏。
 */
export function personaPhotoMissing(personaId: string): AppError {
  void personaId;
  return new AppError(ErrorCode.PERSONA_PHOTO_NOT_FOUND, '这份人设没有服务端保存的照片');
}

/** 单用户人设上限:JSON 单表整表读写,这个数只为兜住写入成本,不是产品约束(同 `MAX_ITEMS_PER_USER`)。 */
export const MAX_PERSONAS_PER_USER = 100;

function nowIso(): string {
  return new Date().toISOString();
}

/** 建一份已归属的人设(id 由调用方生成;createdAt 取当前时刻)。 */
export function createPersona(
  id: string,
  userId: string,
  fields: {
    name: string;
    relation: string;
    skinTone: string;
    features: string[];
    /** 「补充说明」;空串 = 没写,**不落这一格**(同一份档案在盘上只有一种"没有补充说明"的样子)。 */
    notes: string;
    photo: PersonaPhoto;
  },
): Persona {
  return new Persona({
    id,
    userId,
    name: fields.name,
    relation: fields.relation,
    skinTone: fields.skinTone,
    features: fields.features,
    ...(fields.notes ? { notes: fields.notes } : {}),
    photo: fields.photo,
    createdAt: nowIso(),
  });
}

/**
 * 应用一次修改:只改传进来的字段,并刷新 updatedAt(未传的字段原样保留)。
 * ★ `notes` 是三态里的第三种:传 `''` 是**明确的清空**(把那一格从行里删掉,而不是存一个空串)。
 */
export function updatePersona(
  persona: Persona,
  changes: {
    name?: string;
    relation?: string;
    skinTone?: string;
    features?: string[];
    notes?: string;
    photo?: PersonaPhoto;
  },
): Persona {
  const next: PersonaRow = {
    ...persona,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.relation !== undefined ? { relation: changes.relation } : {}),
    ...(changes.skinTone !== undefined ? { skinTone: changes.skinTone } : {}),
    ...(changes.features !== undefined ? { features: changes.features } : {}),
    ...(changes.photo !== undefined ? { photo: changes.photo } : {}),
    updatedAt: nowIso(),
  };
  if (changes.notes !== undefined) {
    if (changes.notes) next.notes = changes.notes;
    else delete next.notes;
  }
  return new Persona(next);
}

/**
 * 拿一份**种子**给账号造人设(播种用)。与 `createPersona` 分开,因为 `id` 与 `createdAt`
 * 都是**种子表里写死的**(播种要幂等,且同一批种子每次重播次序不变),照片也可能已是 `seed` 那一态。
 */
export function personaFromSeed(seed: PersonaSeed, userId: string): Persona {
  return new Persona({
    id: seed.id,
    userId,
    name: seed.name,
    relation: seed.relation,
    skinTone: seed.skinTone,
    features: [...seed.features],
    photo: seed.photo,
    createdAt: seed.createdAt,
  });
}
