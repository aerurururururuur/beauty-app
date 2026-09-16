/**
 * agent/domain/entities/message.ts —— ★ 供应商无关的内部消息模型。
 *
 * 这是 §7.3 第 8 条那条「各种线上形状统一到一个内部 `Message`」的落点。
 * 线上工具调用协议事实上分成两支,差别就在下面这四处:
 *   - **块式**:`content: [{type:'tool_use', id, name, input}]`,`input` 是**已解析对象**;
 *     结果回填成一条 user 消息里的 `{type:'tool_result', tool_use_id, content, is_error}`。
 *   - **平行消息式**:`message.tool_calls[]`,`function.arguments` 是
 *     **JSON 字符串**(必须自己 `JSON.parse`);结果回填成独立的 `{role:'tool', tool_call_id}` 消息。
 *
 * ★ **内部形状取「content 块」而不是「tool_calls 数组」**,理由是它是**超集**:
 *   块模型能表达「一轮里既有正文又有多个工具调用」和「工具结果带 is_error」,
 *   而 `tool_calls[]` 形状要靠 `role:'tool'` 的平行消息来拼。取超集做规范形,
 *   各 adapter 各自投影,信息不丢;反过来则要发明字段来补。
 *   ★ 注意:两支对**同一概念用了不同字段名**(`input_schema` vs `parameters`;
 *   `tool_use.id` vs `tool_calls[].id`)——所以内部用的是**中性名**(`inputSchema` /
 *   `toolUseId`),**刻意不照抄任何一支**,免得看起来像"以某家为准"。
 *
 * 两条被结构钉死的不变量(都已由实现方确认为硬约束,违反会 400):
 *   1. **每个 `tool_use` 必须配一个 `tool_result`**——漏一个就是下一轮 400。
 *   2. **同一轮的多个结果必须装在「同一条」user 消息里**——
 *      拆成多条不仅多余,还会**训练模型不再并行调用工具**。
 *      这两条由 {@link toolResults} 在结构上保证:它是唯一的构造入口。
 */

/** 一个文本块。 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** 一次工具调用。`input` 是**已解析**的对象(adapter 负责把 JSON 字符串解析掉)。 */
export interface ToolUseBlock {
  type: 'tool_use';
  /** 供应方给的调用 id;回填结果时必须原样带上。 */
  id: string;
  name: string;
  input: unknown;
}

/** 一次工具结果。`isError` 为真时模型会看到这是失败并自行改路(§7.3 第 4 条)。 */
export interface ToolResultBlock {
  type: 'tool_result';
  /** 对应 {@link ToolUseBlock.id}。**必须精确匹配**,不匹配模型就看不到结果。 */
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

/**
 * 会话里的一条消息。
 *
 * ★ **`messages[]` 是唯一状态**(§7.3 第 2 条)——不起平行状态机。
 * 理由在 `roadmap.md` §4:本仓库删掉的 `understanding` 模块就是「一个 sleep +
 * 一次转发 + 一个只能拨到 mock 的开关」那种错误形状。
 *
 * `system` 是独立角色而不是塞进第一条 user:线上两种传法(顶层 `system` 参数、
 * 或一条 `role:'system'` 消息)都能从这一个字段翻译过去,放在这里是为了让
 * adapter 一眼能挑出来往对应位置翻译。
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: ContentBlock[];
}

/** 一条纯文本消息(最常用的构造)。 */
export function textMessage(role: 'system' | 'user' | 'assistant', text: string): Message {
  return { role, content: [{ type: 'text', text }] };
}

/** assistant 那一轮的回复(正文 + 若干工具调用),**原样**存进 `messages[]`。 */
export function assistantMessage(content: ContentBlock[]): Message {
  return { role: 'assistant', content };
}

/**
 * ★ **所有工具结果合成一条 user 消息**——唯一的构造入口,不提供"一次加一个"的 API。
 * 见文件头不变量 2:拆多条会训练模型放弃并行调用。
 *
 * ★ `thenText` 是**为人在回路那条路加的**(阶段 3):用户没点确认、而是直接说了句别的时,
 *   既要还清上一轮欠的 `tool_result`(不还下一轮必 400),又要把这句新话带上。
 *   **两者必须合并进同一条 user 消息**——连发两条 `role:'user'` 是 Anthropic 那一支会 400 的形状,
 *   而本文件存在的理由正是"内部形状是两支的超集"。所以这里给同一条消息加文本块,
 *   而不是在外面再 `appendMessages` 一条。
 */
export function toolResults(results: readonly ToolResultBlock[], thenText?: string): Message {
  const content: ContentBlock[] = [...results];
  if (thenText) content.push({ type: 'text', text: thenText });
  return { role: 'user', content };
}

/** 从一条 assistant 消息里挑出全部工具调用(按出现顺序,顺序即执行顺序)。 */
export function toolUsesOf(message: Message): ToolUseBlock[] {
  return message.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
}

/** 从一条消息里拼出全部正文(用于取最终答复)。 */
export function textOf(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * ★ **会话末尾有没有「欠着 `tool_result` 的一轮」**——返回那一轮的全部调用,没有则空数组。
 *
 * 这是「人在回路确认」那条路的**状态读取器**(阶段 3)。
 * ★ **为什么不另存一个 `pending` 字段**:`messages[]` 是唯一状态(§7.3 第 2 条),
 *   而"某一轮的 `tool_use` 还没还结果"**本来就是可以从消息里读出来的事实**。
 *   存第二遍就会出现「`pending` 说有待确认,而 `messages[]` 里那轮已经还过结果了」
 *   这种自相矛盾——同 `session.ts` 里 `system` 不存第二遍的理由。
 *
 * ⚠️ **只看最后一条 assistant**:更早的 assistant 轮一定是还过结果的
 * (循环每次进下一轮之前都会先把结果追加上去),所以往前找到第一条就够。
 * 末条 assistant 只有正文、没有 `tool_use` ⇒ 正常收束,返回空。
 */
export function danglingToolUses(messages: readonly Message[]): ToolUseBlock[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role !== 'assistant') continue;
    const calls = toolUsesOf(message);
    if (calls.length === 0) return [];
    const answered = messages
      .slice(i + 1)
      .some((m) => m.content.some((b) => b.type === 'tool_result'));
    return answered ? [] : calls;
  }
  return [];
}