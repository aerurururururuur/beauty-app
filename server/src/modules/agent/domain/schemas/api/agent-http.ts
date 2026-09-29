/**
 * agent/domain/schemas/api/agent-http.ts —— HTTP 入参的「形状」(zod,**无行为**)。
 *
 * 只声明结构:**类型、必填(`min(1)` 是"非空",不是业务下限)、`.strict()`**。
 * ★ §4.2:单条消息的**长度上限**(`MAX_AGENT_TEXT`)是业务规则,搬去了
 *   `domain/validators/agent-http.validator.ts`,与它的错误文案同处一地。
 * 其余判断(「会话不存在」「不是你的会话」「正文是空白」)在用例里,用语义错误码表达。
 */
import { z } from 'zod';
import { briefFields } from '../../../../shared/index.js';

/**
 * 「只有 `userId`」的请求体。★ **确认出图专用**(开会话那条不再与它共用,见下)。
 * 它一个字都不多收——理由见 `confirmRenderSchema`。
 */
const userIdOnlySchema = z
  .object({
    /** 归属用户,客户端显式传(无登录态,红线 §13-5 不变)。 */
    userId: z.string().min(1, '缺少 userId'),
  })
  .strict();

/**
 * 天气。★ **这是本入口独有的成员。** 对话那条路的 `patch_brief` 刻意没有它
 *   (天气不是问出来的,是 `weather` 模块实拉的),所以它不进 `shared` 那份共用字段,
 *   形状与规则都归这里。⚠️ 这里只有形状;数值区间是**规则**,在 validator 里。
 */
const weatherShape = z
  .object({
    condition: z.string().optional(),
    temperatureC: z.number().optional(),
    humidityPct: z.number().optional(),
    uvIndex: z.number().optional(),
  })
  .strict();

/**
 * 开一个会话。
 *
 * ★ **可以随请求带一份初始 `brief`**——表单那条路要用:用户在表单里一次填完,
 *   不是聊出来的。**不带 brief 的调用与本条新增之前逐字相同。**
 *   简报字段从 `shared` 的 `briefFields` 展开,与 `patch_brief` 是**同一份形状**。
 *
 * ⚠️ 这是「能改变 agent 知道什么」的**第二条路**(第一条是对话里的 `patch_brief`)。
 *   它与确认出图那条路由「一个出图参数都不收」的口径**不冲突**:那条防的是
 *   「让用户确认一份他还没看过的妆面单」,而 `brief` 是**输入**,不是出图参数。
 *   **别照此为出图参数开口子。**
 */
export const startSessionSchema = z
  .object({
    userId: z.string().min(1, '缺少 userId'),
    ...briefFields,
    weather: weatherShape.optional(),
  })
  .strict();

/**
 * 出图。
 * ★ **一个出图参数都不收**——尤其不收 `LookSpec`。理由见 `definitions.ts` 的
 * `RENDER_LOOK`:能改参数就等于让用户"确认"一份他还没看过的妆面单。
 * 要出的是**他刚才在屏幕上看到的那一套**,而那一套已经在会话里了。
 *
 * ✏️ 2026-09-16:这条路由现在有**两个入口**(批准模型提的请求 / 点界面上那条
 * 「确认生成」),但入参**照样只有 `userId`** —— 两个入口要出的都是"屏幕上那一套",
 * 没有任何一个入口需要多说一个字。★ 所以那个"幂等键"的洞没有为它破例,见
 * `confirm-render.ts` 文件头的「残余空洞」。
 *
 * ✏️ 2026-09-29:开会话那条**不再与它共用这个 schema**(那条现在可以带初始 brief 了)。
 *   两条路由的入参从这天起**故意不同** —— 开会话收输入,出图只认归属人。
 *   ★ 别为了"少写一份"把它们再合并回去:那会让出图那条重新能收参数,
 *   而它一个字都不该收。
 */
export const confirmRenderSchema = userIdOnlySchema;

/**
 * 发一句话。
 * ★ **也要带 `userId`**:没有登录态就没有 token 可验,归属只能靠客户端显式声明 +
 * 服务端比对。这与 `cabinet` 的取舍一致——那边改/删也都要求带 `userId`,
 * 不符时报「找不到」而不是「无权」,不外泄"这个会话存在但不是你的"。
 */
export const sendMessageSchema = z
  .object({
    userId: z.string().min(1, '缺少 userId'),
    text: z.string().min(1, '消息不能为空'),
  })
  .strict();

/**
 * ★ **读图分析的三个 case** —— 这张接口的词汇表,也是 `POST …/analyses` 的 `kind` 闭集。
 *
 * ⚠️ 与 `makeup` 的 `AnalyzeCase`、`assets` 的 `InputKind` 是**同一批词,三处各声明一份**
 *   ——跨模块零 import 那条规矩(§7.1)的代价,`makeup` 那边同样点了名。
 *   **改名要三处一起改**;漂开了由 `test/analysis.test.ts` 的 drift 用例报出来。
 *
 * ★ 它不是 `z.enum`:取值规则归 `agent-http.validator.ts`(§4.2),这里只是"有哪几个词"。
 */
export const ANALYZE_CASES = ['face', 'scene', 'style'] as const;

/** 上传参考图收的 `kind`。★ **只有两种**——本人照片那条口已经是 `face` 了。 */
export const REF_IMAGE_KINDS = ['style', 'scene'] as const;

/**
 * 触发一次读图分析(**花钱的那一下**)。
 *
 * ★ **只收「哪一张」,不收任何分析参数**——不传提示词、不传模型、不给"强制覆盖"的开关。
 *   同 `confirmRenderSchema` 的口径:不让参数绕过服务端的规则。
 *   「用户填的优先」是**服务端的规则**,所以它不由客户端开关决定。
 */
export const analysesRequestSchema = z
  .object({
    userId: z.string().min(1, '缺少 userId'),
    /** 闭集校验在 validator(理由见 `ANALYZE_CASES`)。 */
    kind: z.string().min(1, '缺少 kind'),
  })
  .strict();

export type SendMessageRaw = z.output<typeof sendMessageSchema>;
export type ConfirmRenderRaw = z.output<typeof confirmRenderSchema>;
export type AnalysesRequestRaw = z.output<typeof analysesRequestSchema>;
