/**
 * domain/validators/skin-tone.validator.ts —— 自建肤色档入参的校验行为(§4.2)。
 * ★ 没有成员白名单:每一格都是用户自己给的(名字他起、色值他选),预置 8 档不进这张表。
 * ★ 色值只认 `#rrggbb`:放宽成"任意 CSS 颜色"就等于让用户在色点上写 `background:url(...)`。
 */
import { AppError, ErrorCode, zodIssuesMessage } from '../../../shared/index.js';
import { skinToneCreateSchema, skinToneTableSchema } from '../schemas/index.js';
import { SkinTone } from '../entities/skin-tone.js';
import { validateUserId } from './user.validator.js';

/** 档名原文上限(字,给 trim 留余量)。 */
export const MAX_TONE_NAME_RAW = 24;
/** 档名清洗后上限(字)。预置那 8 档最长 3 字,自建的给到 8 足够。 */
export const MAX_TONE_NAME = 8;

/** 色值形状。★ 只有这一种:6 位十六进制 + 前导 `#`。 */
const TONE_HEX = /^#[0-9a-fA-F]{6}$/;

/** 通过校验的自建档入参。 */
export interface CreateSkinToneInput {
  userId: string;
  name: string;
  hex: string;
}

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/** 清洗档名:原文上限 → trim → 非空 → 长度 → 无控制字符。 */
function cleanToneName(raw: string): string {
  if (raw.length > MAX_TONE_NAME_RAW) fail(`肤色档名原文最多 ${MAX_TONE_NAME_RAW} 字`);

  const name = raw.trim();
  if (name.length === 0) fail('肤色档名不能为空');
  if (name.length > MAX_TONE_NAME) fail(`肤色档名最多 ${MAX_TONE_NAME} 个字符`);
  for (const ch of name) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f) fail('肤色档名不能包含换行或控制字符');
  }
  return name;
}

/** 色值:trim 后必须是 `#rrggbb`。★ 统一转小写,免得同一种颜色在盘上有两份写法。 */
function cleanToneHex(raw: string): string {
  const hex = raw.trim();
  if (!TONE_HEX.test(hex)) fail('肤色颜色要写成 #RRGGBB(例如 #C9A227)');
  return hex.toLowerCase();
}

/** 校验自建档入参;不合法抛 AppError,合法返回清洗后的值。 */
export function validateCreateSkinToneInput(raw: unknown): CreateSkinToneInput {
  const parsed = skinToneCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  return {
    userId: validateUserId(parsed.data.userId),
    name: cleanToneName(parsed.data.name),
    hex: cleanToneHex(parsed.data.hex),
  };
}

/**
 * 落盘表(`tones.json`)的解析点 —— 仓库读出口调它。口径同 `parsePersonaTable`:
 * 只查形状、不拿入参规则回溯校验;抛普通 `Error`(盘上数据坏了该 500,不是 400 甩锅客户端)。
 */
export function parseSkinToneTable(raw: unknown, file: string): Record<string, SkinTone> {
  const parsed = skinToneTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `肤色档数据不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }

  const table: Record<string, SkinTone> = {};
  for (const [id, row] of Object.entries(parsed.data)) {
    // 键与行里的 id 必须一致:对不上时,按 id 查得到、按用户却列不出来。
    if (row.id !== id) {
      throw new Error(`肤色档数据不合法:${file} —— 键「${id}」下的档 id 是「${row.id}」,两者必须一致。`);
    }
    table[id] = new SkinTone(row);
  }
  return table;
}
