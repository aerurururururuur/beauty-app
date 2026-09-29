/**
 * makeup/domain/validators/look-spec.validator.ts —— `LookSpec` 的校验**行为**。
 *
 * 分工:`schemas/contracts/look-spec.ts` 只声明形状;这里执行形状表达不了的三件事:
 *   ① 取值本身合法(枚举白名单 / 数值区间 / 格式)—— **§4.2:这些是业务规则,不在 schema 里**;
 *   ② 清洗与形状错误的中文化;
 *   ③ ★ §6 规矩 4:**合法取值空间按 `skinTone` 收窄**——「不是生成完再检查」。
 *
 * ★ **错误消息是写给 LLM 看的 prompt,不是给人看的日志。**
 *   `propose_look` 工具把这里抛出的消息**原样回填成 observation**给模型(§7.3 第 4 条:
 *   工具错误不抛穿循环),模型据此决定怎么改。所以每条消息都必须**带上合法取值清单**——
 *   只说「不合法」而不说「可用哪些」,模型只能瞎猜,这正是 agent 循环空转的常见成因。
 *   (§7.3 第 3 条说「工具描述是给模型看的 prompt」,同一条道理适用于工具的错误输出。)
 *
 * ★ **那些「可用:…」清单不再借 zod 的 `issue.options` 说**(2026-09-29,§4.2 之后)。
 *   从前靠 `z.enum` 留在 schema 里、再把 zod 的 `invalid_enum_value` 翻成中文;schema 变松之后
 *   那条路没有了。现在**每个字段在下面各自声明自己的元组**——看着是重复,其实不是:
 *   `z.enum(TONE_KEYS)` 也要写一次 `TONE_KEYS`,区别只是**写在哪一侧**。
 *   写在规则这一侧的好处是**取值检查和它的文案在同一行**,不会一处改了另一处还是旧清单。
 *   元组本身仍然只有一份(在 `entities/look-spec.ts`,由 `shared` 再导出),
 *   这里只消费,不复制。
 *
 * 失败抛 `AppError(VALIDATION_ERROR)`。**刻意不新增错误码**:
 * 这条路径的失败由 agent 循环消化成 observation,**不会**走到 HTTP,
 * 因此不需要在 `shared/presentation/error-handler.ts` 里多一格映射。
 */
import type { z } from 'zod';
import { AppError, ErrorCode, OCCASIONS } from '../../../shared/index.js';
import type { SkinTone, ToneKey } from '../../../shared/index.js';
import {
  BROW_SHAPES,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  TONE_KEYS,
  WARMTH_MAX,
  WARMTH_MIN,
  ZONE_ROLES,
} from '../entities/look-spec.js';
import type { Finish, Intensity, LookSpec, ZoneSpec } from '../entities/look-spec.js';
import type { SkinTonePalette } from '../ports/skin-tone-palette.js';
import { lookSpecSchema } from '../schemas/index.js';

// ⚠️ 那张 `TONE_KEYS_BY_SKIN_TONE` 已经不在这里了 —— 它连同 `SKIN_TONE_CN` 一起
//    变成了**词表目录里的内容**(`assests/face-catalog/skin-tones.json` 的 `toneKeys` /
//    `label`),从 `SkinTonePalette` 端口查进来。见该端口的文件头:
//    **这层间接是必须的,不是过度设计** —— 档位表可配置的代价就是它得被查,不能被 import。
//    那张表本身仍然是 **PLACEHOLDER**(§15.1 枚举取值「一个都没定」、§14.1 颜色安全区实测 n=1),
//    接线前必须用实测结果替换词表里的 `toneKeys`。

/**
 * 把一个 zod issue 说成中文。
 *
 * ★ `invalid_enum_value` 那一支**没了**:枚举白名单已按 §4.2 搬出 schema,
 *   zod 再也不会给出这个 code。取值类错误现在由下面几个 `read*` 直接说全(带清单)。
 *   留下的两支是**形状层**的错误——多一个键、类型不对,那些**仍然**归 zod。
 */
function describeIssue(issue: z.ZodIssue): string {
  const at = issue.path.join('.') || '请求';
  if (issue.code === 'unrecognized_keys') {
    return `${at} 出现不认识的字段:${issue.keys.join(' / ')}`;
  }
  return `${at}:${issue.message}`;
}

function fail(reason: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, `妆面单不合法:${reason}`);
}

/** 取值是否属于某个编译期元组。type predicate:收窄是真的,不写 `as`。 */
function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

/**
 * 浓度:整数且落在 `INTENSITY_MIN..INTENSITY_MAX`。
 *
 * ⚠️ `Intensity` 的类型是 `1|2|3|4|5` 这个**字面量联合**,而这里是**区间**检查 ——
 *   两者必须同界。不同界时失败方向是安全的:改小了 `INTENSITY_MAX`,合法值会被拒,
 *   测试立刻红;不存在"放过一个越界值"的那种静默。
 */
function isIntensity(value: number): value is Intensity {
  return Number.isInteger(value) && value >= INTENSITY_MIN && value <= INTENSITY_MAX;
}

/** 逐字段读出来的结果集;每一项缺失都**已经**在 `problems` 里留了一句话。 */
interface Reading {
  problems: string[];
}

function readEnum<T extends string>(
  reading: Reading,
  at: string,
  value: string,
  allowed: readonly T[],
): T | undefined {
  if (isOneOf(value, allowed)) return value;
  reading.problems.push(`${at} 取值「${value}」不合法;可用:${allowed.join(' / ')}`);
  return undefined;
}

function readIntensity(reading: Reading, at: string, value: number): Intensity | undefined {
  if (isIntensity(value)) return value;
  reading.problems.push(`${at} 需为 ${INTENSITY_MIN}..${INTENSITY_MAX} 的整数(收到 ${value})`);
  return undefined;
}

function readWarmth(reading: Reading, at: string, value: number): number | undefined {
  if (Number.isFinite(value) && value >= WARMTH_MIN && value <= WARMTH_MAX) return value;
  reading.problems.push(`${at} 需在 ${WARMTH_MIN}..${WARMTH_MAX} 之间(收到 ${value})`);
  return undefined;
}

/** 一个「色 + 质地 + 浓度」区:三项全对才算读到。 */
function readZone(
  reading: Reading,
  at: string,
  raw: { tone: string; finish: string; intensity: number },
): ZoneSpec | undefined {
  const tone = readEnum(reading, `${at}.tone`, raw.tone, TONE_KEYS);
  const finish = readEnum(reading, `${at}.finish`, raw.finish, FINISHES);
  const intensity = readIntensity(reading, `${at}.intensity`, raw.intensity);
  if (tone === undefined || finish === undefined || intensity === undefined) return undefined;
  return { tone, finish, intensity };
}

/**
 * 校验并清洗一份妆面单。
 *
 * @param raw      待校验的原始值(通常直接来自 LLM 的工具入参,形状不可信)。
 * @param opts.skinTone 已知的肤色。**给了才收窄**——没给时不做肤色限制,
 *   因为「不知道肤色」和「知道了但违反了」是两回事:前者该让对话继续问,后者才该打回。
 * @param opts.palette  词表端口。**必填**:不给就没法按肤色收窄,
 *   而"悄悄不收窄"正是本仓库的头号 bug 类型(见该端口的文件头)。
 */
export function validateLookSpec(
  raw: unknown,
  opts: { skinTone?: SkinTone; palette: SkinTonePalette },
): LookSpec {
  // ① 形状(类型、`.strict()`;取值一条都没查)
  const parsed = lookSpecSchema.safeParse(raw);
  if (!parsed.success) {
    fail(parsed.error.issues.map(describeIssue).join(';'));
  }
  const shape = parsed.data;

  // ② 取值(§4.2:枚举白名单与数值区间在这里)。**一次说全**,不中途返回——
  //    模型收到一条完整的清单只需重试一次,收到一条改一条会白烧好几轮。
  const reading: Reading = { problems: [] };
  const occasion = readEnum(reading, 'occasion', shape.occasion, OCCASIONS);
  const baseCoverage = readIntensity(reading, 'base.coverage', shape.base.coverage);
  const baseFinish = readEnum(reading, 'base.finish', shape.base.finish, FINISHES);
  const baseWarmth = readWarmth(reading, 'base.warmth', shape.base.warmth);
  const lip = readZone(reading, 'zones.lip', shape.zones.lip);
  const cheek = readZone(reading, 'zones.cheek', shape.zones.cheek);
  const eyeshadow = readZone(reading, 'zones.eyeshadow', shape.zones.eyeshadow);
  const browShape = readEnum(reading, 'zones.brow.shape', shape.zones.brow.shape, BROW_SHAPES);
  const browIntensity = readIntensity(reading, 'zones.brow.intensity', shape.zones.brow.intensity);

  if (
    occasion === undefined ||
    baseCoverage === undefined ||
    baseFinish === undefined ||
    baseWarmth === undefined ||
    lip === undefined ||
    cheek === undefined ||
    eyeshadow === undefined ||
    browShape === undefined ||
    browIntensity === undefined
  ) {
    // 上面每一项判失败时都已经 push 了一句话,所以 problems 到这里必非空。
    fail(reading.problems.join(';'));
  }

  // ★ §6:逐字段显式赋值,不用对象展开 —— 展开会把"少写一个字段"变成"它恰好没传"。
  //   走到这里每一项都已收窄成具体类型(不是 `as LookSpec` 那种断言出来的)。
  const spec: LookSpec = {
    occasion,
    base: { coverage: baseCoverage, finish: baseFinish, warmth: baseWarmth },
    zones: {
      lip,
      cheek,
      eyeshadow,
      brow: { shape: browShape, intensity: browIntensity },
    },
  };

  // ③ 肤色收窄(§6 规矩 4)——只有知道了肤色才谈得上"违反"
  const { skinTone, palette } = opts;
  if (skinTone) {
    const allowed = palette.toneKeysFor(skinTone);
    if (!allowed) {
      // 代码里有这一档、词表里没有。启动校验本该拦住它(见 face-catalog 的 validator),
      // 真走到这里说明有人绕过了启动校验 —— 直说,不要静默放过。
      fail(`肤色「${skinTone}」在词表里查不到,无法判断可用色域。`);
    }
    const violations: string[] = [];
    for (const role of ZONE_ROLES) {
      const tone = spec.zones[role].tone;
      if (!allowed.includes(tone)) {
        violations.push(`${role} 的 tone「${tone}」`);
      }
    }
    if (violations.length > 0) {
      fail(
        `${violations.join('、')}不在肤色「${palette.labelOf(skinTone) ?? skinTone}」的可用色域内;` +
          `该肤色可用:${allowed.join(' / ')}。` +
          `请改选其中之一,或先确认肤色是否填错了。`,
      );
    }
  }

  return spec;
}
