/**
 * agent/domain/schemas/entities/message.ts —— 内部消息模型的形状(zod 单源)。
 *
 * 实体在 `../../entities/message.ts`,那边**一个字段都不声明**:类只做
 * `Object.assign(this, row)` + 声明合并,所以"schema 加了字段而实体没跟上"**不可能发生**。
 *
 * ── ★ 为什么这四个要加品牌(`.brand<>()`)────────────────────────────────────
 * 块协议有两条硬不变量(违反就是下一轮 400):每个 `tool_use` 必须配一个 `tool_result`;
 * 同一轮的多个结果必须装在**同一条** user 消息里。那两条由 `toolResults` 在结构上保证
 * (它是唯一入口),而"块只能由本文件的构造器产出"这条**曾经是一条注释** ——
 * 普通对象字面量长得一样,谁都能拿它当 `TextBlock` 传进来。
 *
 * 品牌的用处就是把那句话变成编译期事实:实例类型带上一个只存在于类型里的标记,
 * 字面量进不来。用 zod 自己的能力(§7.4),不手写 `& { readonly __brand: … }`。
 *
 * ★ **构造参数收的是未加品牌的 `XRow`**,所以调用点照旧写字面量:
 *   `new TextBlock({ type: 'text', text: '你好' })`。品牌只挂在**实例**那一侧。
 *
 * ⚠️ 这里没有解析入口 —— 消息与块都是本进程**自己造出来**的(线上响应由 adapter 翻译,
 *   不落盘、不从文件读)。所以本文件只描述形状,**不含取值规则**(§4.2):
 *   `role` 那三个词不是"白名单",是形状的判别键 —— adapter 靠它决定往哪一支翻译。
 */
import { z } from 'zod';

/** 一个文本块。 */
const textBlockRowSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .strict();

export const textBlockSchema = textBlockRowSchema.brand<'TextBlock'>();
export type TextBlockRow = z.output<typeof textBlockRowSchema>;
export type TextBlockShape = z.output<typeof textBlockSchema>;

/** 一次工具调用。`input` 是**已解析**的对象(adapter 负责把 JSON 字符串解析掉)。 */
const toolUseBlockRowSchema = z
  .object({
    type: z.literal('tool_use'),
    /** 供应方给的调用 id;回填结果时必须原样带上。 */
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  })
  .strict();

export const toolUseBlockSchema = toolUseBlockRowSchema.brand<'ToolUseBlock'>();
export type ToolUseBlockRow = z.output<typeof toolUseBlockRowSchema>;
export type ToolUseBlockShape = z.output<typeof toolUseBlockSchema>;

/** 一次工具结果。`isError` 为真时模型会看到这是失败并自行改路(§7.3 第 4 条)。 */
const toolResultBlockRowSchema = z
  .object({
    type: z.literal('tool_result'),
    /** 对应 `ToolUseBlock.id`。**必须精确匹配**,不匹配模型就看不到结果。 */
    toolUseId: z.string(),
    content: z.string(),
    /** 可选:缺省时**这个键不存在**(见实体那边构造函数里那行 `delete`)。 */
    isError: z.boolean().optional(),
  })
  .strict();

export const toolResultBlockSchema = toolResultBlockRowSchema.brand<'ToolResultBlock'>();
export type ToolResultBlockRow = z.output<typeof toolResultBlockRowSchema>;
export type ToolResultBlockShape = z.output<typeof toolResultBlockSchema>;

/** 一条消息能装的东西。★ 判别键是 `type`,与线上两支的块式一致。 */
const contentBlockSchema = z.union([textBlockSchema, toolUseBlockSchema, toolResultBlockSchema]);

/**
 * 会话里的一条消息。
 *
 * `system` 是独立角色而不是塞进第一条 user:线上两种传法(顶层 `system` 参数、
 * 或一条 `role:'system'` 消息)都能从这一个字段翻译过去,放在这里是为了让
 * adapter 一眼能挑出来往对应位置翻译。
 */
const messageRowSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.array(contentBlockSchema),
  })
  .strict();

export const messageSchema = messageRowSchema.brand<'Message'>();
export type MessageRow = z.output<typeof messageRowSchema>;
export type MessageShape = z.output<typeof messageSchema>;
