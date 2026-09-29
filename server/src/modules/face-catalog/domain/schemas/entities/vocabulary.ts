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

const toneTierSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** 浅 → 深的次序。**从 1 起**那条在 validator 里(与"不重复"作伴)。 */
    order: z.number().int(),
    isDefault: z.boolean(),
    /** ★ 色域。非空(`min(1)`);每个值必须是 `shared` 的 `TONE_KEYS` 之一 —— 在 validator 里查。 */
    toneKeys: z.array(z.string()).min(1),
    /** 界面色卡色值。`#rrggbb` 那个格式在 validator 里。 */
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

const featureValueSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    route: routeSchema,
  })
  .strict();

const dimensionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** 这类「决定什么策略」。owner 原文,当界面提示文案用。 */
    strategy: z.string().min(1),
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
