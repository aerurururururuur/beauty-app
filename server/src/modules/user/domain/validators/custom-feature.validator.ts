/**
 * domain/validators/custom-feature.validator.ts —— 自建特征入参的校验行为(§4.2)。
 * ★ **没有分组白名单**:每一格都是用户自己给的(分组他挑、原话他写),预置 31 条不进这张表。
 * ★★ 两个上限必须和 `persona.validator.ts` 的 `MAX_FEATURE_ID`(64)对得上:
 *   `MAX_FEATURE_GROUP`(16) + `/` + `MAX_FEATURE_TEXT`(40) = 57 < 64。
 *   对不上的坏法很隐蔽 —— 库里**建得成**,写进人设才 422,而那是**另一个动作**。
 */
import { AppError, ErrorCode, zodIssuesMessage } from '../../../shared/index.js';
import { customFeatureCreateSchema, customFeatureTableSchema } from '../schemas/index.js';
import { CustomFeature } from '../entities/custom-feature.js';
import { validateUserId } from './user.validator.js';

/** 分组 id 长度上限。今天最长的是 `cheek` / `ratio`(5 字),给到 16 只为兜住怪值。 */
export const MAX_FEATURE_GROUP = 16;
/** 原话原文上限(字,给 trim 留余量)。 */
export const MAX_FEATURE_TEXT_RAW = 48;
/** 原话清洗后上限(字)。★ 与 `FeaturePicker` 那个输入框的 `maxlength` 是同一个数。 */
export const MAX_FEATURE_TEXT = 40;

/** 通过校验的自建档入参。 */
export interface CreateCustomFeatureInput {
  userId: string;
  group: string;
  text: string;
}

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/** 通用标量:原文上限 → trim → 非空 → 长度 → 无控制字符。 */
function cleanScalar(raw: string, maxRaw: number, max: number, what: string): string {
  if (raw.length > maxRaw) fail(`${what}原文最多 ${maxRaw} 字`);

  const value = raw.trim();
  if (value.length === 0) fail(`${what}不能为空`);
  if (value.length > max) fail(`${what}最多 ${max} 个字符`);
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f) fail(`${what}不能包含换行或控制字符`);
  }
  return value;
}

/** 校验自建档入参;不合法抛 AppError,合法返回清洗后的值。 */
export function validateCreateCustomFeatureInput(raw: unknown): CreateCustomFeatureInput {
  const parsed = customFeatureCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }

  return {
    userId: validateUserId(parsed.data.userId),
    group: cleanScalar(parsed.data.group, MAX_FEATURE_GROUP, MAX_FEATURE_GROUP, '特征分组'),
    text: cleanScalar(parsed.data.text, MAX_FEATURE_TEXT_RAW, MAX_FEATURE_TEXT, '特征原话'),
  };
}

/**
 * 落盘表(`features.json`)的解析点 —— 仓库读出口调它。口径同 `parseSkinToneTable`:
 * 只查形状、不拿入参规则回溯校验;抛普通 `Error`(盘上数据坏了该 500,不是 400 甩锅客户端)。
 */
export function parseCustomFeatureTable(raw: unknown, file: string): Record<string, CustomFeature> {
  const parsed = customFeatureTableSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `自建特征数据不合法:${file} —— ${zodIssuesMessage(parsed.error)}。` +
        '这是 dataDir 下的落盘数据,不是请求入参;多半是文件被手改过。',
    );
  }

  const table: Record<string, CustomFeature> = {};
  for (const [id, row] of Object.entries(parsed.data)) {
    // 键与行里的 id 必须一致:对不上时,按 id 查得到、按用户却列不出来。
    if (row.id !== id) {
      throw new Error(`自建特征数据不合法:${file} —— 键「${id}」下的条目 id 是「${row.id}」,两者必须一致。`);
    }
    table[id] = new CustomFeature(row);
  }
  return table;
}
