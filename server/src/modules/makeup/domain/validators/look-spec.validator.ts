/**
 * makeup/domain/validators/look-spec.validator.ts —— 逐字段的取值规则(§4.2)。
 *
 * 形状在 `schemas/contracts/look-spec.ts`;这里管形状表达不了的三件事:
 *   ① 取值合法(枚举白名单 / 数值区间 / 长度)—— schema 里一律是宽泛的 `string` / `number`;
 *      ⚠️ `occasion` 是**唯一的例外:自由文本,只判长度**(见 `readOccasion`);
 *   ② 形状错误的中文化;
 *   ③ ★ §6 规矩 4:合法取值空间**按 `skinTone` 收窄**。
 *
 * ★ **本文件是两个入口,不是两个规则集**(2026-09-29 加第二个):
 *   `validateLookSpec`(妆面单,来自 `propose_look` 入参)与
 *   `validateStyleRead`(风格图读数,来自视觉模型,见 `entities/style-read.ts`)。
 *   两者逐条规则相同,共用下面那批 `read*` 助手 —— 分家就得把 `TONE_KEYS` / `FINISHES` /
 *   区间写成第二份,而它们不会一起改(§4.1 的同一条道理,只是从类型换成了规则)。
 *
 * ✏️ **2026-10-01:妆面单多了六个可选区,于是多了一条「与配方的区集合相等」的检查**
 *   (②c,入参 `requiredZones`)。它**不在**上面那三件事里 —— 它既不是形状也不是取值,
 *   而是"这份妆面单配不配得上所选的那套配方"。判据由调用方算好传进来:
 *   本模块不认识配方,也不许认识(§7.1)。
 *
 * ★ **错误消息是写给 LLM 看的 prompt,不是给人看的日志。** §7.3 第 4 条:工具错误
 *   不抛穿循环,`propose_look` 把这里的消息**原样回填成 observation**,模型据此改。
 *   所以每条都必须带上「可用:…」清单 —— 只说「不合法」,模型只能瞎猜,那是循环空转的典型成因。
 *   清单不借 zod 的 `issue.options` 说(schema 变松后那条路没了),而是在每个 `read*`
 *   调用点上就地给元组:取值检查和它的文案写在同一行,不会一处改了另一处还是旧清单。
 *   元组本身只有一份(在 `entities/look-spec.ts`),这里只消费。
 *   ⚠️ 唯一的例外是 `occasion`:它**没有清单可给**,因为它不是闭集(见 `readOccasion`)。
 *
 * 失败抛 `AppError(VALIDATION_ERROR)`。**刻意不新增错误码**:这条路径由 agent 循环
 * 消化成 observation,**不会**走到 HTTP,不需要在 `error-handler.ts` 里多一格映射。
 */
import { MAX_OCCASION } from '../../../shared/index.js';
import type { SkinTone } from '../../../shared/index.js';
import {
  ADDED_ZONE_ROLES,
  BROW_SHAPES,
  BrowSpec,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  LookSpec,
  LookSpecBase,
  TONE_KEYS,
  WARMTH_MAX,
  WARMTH_MIN,
  ZONE_ROLES,
  ZoneSpec,
} from '../entities/look-spec.js';
import type { Intensity, ZoneRole } from '../entities/look-spec.js';
import { StyleRead } from '../entities/style-read.js';
import type { SkinTonePalette } from '../ports/skin-tone-palette.js';
import { lookSpecSchema, styleReadSchema } from '../schemas/index.js';
import { describeIssue, fail } from '../errors/validation-errors.js';

// ⚠️ 那张 `TONE_KEYS_BY_SKIN_TONE` 已经不在这里了 —— 它连同 `SKIN_TONE_CN` 一起
//    变成了**词表目录里的内容**(`assests/face-catalog/skin-tones.json` 的 `toneKeys` /
//    `label`),从 `SkinTonePalette` 端口查进来。见该端口的文件头:
//    **这层间接是必须的,不是过度设计** —— 档位表可配置的代价就是它得被查,不能被 import。
//    那张表本身仍然是 **PLACEHOLDER**(§15.1 枚举取值「一个都没定」、§14.1 颜色安全区实测 n=1),
//    接线前必须用实测结果替换词表里的 `toneKeys`。

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

/**
 * 场合:**自由文本,只判长度**。
 *
 * ★ 它**不是闭集**——预设场合表(`shared` 的 `OCCASIONS`)之外也能说「朋友的婚礼」,
 *   那正是这次松绑的目的。所以这里**刻意不用 `readEnum`**:把用户的话硬收进最近的
 *   那一格,正是本仓头号 bug 的形状(结果悄悄是错的,别处一切正常)。
 */
function readOccasion(reading: Reading, at: string, value: string): string | undefined {
  if (value.length > MAX_OCCASION) {
    reading.problems.push(`${at} 最多 ${MAX_OCCASION} 字(收到 ${value.length} 字)`);
    return undefined;
  }
  return value.trim() || undefined;
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

/**
 * 一个**可选**区(✏️ 2026-10-01 的六个新区)。
 *
 * ★ **「没填」是合法的,不打分**:该不该有它由 ②c 对着配方判,那里能说出"哪一步"。
 *   这里只把**填了但填错**的说出来(`readZone` 已经有那块逻辑)。
 */
function readOptionalZone(
  reading: Reading,
  role: ZoneRole,
  raw: { tone: string; finish: string; intensity: number } | undefined,
): ZoneSpec | undefined {
  return raw === undefined ? undefined : readZone(reading, `zones.${role}`, raw);
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
  return new ZoneSpec({ tone, finish, intensity });
}

/**
 * ★ **本套配方该有哪些区。**
 *
 * 由调用方(唯一认识「配方步骤名」与「妆面单区名」两侧的 `agent`)算好传进来 ——
 * 本模块既不 import `styling` 也不认识步骤名(§7.1)。`stepName` 只用来把报错写成
 * 模型改得动的那句话(「这套配方有「眼线」这一步」)。
 */
export interface RequiredZone {
  readonly role: ZoneRole;
  readonly stepName: string;
}

/**
 * 校验并清洗一份妆面单。
 *
 * @param raw      待校验的原始值(通常直接来自 LLM 的工具入参,形状不可信)。
 * @param opts.skinTone 已知的肤色。**给了才收窄**——没给时不做肤色限制,
 *   因为「不知道肤色」和「知道了但违反了」是两回事:前者该让对话继续问,后者才该打回。
 * @param opts.palette  词表端口。**必填**:不给就没法按肤色收窄,
 *   而"悄悄不收窄"正是本仓库的头号 bug 类型(见该端口的文件头)。
 * @param opts.requiredZones ★ **本套配方该有的区**(✏️ 2026-10-01)。**必填**:
 *   不给就等于"妆面单与配方对不对得上"这条整条不查,而妆面里多填一个区
 *   **会真的画到图上**——方案里没有眼线、成片里有,正是本仓最恨的形状。
 */
export function validateLookSpec(
  raw: unknown,
  opts: { skinTone?: SkinTone; palette: SkinTonePalette; requiredZones: readonly RequiredZone[] },
): LookSpec {
  // ① 形状(类型、`.strict()`;取值一条都没查)
  const parsed = lookSpecSchema.safeParse(raw);
  if (!parsed.success) {
    fail('妆面单', parsed.error.issues.map(describeIssue).join(';'));
  }
  const shape = parsed.data;

  // ② 取值(§4.2:枚举白名单与数值区间在这里)。**一次说全**,不中途返回——
  //    模型收到一条完整的清单只需重试一次,收到一条改一条会白烧好几轮。
  const reading: Reading = { problems: [] };
  const occasion = readOccasion(reading, 'occasion', shape.occasion);
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
    fail('妆面单', reading.problems.join(';'));
  }

  // ②b 六个**可选**区(✏️ 2026-10-01):没填就是 `undefined`,那是合法的
  //     ——「该不该有它」由下面 ②c 对着配方判,不在这里判。
  //     ⚠️ 每一格的键名必须与 schema 的字段名**逐字相同**,所以这里逐格写出来。
  const concealer = readOptionalZone(reading, 'concealer', shape.zones.concealer);
  const contour = readOptionalZone(reading, 'contour', shape.zones.contour);
  const highlight = readOptionalZone(reading, 'highlight', shape.zones.highlight);
  const aegyoSal = readOptionalZone(reading, 'aegyoSal', shape.zones.aegyoSal);
  const liner = readOptionalZone(reading, 'liner', shape.zones.liner);
  const lash = readOptionalZone(reading, 'lash', shape.zones.lash);

  // ②c ★ **妆面单与所选配方的区必须集合相等。**
  //    少了 ⇒ 那一步没有图(`/result` 上摆着一个点下去出不来图的步骤);
  //    多了 ⇒ 提示词里会画出一套**方案里根本没有的妆**(用户拿方案理解成片,而两者不是一套)。
  //    两个方向都把「哪一步 / 哪个区」写出来——模型收到一条就能改对,不用猜。
  const present = new Set<ZoneRole>(
    (
      [
        ['lip', lip],
        ['cheek', cheek],
        ['eyeshadow', eyeshadow],
        ['concealer', concealer],
        ['contour', contour],
        ['highlight', highlight],
        ['aegyoSal', aegyoSal],
        ['liner', liner],
        ['lash', lash],
      ] as const
    )
      .filter(([, zone]) => zone !== undefined)
      .map(([role]) => role),
  );
  const required = new Map(opts.requiredZones.map((z) => [z.role, z.stepName] as const));
  const missing = [...required].filter(([role]) => !present.has(role));
  // ⚠️ **"多出"只查新增的那六个区**(✏️ 2026-10-01 实测后收窄)。`MEASURED_ZONE_ROLES`
  //   那三个在 `lookSpecSchema` 里是**必填**,每份妆面单都必然有它们;而
  //   `flowers`(底妆/眼妆/唇妆/定妆)**根本没有腮红那一步**、`newchinese` 也没有眼影那一步
  //   ——21 套里 2 套的配方步骤覆盖不到那三个区的全部。那是**本次改动之前就存在的**形状,
  //   在这里打回等于:① 让这 2 套配方从此配不出任何妆面;② 顺手改掉它们的成片(那三句
  //   提示词一直是渲染的,少一个区 = 换一张付费图)。两件都不是这次要做的事。
  //   ★ 收窄不会放走这次防的那件事:新加的六个区**没有一个是必填的**,它们多出来
  //   一定是模型自己填的 ⇒ 照样打回。
  const extra = ADDED_ZONE_ROLES.filter((role) => present.has(role) && !required.has(role));
  if (missing.length > 0 || extra.length > 0) {
    const said: string[] = [];
    if (missing.length > 0) {
      said.push(
        `缺 ${missing.map(([role, step]) => `${role}(这套配方里有「${step}」这一步)`).join('、')}`,
      );
    }
    if (extra.length > 0) {
      said.push(`多出 ${extra.join('、')}(这套配方的步骤里没有这个部位)`);
    }
    fail(
      '妆面单',
      `zones 与所选配方的步骤对不上:${said.join(';')}。` +
        `请按那套配方里**真实存在**的部位逐区填,不多填也不漏填。`,
    );
  }

  // ★ §6:逐项显式列字段,**不许对象展开** —— 展开会把"少写一个字段"变成"它恰好没传"。
  //   ⚠️ 下面传的是**对象实参,但那不是展开**:每一格都按 `schemas/contracts/look-spec.ts`
  //   的字段名逐字写出来,少写一格 TS 当场报错(missing property)。被禁的只有 `{ ...shape }`
  //   —— 那样 schema 哪天少给一格,这里就静默变成"它恰好没传",而形状层那边 `.strict()`
  //   什么都不缺,没人会红。
  //   走到这里每一项都已收窄成具体类型(不是 `as LookSpec` 那种断言出来的)。
  //   ⚠️ 没填的可选区**整个键都不出现**(不是填一个 `undefined`):妆面单是**过 HTTP 给前端**的,
  //     而 `describeLook` / 引擎都按"键在不在"读它。
  const spec = new LookSpec({
    occasion,
    base: new LookSpecBase({ coverage: baseCoverage, finish: baseFinish, warmth: baseWarmth }),
    zones: {
      lip,
      cheek,
      eyeshadow,
      brow: new BrowSpec({ shape: browShape, intensity: browIntensity }),
      ...(concealer ? { concealer } : {}),
      ...(contour ? { contour } : {}),
      ...(highlight ? { highlight } : {}),
      ...(aegyoSal ? { aegyoSal } : {}),
      ...(liner ? { liner } : {}),
      ...(lash ? { lash } : {}),
    },
  });

  // ③ 肤色收窄(§6 规矩 4)——只有知道了肤色才谈得上"违反"
  const { skinTone, palette } = opts;
  if (skinTone) {
    const allowed = palette.toneKeysFor(skinTone);
    if (!allowed) {
      // 代码里有这一档、词表里没有。启动校验本该拦住它(见 face-catalog 的 validator),
      // 真走到这里说明有人绕过了启动校验 —— 直说,不要静默放过。
      fail('妆面单', `肤色「${skinTone}」在词表里查不到,无法判断可用色域。`);
    }
    const violations: string[] = [];
    for (const role of ZONE_ROLES) {
      // ★ 本套配方没有这一步 ⇒ 妆面单里也没有这个区,没有色相要查。
      //   ⚠️ 漏掉这句判断会让可选区在 `spec.zones[role]` 上炸 —— 更要紧的是
      //   `ZONE_ROLES` 那 9 个必须**一个不漏**地进这张循环,漏一个就等于那个区的
      //   色号静默绕过肤色可用色域(§6 规矩 4 失效,而界面上看不出来)。
      const zone = spec.zones[role];
      if (!zone) continue;
      if (!allowed.includes(zone.tone)) {
        violations.push(`${role} 的 tone「${zone.tone}」`);
      }
    }
    if (violations.length > 0) {
      fail(
        '妆面单',
        `${violations.join('、')}不在肤色「${palette.labelOf(skinTone) ?? skinTone}」的可用色域内;` +
          `该肤色可用:${allowed.join(' / ')}。` +
          `请改选其中之一,或先确认肤色是否填错了。`,
      );
    }
  }

  return spec;
}

/**
 * 校验并清洗一份**风格参考图读数**(见 `entities/style-read.ts`)。
 *
 * 与 `validateLookSpec` 的三处不同,都是刻意的:
 * ① **没有 `opts`**(不需要 palette,理由见 ③);
 * ② **没有 `occasion` / `zones.brow`** —— 两份形状的差集,理由写在实体那头;
 * ③ ★★ **不做 §6 规矩 4 的「按肤色收窄」。** 那条约束的是**抹到用户脸上的颜色**,
 *    而这里读的是**别人那张参考图长什么样**。拿用户肤色去收窄它只有两种结果:
 *    要么把读数改成图里并不存在的颜色(撒谎),要么因为用户改不了的原因把整次分析判死。
 *    真越界了:模型据此填 `LookSpec`,`validateLookSpec` 会当场拒掉并列出「该肤色可用:…」。
 *
 * ⚠️ 同 `validateLookSpec`:一次说全,不中途返回。
 */
export function validateStyleRead(raw: unknown): StyleRead {
  // ① 形状(类型、`.strict()`;取值一条都没查)
  const parsed = styleReadSchema.safeParse(raw);
  if (!parsed.success) {
    fail('风格图读数', parsed.error.issues.map(describeIssue).join(';'));
  }
  const shape = parsed.data;

  // ② 取值。与 `validateLookSpec` **共用同一批助手与同一批元组**(见文件头)。
  const reading: Reading = { problems: [] };
  const baseCoverage = readIntensity(reading, 'base.coverage', shape.base.coverage);
  const baseFinish = readEnum(reading, 'base.finish', shape.base.finish, FINISHES);
  const baseWarmth = readWarmth(reading, 'base.warmth', shape.base.warmth);
  const lip = readZone(reading, 'zones.lip', shape.zones.lip);
  const cheek = readZone(reading, 'zones.cheek', shape.zones.cheek);
  const eyeshadow = readZone(reading, 'zones.eyeshadow', shape.zones.eyeshadow);

  if (
    baseCoverage === undefined ||
    baseFinish === undefined ||
    baseWarmth === undefined ||
    lip === undefined ||
    cheek === undefined ||
    eyeshadow === undefined
  ) {
    fail('风格图读数', reading.problems.join(';'));
  }

  // ★ 逐字段显式列出来,不用对象展开(同上:对象实参里少写一格编译器会红,
  //   而 `{ ...shape }` 会把它变成"它恰好没传")。走到这里每一项都已收窄成具体类型。
  return new StyleRead({
    base: new LookSpecBase({ coverage: baseCoverage, finish: baseFinish, warmth: baseWarmth }),
    zones: { lip, cheek, eyeshadow },
  });
}
