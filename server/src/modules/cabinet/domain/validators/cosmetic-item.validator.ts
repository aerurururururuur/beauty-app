/**
 * domain/validators/cosmetic-item.validator.ts —— 衣橱入参的校验行为。
 * 真正被 presentation / application 调用的对象:
 *   ① 用 schemas(纯形状)检查结构是否合法;
 *   ② 执行形状表达不了的语义规则(trim 后的上下限、字符集、标签去重、
 *      「修改至少要给一个字段」),统一映射成 VALIDATION_ERROR;
 *   ③ 清洗(trim 名称与特性)并产出可直接落库的值。
 *
 * 特性名与值都**照用户原样存**(只 trim),不猜、不改写——
 * 衣橱是用户自己的账本,系统没有资格替他规范用词。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import {
  MAX_ATTRIBUTE_LABEL,
  MAX_ATTRIBUTE_VALUE,
  MAX_NAME,
  createItemSchema,
  itemIdSchema,
  ownerQuerySchema,
  updateItemSchema,
} from '../schemas/cosmetic-item.js';
import { zodIssuesMessage } from './validate.js';

/** 清洗后的一条特性。 */
export interface CleanAttribute {
  label: string;
  value: string;
}

/** 通过校验、可交给用例使用的新增入参。 */
export interface CreateItemInput {
  userId: string;
  name: string;
  attributes: CleanAttribute[];
}

/** 通过校验的修改入参:名称与特性**至多改了其中一个以上**,未给的字段保持不动。 */
export interface UpdateItemInput {
  userId: string;
  name?: string;
  attributes?: CleanAttribute[];
}

/** 通过校验的归属查询(列表 / 删除共用)。 */
export interface OwnerQuery {
  userId: string;
}

/** 是否含控制字符(C0 段 + DEL):这些值会进 JSON、URL 与 UI,含换行 / 制表 / NUL 一律拒收。 */
function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f) return true;
  }
  return false;
}

/** 清洗名称:trim → 非空 → 长度 → 字符集。 */
function cleanName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '名称不能为空');
  }
  if (name.length > MAX_NAME) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `名称最多 ${MAX_NAME} 个字符`);
  }
  if (hasControlChar(name)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '名称不能包含换行或控制字符');
  }
  return name;
}

/**
 * 清洗特性列表:逐条 trim 并校验,再查标签是否重复。
 * 标签重复一律拒收而不是后者覆盖前者——静默丢用户填的东西是最难查的一类 bug。
 */
function cleanAttributes(raw: readonly { label: string; value: string }[]): CleanAttribute[] {
  const cleaned: CleanAttribute[] = [];
  const seen = new Set<string>();

  for (const attr of raw) {
    const label = attr.label.trim();
    const value = attr.value.trim();

    if (label.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '特性名不能为空');
    }
    if (label.length > MAX_ATTRIBUTE_LABEL) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `特性名最多 ${MAX_ATTRIBUTE_LABEL} 个字符`);
    }
    if (value.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `特性「${label}」的值不能为空`);
    }
    if (value.length > MAX_ATTRIBUTE_VALUE) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `特性「${label}」的值最多 ${MAX_ATTRIBUTE_VALUE} 个字符`,
      );
    }
    if (hasControlChar(label) || hasControlChar(value)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `特性「${label}」不能包含换行或控制字符`);
    }
    if (seen.has(label)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `特性名重复:${label}`);
    }

    seen.add(label);
    cleaned.push({ label, value });
  }

  return cleaned;
}

/** 校验衣橱条目 id,合法则原样返回,非法抛 AppError。 */
export function validateItemId(raw: unknown): string {
  const parsed = itemIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  return parsed.data;
}

/** 校验归属查询串(列表 / 删除);不合法抛 AppError,合法返回 userId。 */
export function validateOwnerQuery(raw: unknown): OwnerQuery {
  const parsed = ownerQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }
  return { userId: parsed.data.userId };
}

/** 校验新增入参;不合法抛 AppError,合法返回清洗后的值(特性缺省即空数组)。 */
export function validateCreateInput(raw: unknown): CreateItemInput {
  const parsed = createItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  return {
    userId: parsed.data.userId,
    name: cleanName(parsed.data.name),
    attributes: cleanAttributes(parsed.data.attributes ?? []),
  };
}

/**
 * 校验修改入参。
 * 名称与特性必然**至多改一个以上**才合法:两个都不给等于空操作,直接拒掉,
 * 免得客户端以为改成功了、实际什么也没发生。
 */
export function validateUpdateInput(raw: unknown): UpdateItemInput {
  const parsed = updateItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  const { userId, name, attributes } = parsed.data;
  if (name === undefined && attributes === undefined) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '至少要给出 name 或 attributes 之一');
  }

  return {
    userId,
    ...(name !== undefined ? { name: cleanName(name) } : {}),
    ...(attributes !== undefined ? { attributes: cleanAttributes(attributes) } : {}),
  };
}
