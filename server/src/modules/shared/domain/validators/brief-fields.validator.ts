/**
 * shared/domain/validators/brief-fields.validator.ts —— 简报字段的**行为**（§4.2）。
 *
 * ── 为什么规则在这里、不在 schema 里 ─────────────────────────────────────────
 *
 * `domain/schemas/contracts/brief-fields.ts` 只回答「这是什么结构」：五个字段都是
 * 可选字符串。**「哪些取值算合法」「最长多少字」是业务规则，不是结构**——
 * 所以它们在这里，和枚举单源（`domain/entities/brief.ts` 的元组）待在一起。
 *
 * ★ **这是本规则的唯一一份实现。** 需求从两条路进来——开会话
 *   （`validateStartSession`）和对话（`patch_brief` 工具）——两条路**都调这个函数**，
 *   谁也不许自己再判一遍。此前两边各自展开同一份 `z.enum` / `.max()`，
 *   schema 一变松（例如把 `z.enum` 降成 `z.string()`）**两边会一起静默失守**。
 *
 * ⚠️ **长度上限的欠账（§4.3）**：`MAX_SCENE_TEXT` / `MAX_DRESS` 是写死的魔数。
 *   §4.3 要求这类可调上限由组合根注入，本文件里不该出现字面量。
 *   **本轮只搬位置、没兑现注入**——所以这两个常量仍然只是从一个文件挪到了另一个文件。
 *   要真兑现得连 §4.3 一起做，单独一轮。
 *
 * 返回**结果对象而不是抛异常**：两个调用方对失败的表达方式不同——HTTP 那条要
 * `AppError`（映射成 422），对话那条要把失败**回填成给模型看的 observation**
 * （§7.3 第 4 条：工具错误不抛穿循环）。规则只有一份，失败怎么呈现由各自决定。
 */
import type { MakeupBrief } from '../entities/brief.js';
import { OCCASIONS, SKIN_TONES, SKIN_TYPES } from '../entities/brief.js';

/** 自由文字（场景文字）上限（字）。 */
export const MAX_SCENE_TEXT = 2000;
/** 穿搭一句话描述上限（字）。 */
export const MAX_DRESS = 80;

/**
 * 待检字段。**故意用 `string` 而不是枚举联合**：调用方给的是「刚过形状、还没过规则」
 * 的值，它此刻**确实**可能是一个非法字符串——类型如实反映这一点，
 * 而不是靠一个 cast 假装它已经合法了。
 */
export interface BriefFieldsInput {
  occasion?: string | undefined;
  sceneText?: string | undefined;
  skinType?: string | undefined;
  skinTone?: string | undefined;
  dress?: string | undefined;
}

export type BriefFieldsCheck =
  | { ok: true; brief: MakeupBrief }
  | { ok: false; message: string };

/**
 * 校验并清洗五个共用字段。
 *
 * 规则：
 *   - `occasion` / `skinType` / `skinTone` 必须在 `entities/brief.ts` 的元组里；
 *   - `sceneText` / `dress` **按原文长度**判上限（与 schema 时的口径一致：
 *     先量后 trim，不因为补一个尾随空格就放宽），trim 后为空视同**没给**；
 *   - `weather` **不在这里**——它是表单独有的成员，不属于共用字段。
 */
export function checkBriefFields(input: BriefFieldsInput): BriefFieldsCheck {
  const problems: string[] = [];

  const occasion = pickEnum('occasion', input.occasion, OCCASIONS, problems);
  const skinType = pickEnum('skinType', input.skinType, SKIN_TYPES, problems);
  const skinTone = pickEnum('skinTone', input.skinTone, SKIN_TONES, problems);
  const sceneText = checkText('sceneText', input.sceneText, MAX_SCENE_TEXT, problems);
  const dress = checkText('dress', input.dress, MAX_DRESS, problems);

  if (problems.length > 0) return { ok: false, message: problems.join(';') };

  // ★ 逐字段显式赋值（§6：穷举字段，不用对象展开）——新增字段时这里编译期就会提醒。
  const brief: MakeupBrief = {};
  if (occasion) brief.occasion = occasion;
  if (skinType) brief.skinType = skinType;
  if (skinTone) brief.skinTone = skinTone;
  if (sceneText) brief.sceneText = sceneText;
  if (dress) brief.dress = dress;
  return { ok: true, brief };
}

/**
 * 白名单取值。★ 失败消息带上**完整可选清单**，因为这条消息会经 `patch_brief`
 * 原样回填给模型（同 `look-spec.validator.ts` 的理由）：只说「不合法」，
 * 模型只能瞎猜，那是 agent 循环空转的常见成因。
 */
function pickEnum<T extends string>(
  field: string,
  value: string | undefined,
  allowed: readonly T[],
  problems: string[],
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    problems.push(`${field} 取值「${value}」不合法;可用:${allowed.join(' / ')}`);
    return undefined;
  }
  return value as T;
}

/** 长度上限 + trim。trim 后为空视同没给（一次「部分更新」不该静默清掉用户说过的内容）。 */
function checkText(
  field: string,
  value: string | undefined,
  max: number,
  problems: string[],
): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > max) {
    problems.push(`${field} 最多 ${max} 字(收到 ${value.length} 字)`);
    return undefined;
  }
  return value.trim() || undefined;
}
