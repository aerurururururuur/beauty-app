/**
 * domain/validators/persona.validator.ts —— 人设入参校验:长度 / 上限(常量与正则在**本文件**,§4.2),
 * 失败统一成 `VALIDATION_ERROR`;⚠️ 上限仍是魔数(§4.3 欠账,要兑现得由组合根注入)。
 * ★★ `relation` / `skinTone` / `features` **没有成员白名单,不是漏了** —— 三格只判形状,认不出的值由消费者处理。
 * ✏️ 2026-10-01 照片的体积/类型上限与解码器搬去 `photo.validator.ts`(账号头像共用那一份)。
 */
import { AppError, ErrorCode, MAX_FEATURES, zodIssuesMessage } from '../../../shared/index.js';
import {
  personaAnalyzeSchema,
  personaCreateSchema,
  personaIdSchema,
  personaOwnerQuerySchema,
  personaSeedTableSchema,
  personaTableSchema,
  personaUpdateSchema,
} from '../schemas/index.js';
import { Persona } from '../entities/persona.js';
import { dataUrlToBytes } from './photo.validator.js';

/** 名称原文上限(字,给 trim 留余量;清洗后的上限另判)。 */
export const MAX_NAME_RAW = 48;
/** 名称清洗后上限(字)。 */
export const MAX_NAME = 24;

/**
 * 关系的**预置选项**(种子表 / 测试对表 / 前端 chip 行都从这一份取,别抄第二份)。
 * ★ 2026-09-30 起它**不是入参白名单** —— `relation` 已放开成自由文本,这里只剩"页面上先摆哪几个 chip"。
 */
export const PERSONA_RELATIONS = ['self', 'family', 'friend'] as const;

/** 关系文本长度上限(字)。预置那三个词最长 2 字,自由填的给到 12。 */
export const MAX_RELATION = 12;

/**
 * 肤色档 id 长度上限。★ 只判长度不判成员:自建档的 id 是 `randomUUID`(36 位),白名单没有意义。
 * ⚠️ 改小时先看自建档:**小于 36 会把用户自己建的每一档 422 掉。**
 */
export const MAX_SKIN_TONE = 64;
/** 单条特征 id 长度上限。★ 自定义特征走同一格,所以这个数也是"用户自己写的特征"的上限。 */
export const MAX_FEATURE_ID = 64;
/**
 * 「补充说明」上限(字)。★ **改档页那个 textarea 的 `maxlength` 要跟这个数一致。**
 * ⚠️ 与 `brief-fields.validator.ts` 的 `MAX_PERSONA_NOTES`(300)是**两个数,不是笔误**:
 *   那一格装的是"补充说明 + 用户自己写的自定义特征"拼成的一段话,比这一格长约一倍。
 */
export const MAX_NOTES = 200;

/**
 * 人设 id 与归属用户 id 的格式:URL 安全字符,1..80 位。
 * ★ 两句分开写,不合成一条 —— 那是两个不同的失败。种子 id(`ps-self`)也走这条。
 */
const PERSONA_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * 通过校验、可交给用例的照片指向 = schema 的 `PersonaPhoto` 去掉 `seed` 那一支:
 * 客户端**只能**送 `none`(空串)或 `file`(dataURL);`seed` 只由服务端播种写入,没有入参路径。
 */
export type PersonaPhotoInput =
  | { kind: 'none' }
  | { kind: 'file'; mime: string; bytes: Buffer };

/** 通过校验、可交给用例使用的建档入参。 */
export interface CreatePersonaInput {
  userId: string;
  name: string;
  relation: string;
  skinTone: string;
  features: string[];
  /** 「补充说明」;没写就是空串(`createPersona` 据此决定落不落这一格)。 */
  notes: string;
  photo: PersonaPhotoInput;
}

/** 通过校验的改档入参:未给的字段保持不动。★ `notes` 传 `''` 是**清空**,与"没给"不同。 */
export interface UpdatePersonaInput {
  userId: string;
  name?: string;
  relation?: string;
  skinTone?: string;
  features?: string[];
  notes?: string;
  photo?: PersonaPhotoInput;
}

/** 通过校验的归属查询(列表 / 取照片 / 删除共用)。 */
export interface PersonaOwnerQuery {
  userId: string;
}

/** 通过校验的读脸入参。`photo` 已过体积与 mime 检查,可原样交给端口(它收 dataURL)。 */
export interface AnalyzePersonaInput {
  userId: string;
  photo: string;
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
  if (!OWNER_ID_PATTERN.test(userId)) fail('桃妆账号不合法');
  return userId;
}

/** 清洗名称:原文上限 → trim → 非空 → 长度 → 字符集。 */
function cleanName(raw: string): string {
  if (raw.length > MAX_NAME_RAW) fail(`人设名称原文最多 ${MAX_NAME_RAW} 字`);

  const name = raw.trim();
  if (name.length === 0) fail('人设名称不能为空');
  if (name.length > MAX_NAME) fail(`人设名称最多 ${MAX_NAME} 个字符`);
  if (hasControlChar(name)) fail('人设名称不能包含换行或控制字符');
  return name;
}

/** 关系:**只判形状**(trim 非空 + 长度 + 无控制字符),不查成员(同 `checkSkinTone`)。 */
function checkRelation(raw: string): string {
  const relation = raw.trim();
  if (relation.length === 0) fail('人设关系不能为空');
  if (relation.length > MAX_RELATION) fail(`人设关系最多 ${MAX_RELATION} 个字符`);
  if (hasControlChar(relation)) fail('人设关系不能包含换行或控制字符');
  return relation;
}

/**
 * 「补充说明」:换行统一成 `\n`、trim 后为空一律当**空串**返回。
 * ★ **换行是允许的** —— 这一格就是个多行输入框,照别处拒掉会让一句正常的话 422;其它控制字符照旧不收。
 * ★ **空串必须收下**(不同于 shared 的 `checkText` 把空串当"没给"):传 `''` 就是"删掉它"。
 */
function cleanNotes(raw: string): string {
  if (raw.length > MAX_NOTES) fail(`补充说明最多 ${MAX_NOTES} 字`);

  const notes = raw.replace(/\r\n?/g, '\n').trim();
  for (const ch of notes) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp !== 0x0a && (cp < 0x20 || cp === 0x7f)) fail('补充说明不能包含控制字符');
  }
  return notes;
}

/** 肤色档:**只判形状**(非空 + 长度)。不查成员的理由见文件头。 */
function checkSkinTone(raw: string): string {
  const tone = raw.trim();
  if (tone.length === 0) fail('肤色档不能为空');
  if (tone.length > MAX_SKIN_TONE) fail(`肤色档 id 最多 ${MAX_SKIN_TONE} 个字符`);
  return tone;
}

/**
 * 特征 id 列表:去重(保序)+ 条数上限 + 逐条形状。成员白名单在 `face-catalog`,不在这里。
 * ★ **空数组合法**(「一个特征都没标」);与 `brief.features` 的"空数组视同没给"不同 —— 那边是部分更新。
 *   改档时传 `[]` 就是清空。
 */
function cleanFeatures(raw: readonly string[]): string[] {
  if (raw.length > MAX_FEATURES) fail(`面部特征最多 ${MAX_FEATURES} 条(收到 ${raw.length} 条)`);

  const seen = new Set<string>();
  for (const item of raw) {
    const id = item.trim();
    if (id.length === 0) fail('面部特征不能有空项');
    if (id.length > MAX_FEATURE_ID) fail(`面部特征 id 最多 ${MAX_FEATURE_ID} 个字符`);
    if (hasControlChar(id)) fail('面部特征不能包含换行或控制字符');
    seen.add(id);
  }
  return [...seen];
}

/** 照片入参 → 可落库的指向。★ `''` 是**明确的「不要照片」**;`undefined`(没传)保持不动 —— 分支在调用方。 */
function decodePhoto(raw: string): PersonaPhotoInput {
  if (raw === '') return { kind: 'none' };
  const { mime, bytes } = dataUrlToBytes(raw);
  return { kind: 'file', mime, bytes };
}

/** 校验人设 id,合法则原样返回,非法抛 AppError。 */
export function validatePersonaId(raw: unknown): string {
  const parsed = personaIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error));
  }
  if (!PERSONA_ID_PATTERN.test(parsed.data)) fail('人设 id 不合法');
  return parsed.data;
}

/** 校验归属查询串(列表 / 取照片 / 删除);不合法抛 AppError,合法返回 userId。 */
export function validateOwnerQuery(raw: unknown): PersonaOwnerQuery {
  const parsed = personaOwnerQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }
  return { userId: checkOwnerId(parsed.data.userId) };
}

/** 校验建档入参;不合法抛 AppError,合法返回清洗后的值(特征缺省即空数组、照片缺省即没有)。 */
export function validateCreateInput(raw: unknown): CreatePersonaInput {
  const parsed = personaCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  const { name, relation, skinTone, features, notes, photo } = parsed.data;
  return {
    userId: checkOwnerId(parsed.data.userId),
    name: cleanName(name),
    relation: checkRelation(relation),
    skinTone: checkSkinTone(skinTone),
    features: cleanFeatures(features ?? []),
    notes: cleanNotes(notes ?? ''),
    photo: photo === undefined ? { kind: 'none' } : decodePhoto(photo),
  };
}

/** 校验改档入参。★ **至少要改一样**(`photo: ''` 也算):全不给就是空操作,拒掉,免得客户端以为改成功了。 */
export function validateUpdateInput(raw: unknown): UpdatePersonaInput {
  const parsed = personaUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  const { name, relation, skinTone, features, notes, photo } = parsed.data;
  if (
    name === undefined &&
    relation === undefined &&
    skinTone === undefined &&
    features === undefined &&
    notes === undefined &&
    photo === undefined
  ) {
    // ★ 不说「至少要给出 name 或 …」—— 把 JSON 字段名念给用户听和「桃妆账号」是同一类毛病。
    fail('至少要修改一项(名称 / 关系 / 肤色 / 面部特征 / 补充说明 / 照片)');
  }

  return {
    userId: checkOwnerId(parsed.data.userId),
    ...(name !== undefined ? { name: cleanName(name) } : {}),
    ...(relation !== undefined ? { relation: checkRelation(relation) } : {}),
    ...(skinTone !== undefined ? { skinTone: checkSkinTone(skinTone) } : {}),
    ...(features !== undefined ? { features: cleanFeatures(features) } : {}),
    // ★ `''` 也是一次修改(清空),所以判的是 `!== undefined` 而不是真值(与 `photo` 同款)。
    ...(notes !== undefined ? { notes: cleanNotes(notes) } : {}),
    ...(photo !== undefined ? { photo: decodePhoto(photo) } : {}),
  };
}

/**
 * 校验读脸入参。★ 照片检查**必须在花钱之前**跑(体积超了/类型不对就不该发生那次多模态调用)。
 * 过了之后 `photo` 原样交给端口(端口收 dataURL,由组装根解码)。
 */
export function validateAnalyzeInput(raw: unknown): AnalyzePersonaInput {
  const parsed = personaAnalyzeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  // ★ 只验、不留字节:读脸是"看一眼给个建议",字节不进任何库。
  dataUrlToBytes(parsed.data.photo);
  return { userId: checkOwnerId(parsed.data.userId), photo: parsed.data.photo };
}

/**
 * 落盘表(`personas.json`)的解析点 —— 仓库读出口调它。
 * ★ 只查**形状**,不拿入参规则回溯校验(收紧一条上限时旧数据不该整个读不出来);挡的是文件被手改/写坏。
 * ★ 抛普通 `Error` 而不是 `AppError`:这是**盘上的数据坏了**,该 500 让人去查文件,不是 400 甩锅客户端。
 */
export function parsePersonaTable(raw: unknown, file: string): Record<string, Persona> {
  const parsed = personaTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `人设数据不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }

  const table: Record<string, Persona> = {};
  for (const [id, row] of Object.entries(parsed.data)) {
    // 键与行里的 id 必须一致:钥匙和锁对不上时,按 id 查得到、按用户却列不出来。
    if (row.id !== id) {
      throw new Error(`人设数据不合法:${file} —— 键「${id}」下的人设 id 是「${row.id}」,两者必须一致。`);
    }
    table[id] = new Persona(row);
  }
  return table;
}

/** 播种表(`<dataDir>/personas/seeded.json`)的解析点。口径同上(只查形状、抛普通 `Error`)。 */
export function parseSeedTable(raw: unknown, file: string): Record<string, number> {
  const parsed = personaSeedTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `人设播种记录不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }
  return parsed.data;
}
