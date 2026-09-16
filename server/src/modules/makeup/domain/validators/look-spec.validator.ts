/**
 * makeup/domain/validators/look-spec.validator.ts —— `LookSpec` 的校验**行为**。
 *
 * 分工:`schemas/look-spec.ts` 只声明形状;这里执行形状表达不了的两件事:
 *   ① 清洗与形状错误的中文化;
 *   ② ★ §6 规矩 4:**合法取值空间按 `skinTone` 收窄**——「不是生成完再检查」。
 *
 * ★ **错误消息是写给 LLM 看的 prompt,不是给人看的日志。**
 *   `propose_look` 工具把这里抛出的消息**原样回填成 observation**给模型(§7.3 第 4 条:
 *   工具错误不抛穿循环),模型据此决定怎么改。所以每条消息都必须**带上合法取值清单**——
 *   只说「不合法」而不说「可用哪些」,模型只能瞎猜,这正是 agent 循环空转的常见成因。
 *   (§7.3 第 3 条说「工具描述是给模型看的 prompt」,同一条道理适用于工具的错误输出。)
 *
 * 失败抛 `AppError(VALIDATION_ERROR)`。**刻意不新增错误码**:
 * 这条路径的失败由 agent 循环消化成 observation,**不会**走到 HTTP,
 * 因此不需要在 `shared/presentation/error-handler.ts` 里多一格映射。
 */
import type { z } from 'zod';
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { SkinTone } from '../../../shared/index.js';
import type { LookSpec, ToneKey } from '../entities/look-spec.js';
import { ZONE_ROLES } from '../entities/look-spec.js';
import { lookSpecSchema } from '../schemas/look-spec.js';

/**
 * ⚠️ **PLACEHOLDER —— 这张表的内容没有实测依据。**
 * §15.1:`LookSpec` 的枚举取值「一个都没定」;§14.1 更直接——颜色安全区的实测
 * **`n=1`**,只在一种肤色上验证过,「颜色安全区是否跨肤色成立**没有数据**」。
 *
 * 形状是对的(§6 规矩 4 要求的「按肤色收窄」),**内容是占位的**:
 * 它现在只是「深肤色避开过浅的裸色系」这类常识性排布,**不是**评测结论。
 * 接线前必须用 5 档肤色的实测结果替换(评分口径见 `ai-engine-api-spike.md` §4.4)。
 */
export const TONE_KEYS_BY_SKIN_TONE: Record<SkinTone, readonly ToneKey[]> = {
  light: ['rose', 'coral', 'peach', 'nude'],
  light_medium: ['rose', 'coral', 'peach', 'nude', 'berry'],
  medium: ['rose', 'coral', 'berry', 'brick', 'nude', 'plum'],
  tan: ['berry', 'brick', 'plum', 'coral'],
  deep: ['berry', 'brick', 'plum'],
};

const SKIN_TONE_CN: Record<SkinTone, string> = {
  light: '浅',
  light_medium: '浅中',
  medium: '中',
  tan: '小麦',
  deep: '深',
};

/**
 * 把一个 zod issue 说成中文,并在取值类错误里**带上合法选项**。
 * 用 `issue.options`(zod 在 `invalid_enum_value` 上直接给)而不是自己维护路径 → 选项表,
 * 免得枚举一改这里就跟着漂。
 */
function describeIssue(issue: z.ZodIssue): string {
  const at = issue.path.join('.') || '请求';
  if (issue.code === 'invalid_enum_value') {
    return `${at} 取值「${String(issue.received)}」不合法;可用:${issue.options.join(' / ')}`;
  }
  if (issue.code === 'unrecognized_keys') {
    return `${at} 出现不认识的字段:${issue.keys.join(' / ')}`;
  }
  return `${at}:${issue.message}`;
}

function fail(reason: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, `妆面单不合法:${reason}`);
}

/**
 * 校验并清洗一份妆面单。
 *
 * @param raw      待校验的原始值(通常直接来自 LLM 的工具入参,形状不可信)。
 * @param opts.skinTone 已知的肤色。**给了才收窄**——没给时不做肤色限制,
 *   因为「不知道肤色」和「知道了但违反了」是两回事:前者该让对话继续问,后者才该打回。
 */
export function validateLookSpec(raw: unknown, opts: { skinTone?: SkinTone } = {}): LookSpec {
  // ① 形状
  const parsed = lookSpecSchema.safeParse(raw);
  if (!parsed.success) {
    fail(parsed.error.issues.map(describeIssue).join(';'));
  }
  const spec = parsed.data as LookSpec;

  // ② 肤色收窄(§6 规矩 4)——只有知道了肤色才谈得上"违反"
  const skinTone = opts.skinTone;
  if (skinTone) {
    const allowed = TONE_KEYS_BY_SKIN_TONE[skinTone];
    const violations: string[] = [];
    for (const role of ZONE_ROLES) {
      const tone = spec.zones[role].tone;
      if (!allowed.includes(tone)) {
        violations.push(`${role} 的 tone「${tone}」`);
      }
    }
    if (violations.length > 0) {
      fail(
        `${violations.join('、')}不在肤色「${SKIN_TONE_CN[skinTone]}」的可用色域内;` +
          `该肤色可用:${allowed.join(' / ')}。` +
          `请改选其中之一,或先确认肤色是否填错了。`,
      );
    }
  }

  return spec;
}
