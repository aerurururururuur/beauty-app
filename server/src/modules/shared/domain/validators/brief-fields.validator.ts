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
 * 面部特征最多带几条。
 *
 * ★ 它挡的是**畸形请求**，不是产品限制：词表里一共只有三十几条特征，
 *   64 是任何正常输入都够不着的高度。真正的成员白名单在 `face-catalog` 的目录里
 *   （`shared` 不能 import 它），未知 id 由消费者剔掉，见 `MakeupBrief.features`。
 */
export const MAX_FEATURES = 64;

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
  /** 元素同样只保证是字符串；是不是**认得出来的**特征 id 不在这里判。 */
  features?: readonly string[] | undefined;
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
 *   - `features` 只查条数上限 + 去重 + 去掉空串，**不查成员**（合法 id 在 `face-catalog`）；
 *   - `weather` **不在这里**——它是表单独有的成员，不属于共用字段。
 */
export function checkBriefFields(input: BriefFieldsInput): BriefFieldsCheck {
  const problems: string[] = [];

  const occasion = pickEnum('occasion', input.occasion, OCCASIONS, problems);
  const skinType = pickEnum('skinType', input.skinType, SKIN_TYPES, problems);
  const skinTone = pickEnum('skinTone', input.skinTone, SKIN_TONES, problems);
  const sceneText = checkText('sceneText', input.sceneText, MAX_SCENE_TEXT, problems);
  const dress = checkText('dress', input.dress, MAX_DRESS, problems);
  const features = checkFeatures(input.features, problems);

  if (problems.length > 0) return { ok: false, message: problems.join(';') };

  // ★ 逐字段显式赋值（§6：穷举字段，不用对象展开）——新增字段时这里编译期就会提醒。
  const brief: MakeupBrief = {};
  if (occasion) brief.occasion = occasion;
  if (skinType) brief.skinType = skinType;
  if (skinTone) brief.skinTone = skinTone;
  if (sceneText) brief.sceneText = sceneText;
  if (dress) brief.dress = dress;
  if (features) brief.features = features;
  return { ok: true, brief };
}

/**
 * 特征 id 列表：去重（保序）、丢掉空白项、按 `MAX_FEATURES` 封顶。
 *
 * ★ **空数组视同「没给」**，与上面 `checkText` 的「trim 后为空」同一口径：
 *   一次「部分更新」不该把用户填过的特征静默清空。
 *   ⚠️ 现在**没有**任何一条路能清空它——真要清空得是一个显式动作，不是"少传一个键"。
 */
function checkFeatures(
  value: readonly string[] | undefined,
  problems: string[],
): string[] | undefined {
  if (value === undefined) return undefined;
  if (value.length > MAX_FEATURES) {
    problems.push(`features 最多 ${MAX_FEATURES} 条(收到 ${value.length} 条)`);
    return undefined;
  }
  const seen = new Set<string>();
  for (const raw of value) {
    const id = raw.trim();
    if (id) seen.add(id);
  }
  return seen.size > 0 ? [...seen] : undefined;
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
