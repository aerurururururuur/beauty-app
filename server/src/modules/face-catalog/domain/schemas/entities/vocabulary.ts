/**
 * domain/schemas/entities/vocabulary.ts —— 面部词表两个 JSON 文件的形状(zod 单源)。
 *
 * ★ `schema` 与 `validator` 分工照 `products` / `cabinet` 的先例:**这里只描述形状**,
 *   "读文件 → 校验 → 抛一句人看得懂的话"在 `domain/validators/` 里。
 *
 * ★ §4.2:留在这里的只有**类型、必填/非空(`min(1)`)、`.strict()`、联合判别键**。
 *   枚举白名单(`TONE_KEYS` / `GEOMETRY_SLOTS`)、色值格式、`order` 的取值界
 *   都是**业务规则**,搬去了 `domain/validators/vocabulary.validator.ts`——
 *   那边本来就在做「档位 id 与代码对账」「死色」这类跨条目检查,现在取值检查也归它,
 *   坏词表的**全部**拒收理由在同一处说得清。
 *
 * ★ 用 `.strict()`:多一个不认识的键就是**有人改了词表而代码没跟上**,
 *   那种事要在启动时炸,不要静默吞掉。少一个键同理。
 *
 * ⚠️ 抛的是普通 `Error`(启动即失败),不是 `AppError`——词表坏了和请求坏了不是一类事。
 *   实际抛错在 validator 里,这里只给形状。
 */
import { z } from 'zod';

/**
 * 一个特征取值在提示词里的去向。
 * `kind` 是**联合判别键**(形状);`slot` 的合法取值(必须是 `shared` 的 `GEOMETRY_SLOTS` 之一——
 * **目录不许发明新槽位**)在 validator 里查。
 */
const routeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('geometry'), slot: z.string() }).strict(),
  z.object({ kind: z.literal('advisory') }).strict(),
]);

/**
 * ★ **导出**是为了给实体与对表测试用(`.shape`)。
 *   实体把字段从这个类型上切下来(§4.1),不重抄一份 ——
 *   两处清单靠 `test/face-catalog.test.ts` 的对表钉着。
 *   ⚠️ 它是**文件的形状**(宽 Raw:`toneKeys` 是 `string[]`),不是收窄后的实体类型;
 *   收窄(每色 ∈ `TONE_KEYS`)在 `domain/validators/vocabulary.validator.ts`(§4.2)。
 */
export const toneTierSchema = z
  .object({
    /** 档位 id。`brief.skinTone` 存的就是它,也是识别结果白名单里的值。 */
    id: z.string().min(1),
    /** 中文档名,直接上界面。 */
    label: z.string().min(1),
    /** 浅 → 深的次序。**从 1 起**那条在 validator 里(与"不重复"作伴)。 */
    order: z.number().int(),
    /** 缺省档。全表恰好一条为 `true`,且它的 `order` 不得是最小值 —— 都在 validator 里查。 */
    isDefault: z.boolean(),
    /** ★ 色域。非空(`min(1)`);每个值必须是 `shared` 的 `TONE_KEYS` 之一 —— 在 validator 里查。 */
    toneKeys: z.array(z.string()).min(1),
    /** 界面色卡色值,如 `#d9c79e`。`#rrggbb` 那个格式在 validator 里。 */
    swatch: z.string().optional(),
  })
  .strict();

export const skinToneFileSchema = z
  .object({
    version: z.string().min(1),
    note: z.string().optional(),
    /** 必须原样展示给用户,不许改写。 */
    disclaimer: z.string().min(1),
    tones: z.array(toneTierSchema).min(1),
  })
  .strict();

/** ★ 导出理由同 `toneTierSchema`。收窄(`route.slot` ∈ `GEOMETRY_SLOTS`)在 validator 里。 */
export const featureValueSchema = z
  .object({
    /** 取值 id。存进 `brief.features` 的是它。 */
    id: z.string().min(1),
    /** 中文名,直接上界面。 */
    label: z.string().min(1),
    /** 这个取值在图像提示词里的去向。`advisory` = 只给用户建议,一个字都不进出图文案。 */
    route: routeSchema,
  })
  .strict();

/** ★ 导出理由同 `toneTierSchema`。 */
export const dimensionSchema = z
  .object({
    /** 类 id,如 `eye_shape`。 */
    id: z.string().min(1),
    /** 中文类名,如「眼型」。 */
    label: z.string().min(1),
    /** 这类「决定什么策略」。owner 原文,当界面提示文案用。 */
    strategy: z.string().min(1),
    /** 可多选为 `true`。 */
    multi: z.boolean(),
    values: z.array(featureValueSchema).min(1),
  })
  .strict();

export const featureFileSchema = z
  .object({
    version: z.string().min(1),
    note: z.string().optional(),
    dimensions: z.array(dimensionSchema).min(1),
  })
  .strict();

/** 三个子形状的输出类型。★ 实体从它们切字段(`Omit` 掉要收窄的那一格)。 */
export type ToneTierRow = z.output<typeof toneTierSchema>;
export type FeatureValueRow = z.output<typeof featureValueSchema>;
export type DimensionRow = z.output<typeof dimensionSchema>;
