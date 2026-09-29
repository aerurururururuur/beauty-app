/**
 * domain/validators/cosmetic-item.validator.ts —— 衣橱入参的校验行为。
 * 真正被 presentation / application 调用的对象:
 *   ① 用 schemas(纯形状)检查结构是否合法;
 *   ② 执行形状表达不了的语义规则(trim 后的上下限、字符集、标签去重、
 *      「修改至少要给一个字段」),统一映射成 VALIDATION_ERROR;
 *   ③ 清洗(trim 名称与特性)并产出可直接落库的值。
 *
 * ★ §4.2:上面那些**上下限常量与 id 格式正则定义在本文件里**,不在 `schemas/` ——
 *   规则和它的错误文案放一起,改一处就生效;schema 那边只剩「是不是字符串」。
 *   ⚠️ §4.3 欠账:这些上限仍是文件里的魔数,要真兑现得由组合根注入(单独一轮)。
 *
 * 特性名与值都**照用户原样存**(只 trim),不猜、不改写——
 * 衣橱是用户自己的账本,系统没有资格替他规范用词。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import {
  cosmeticItemTableSchema,
  createItemSchema,
  itemIdSchema,
  ownerQuerySchema,
  updateItemSchema,
} from '../schemas/index.js';
import { zodIssuesMessage } from '../../../shared/index.js';
import { CosmeticItem } from '../entities/cosmetic-item.js';
import type { CosmeticAttribute } from '../schemas/index.js';

/** 名称原文上限(字,给 trim 留余量;清洗后的上下限另判)。 */
export const MAX_NAME_RAW = 80;
/** 名称清洗后上限(字)。 */
export const MAX_NAME = 40;

/** 单条目的特性条数上限。 */
export const MAX_ATTRIBUTES = 12;
/** 特性名原文 / 清洗后上限(字)。 */
export const MAX_ATTRIBUTE_LABEL_RAW = 32;
export const MAX_ATTRIBUTE_LABEL = 16;
/** 特性值原文 / 清洗后上限(字)。 */
export const MAX_ATTRIBUTE_VALUE_RAW = 96;
export const MAX_ATTRIBUTE_VALUE = 40;

/**
 * 衣橱条目 id 与归属用户 id 的格式:只认 URL 安全字符,1..80 位。
 *
 * ★ 与 `user` 的同名正则**逐字同款但各持一份** —— 模块之间不互相 import
 *   (见模块 README 的依赖方向约定),不为了一个正则破例。改这里请顺手看另一处。
 *   两句**分开写**,不为"省一行"合成一条、临时传个标签进去:那两句话是两个不同的
 *   失败(「条目 id 不合法」/「用户 id 不合法」),对客户端是两条不同的修法。
 */
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * 清洗后的一条特性。
 * ★ 形状就是 `CosmeticAttribute`(schema 推导)本身,不另立第二份 —— §4.1。
 */
export type CleanAttribute = CosmeticAttribute;

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

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/** 归属用户 id:形状已由 schema 保证,格式在这里判(§4.2)。 */
function checkOwnerId(userId: string): string {
  if (!OWNER_ID_PATTERN.test(userId)) fail('用户 id 不合法');
  return userId;
}

/** 清洗名称:原文上限 → trim → 非空 → 长度 → 字符集。 */
function cleanName(raw: string): string {
  // 原文上限先判(§4.2 后在这里):先挡住超大 payload,再谈清洗后的上下限。
  if (raw.length > MAX_NAME_RAW) fail(`名称原文最多 ${MAX_NAME_RAW} 字`);

  const name = raw.trim();
  if (name.length === 0) {
    fail('名称不能为空');
  }
  if (name.length > MAX_NAME) {
    fail(`名称最多 ${MAX_NAME} 个字符`);
  }
  if (hasControlChar(name)) {
    fail('名称不能包含换行或控制字符');
  }
  return name;
}

/**
 * 清洗特性列表:条数 → 逐条 trim 并校验 → 查标签是否重复。
 * 标签重复一律拒收而不是后者覆盖前者——静默丢用户填的东西是最难查的一类 bug。
 */
function cleanAttributes(raw: readonly { label: string; value: string }[]): CleanAttribute[] {
  if (raw.length > MAX_ATTRIBUTES) fail(`特性最多 ${MAX_ATTRIBUTES} 条`);

  const cleaned: CleanAttribute[] = [];
  const seen = new Set<string>();

  for (const attr of raw) {
    const label = attr.label.trim();
    const value = attr.value.trim();

    // 原文上限(同上,先挡 payload)。⚠️ 用**原文**长度,不是 trim 后的。
    if (attr.label.length > MAX_ATTRIBUTE_LABEL_RAW) {
      fail(`特性名原文最多 ${MAX_ATTRIBUTE_LABEL_RAW} 字`);
    }
    if (attr.value.length > MAX_ATTRIBUTE_VALUE_RAW) {
      fail(`特性「${label}」的值原文最多 ${MAX_ATTRIBUTE_VALUE_RAW} 字`);
    }
    if (label.length === 0) {
      fail('特性名不能为空');
    }
    if (label.length > MAX_ATTRIBUTE_LABEL) {
      fail(`特性名最多 ${MAX_ATTRIBUTE_LABEL} 个字符`);
    }
    if (value.length === 0) {
      fail(`特性「${label}」的值不能为空`);
    }
    if (value.length > MAX_ATTRIBUTE_VALUE) {
      fail(`特性「${label}」的值最多 ${MAX_ATTRIBUTE_VALUE} 个字符`);
    }
    if (hasControlChar(label) || hasControlChar(value)) {
      fail(`特性「${label}」不能包含换行或控制字符`);
    }
    if (seen.has(label)) {
      fail(`特性名重复:${label}`);
    }

    seen.add(label);
    cleaned.push({ label, value });
  }

  return cleaned;
}

/** 校验衣橱条目 id,合法则原样返回,非法抛 AppError。 */
export function validateItemId(raw: unknown): string {
  // ① 形状
  const parsed = itemIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  // ② 格式(§4.2)
  if (!ITEM_ID_PATTERN.test(parsed.data)) fail('衣橱条目 id 不合法');
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
  return { userId: checkOwnerId(parsed.data.userId) };
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
    userId: checkOwnerId(parsed.data.userId),
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

  const { name, attributes } = parsed.data;
  if (name === undefined && attributes === undefined) {
    fail('至少要给出 name 或 attributes 之一');
  }

  return {
    userId: checkOwnerId(parsed.data.userId),
    ...(name !== undefined ? { name: cleanName(name) } : {}),
    ...(attributes !== undefined ? { attributes: cleanAttributes(attributes) } : {}),
  };
}

/**
 * 落盘表(`dataDir/cabinet/items.json`)的解析点 —— 仓库读出口调它(§7.2)。
 *
 * ★ 这里只查**形状**。长度上限、条数上限、id 格式是**入参**规则,不拿来回溯校验盘上的数据:
 *   某天收紧一条上限,旧数据不该整个读不出来。这道网要挡的是另一类事 ——
 *   文件被手改过、写坏了,形状对不上。
 * ★ 抛普通 `Error` 而不是 `AppError`:这不是「这个请求不合法」,是**盘上的数据坏了**。
 *   该以 500 结束并让人去查那个文件,不是一个 400 把锅甩给客户端。
 */
export function parseItemTable(raw: unknown, file: string): Record<string, CosmeticItem> {
  const parsed = cosmeticItemTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `衣橱数据不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }

  const table: Record<string, CosmeticItem> = {};
  for (const [id, row] of Object.entries(parsed.data)) {
    // 键与行里的 id 必须一致:钥匙和锁对不上时,按 id 查得到、按用户却列不出来。
    if (row.id !== id) {
      throw new Error(
        `衣橱数据不合法:${file} —— 键「${id}」下的条目 id 是「${row.id}」,两者必须一致。`,
      );
    }
    table[id] = new CosmeticItem(row);
  }
  return table;
}
