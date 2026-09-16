/**
 * agent/domain/schemas/agent-http.ts —— HTTP 入参的「形状」(zod,**无行为**)。
 *
 * 只声明结构;「会话不存在」「不是你的会话」「正文是空白」这类判断在用例里,
 * 用语义错误码表达(`schema ≠ validator` 的既有分工)。
 */
import { z } from 'zod';

/**
 * 单条用户消息上限(字)。
 * 比 `jobs` 的 `MAX_SCENE_TEXT`(2000)小一个量级:那是**一次性把需求写完**的输入框,
 * 这是**对话里的一句话**。留 1000 已经远超正常一句话,同时挡住"贴一整篇需求文档进来"
 * 这种会把上下文预算一次烧掉的行为。
 */
export const MAX_AGENT_TEXT = 1000;

/**
 * 「只有 `userId`」的请求体。
 * ★ 开会话、确认出图这两条路由的入参**逐字相同**,所以由同一个 schema 派生——
 * 不是省事:两份写在一起的东西迟早会只改一份。
 */
const userIdOnlySchema = z
  .object({
    /** 归属用户,客户端显式传(无登录态,红线 §13-5 不变)。 */
    userId: z.string().min(1, '缺少 userId'),
  })
  .strict();

/** 开一个会话。 */
export const startSessionSchema = userIdOnlySchema;

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
    text: z.string().min(1, '消息不能为空').max(MAX_AGENT_TEXT, `消息最多 ${MAX_AGENT_TEXT} 字`),
  })
  .strict();

export type StartSessionRaw = z.output<typeof startSessionSchema>;
export type SendMessageRaw = z.output<typeof sendMessageSchema>;
export type ConfirmRenderRaw = z.output<typeof confirmRenderSchema>;
