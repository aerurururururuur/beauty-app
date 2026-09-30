/**
 * domain/entities/custom-feature.ts —— 一条**自建**面部特征:分组 + 原话 + 归属账号。
 * 字段一律来自 `schemas/entities/custom-feature.ts`(声明合并),本文件只加**行为**。
 * ★ 别在这里补 `id: string` 之类的字段声明——那会盖过 schema:编译不报错,只在写盘时悄悄丢。
 * ★★ 人设行里存的**不是这个 id**,是 `group + '/' + text`(见 `customFeatureIdOf`)。
 *   所以"还有没有人在用"要按那串字符串比,而这一行的 id 只用来删自己。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { CustomFeatureRow, CustomFeatureShape } from '../schemas/index.js';

/**
 * 一条自建特征。构造器只收**已过校验的行**(仓库读出口或 `createCustomFeature`)。
 */
export class CustomFeature {
  constructor(row: CustomFeatureRow) {
    Object.assign(this, row);
  }

  /** 归属守卫:不属于就抛 `CUSTOM_FEATURE_NOT_FOUND`(同 `SkinTone.assertOwnedBy` 的理由)。 */
  assertOwnedBy(userId: string): void {
    if (this.userId !== userId) throw customFeatureNotFound(this.id);
  }
}

/** 字段全部来自 schema(声明合并);本文件不重抄一遍。 */
export interface CustomFeature extends CustomFeatureShape {}

/**
 * 这一条写在人设行 `features` 里的样子。
 * ★★ 唯一的拼点(服务端这一侧):前端 `kb/features.js` 的 `featureIdOf` 拼的是同样一串。
 *   改分隔符 = 已有数据全部读不出来,而人设那一格只是 `string[]`,**不会报任何错**。
 */
export function customFeatureIdOf(group: string, text: string): string {
  return `${group}/${text}`;
}

/**
 * 「不存在」与「不属于你」**共用同一个错误**:报 403 等于告诉对方「这一条存在」,逐 id 试就能枚举别人的库。
 * ★ 文案不回显 id —— 那是 UUID,用户从没见过。
 */
export function customFeatureNotFound(customFeatureId: string): AppError {
  void customFeatureId;
  return new AppError(ErrorCode.CUSTOM_FEATURE_NOT_FOUND, '特征库里没有这一条');
}

/**
 * 还有人在用这一条时不让删。
 * ★ **不能静默删**:用户写在脸上那句话会从他的档案里消失,而且**不报错** —— 本仓最怕的那种坏法。
 *   所以这里拦下来,让用户先去把那几份人设里那一条去掉。
 */
export function customFeatureInUse(customFeatureId: string, count: number): AppError {
  void customFeatureId;
  return new AppError(
    ErrorCode.CUSTOM_FEATURE_IN_USE,
    `还有 ${count} 份人设在用这一条特征,先把它们去掉再删`,
    { count },
  );
}

/** 单账号自建条数上限:整表读写,这个数只为兜住写入成本,不是产品约束(同 `MAX_TONES_PER_USER`)。 */
export const MAX_CUSTOM_FEATURES_PER_USER = 50;

function nowIso(): string {
  return new Date().toISOString();
}

/** 建一条已归属的自建特征(id 由调用方生成;createdAt 取当前时刻)。 */
export function createCustomFeature(
  id: string,
  userId: string,
  fields: { group: string; text: string },
): CustomFeature {
  return new CustomFeature({
    id,
    userId,
    group: fields.group,
    text: fields.text,
    createdAt: nowIso(),
  });
}
