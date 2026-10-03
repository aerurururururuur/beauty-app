/**
 * domain/schemas/entities/look.ts —— 妆容档案入参的「形状/契约」(zod,无行为)。
 *
 * ★ §4.2:这里只答「这是什么结构」——是字符串 / 是数组 / `.strict()`。
 *   各格的**长度上下限**、条数上限、`seq` 是不是正整数、id 的**格式正则**都是**业务规则**,
 *   一律在 `domain/validators/look.validator.ts`,与它们的错误文案同处一地。
 *
 * ★ 这里不做动作、不写 refine/transform。
 *
 * 注:`ownerIdSchema` / `lookIdSchema` 与 cabinet、user 的是**同款正则,但各持一份**
 * (在各自的 validator 里)——模块之间不互相 import,不为了一个正则破例。
 */
import { z } from 'zod';

/** 色板上的一块。`hex` 在档案里可空(没色号的模型自配色)。 */
export const lookPaletteEntrySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    hex: z.string(),
  })
  .strict();

/** 推荐产品里的一支。★ `hex` 可空 = 这一支没有色块(整件推荐)。 */
export const lookProductSchema = z
  .object({
    pid: z.string(),
    code: z.string(),
    name: z.string(),
    hex: z.string(),
  })
  .strict();

/** 一步。`id` 是服务端按下标生成的(`natural-01`),`tips` 可能为空。 */
export const lookStepSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    desc: z.string(),
    tips: z.array(z.string()),
  })
  .strict();

/** 一条针对本人面部特征的调整建议。内容来自 face-catalog,不是模型现编的。 */
export const lookPersonalizedSchema = z
  .object({
    id: z.string(),
    group: z.string(),
    groupName: z.string(),
    name: z.string(),
    desc: z.string(),
    fix: z.string(),
    products: z.array(z.string()),
  })
  .strict();

/** 路径参数 :id 的形状。 */
export const lookIdSchema = z.string();

/** 归属用户 id 的形状(请求体 / 查询串里传)。 */
export const ownerIdSchema = z.string();

/**
 * 存一版妆容。★ 方案那几格**由前端带着提交** —— 它就是服务端会话里那份 `PlanView`
 * (前端只是把它原样带回来),不是前端自己编的。
 *
 * ⚠️ **不收 `id` / `createdAt` / `coverMime`**:那三格由服务端产生(见 `createLookSchema`)。
 *   `coverMime` 尤其不能信客户端 —— 它是发字节时的 `content-type`,由服务端从解析到的图片定。
 */
export const createLookSchema = z
  .object({
    userId: ownerIdSchema,
    sessionId: z.string(),
    seq: z.number(),
    sceneId: z.string(),
    sceneName: z.string(),
    styleId: z.string().optional(),
    styleName: z.string(),
    lookDescription: z.string(),
    summary: z.string(),
    keywords: z.array(z.string()),
    stepCount: z.number(),
    palette: z.array(lookPaletteEntrySchema),
    products: z.array(lookProductSchema),
    steps: z.array(lookStepSchema),
    personalized: z.array(lookPersonalizedSchema),
  })
  .strict();

/** 归属查询串(列表 / 删除 / 取封面共用):只认 userId 一个键。 */
export const ownerQuerySchema = z.object({ userId: ownerIdSchema }).strict();

/**
 * ★ **落盘行的形状**(`dataDir/looks/items.json` 里的一条)。
 *
 * 与 `createLookSchema` 不是一回事:入参答的是「客户端能提交什么」,这里答的是
 * 「盘上存了什么」。`id` / `createdAt` / `coverMime` 只有这里齐全 —— 仓库读出口靠它兜底(§7.2)。
 *
 * ⚠️ 这里**只有形状**:长度与条数上限、`seq` 的正负都是规则,在 validator 里。
 *   读出口不重跑那一套 —— 盘上的数据是本服务自己写下去的,拿入参规则回溯校验,
 *   只会在某天收紧一条上限后让旧数据整个读不出来。
 */
export const lookSchema = createLookSchema
  .extend({
    id: z.string(),
    coverMime: z.string(),
    createdAt: z.string(),
  })
  .strict();

/** 落盘表的形状:`{ [lookId]: LookRow }`。 */
export const lookTableSchema = z.record(z.string(), lookSchema);

export type LookPaletteEntry = z.output<typeof lookPaletteEntrySchema>;
export type LookProduct = z.output<typeof lookProductSchema>;
export type LookStep = z.output<typeof lookStepSchema>;
export type LookPersonalized = z.output<typeof lookPersonalizedSchema>;

/**
 * 一版妆容(落盘行)。
 * ★ 名字带 `Row`,是为了与领域实体 `domain/entities/look.ts` 的 `Look`(类)分开。
 *   **两者不是两份定义**:那个类的字段就是把本类型经声明合并接过去的(§4.1)。
 */
export type LookRow = z.output<typeof lookSchema>;

/** 通过形状校验的新增入参(仍需清洗,见 validator)。 */
export type CreateLookRaw = z.output<typeof createLookSchema>;
