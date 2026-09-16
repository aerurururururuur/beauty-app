/**
 * agent/domain/tools/tool.ts —— 工具的形状。
 *
 * §7.3 第 3 条:**工具 = 名字 + JSON Schema + 描述 + handler,注册表驱动。**
 * 「名字 + Schema + 描述」三者(即 `definition`)放 `domain/`,因为它是
 * **给模型看的契约**;handler 要碰 IO、要改会话,放 `application/`。
 *
 * ★ 两条设计约束落在签名里,不是靠自觉:
 *
 * 1. **工具不抛错。** `run` 的返回类型里没有"失败"这个出口,失败只能表达成
 *    `isError: true` 的 observation(§7.3 第 4 条)。实现若真抛了,
 *    由 `agent-loop` 的兜底捕获翻译——**但正常路径上不该有**。
 *    为什么这条重要:抛穿循环 = 用户看到 500,而不是一句
 *    「那张图没出来,我换个方式再试」。**生图超时、key 失效、审核拦截都会走这条。**
 * 2. **会话变更以「返回新会话」表达,不就地改。**
 *    纯函数式的副作用让 `agent-loop` 能在一次多工具轮里**按顺序**折叠变更,
 *    也让测试可以只断言"输入会话 + 工具 → 输出会话",不依赖时序。
 * 3. ★ **同一轮可能被「重放」一遍,所以每个工具都必须可重入**(阶段 3 起)。
 *    起因是 `pendingConfirmation` 那条路:一轮里只要有工具在等用户确认,
 *    **这一轮所有的 `tool_result` 都不能还**(还一半 = 下一轮 400),于是
 *    用户确认后那一轮会被**整轮重跑**一次(见 `agent-loop.ts` 的 `replay` 路径)。
 *    - 现在三个免费工具都满足:`patch_brief` / `propose_look` 是"设值"、
 *      `list_cabinet` 只读 —— 重跑一遍结果相同。
 *    - **将来加工具时这条是硬要求**:凡是有累计副作用(计数、写文件、真正扣费)的,
 *      重跑就会重复发生。那种工具得自己用 `ToolContext.confirmation` 或幂等键去防。
 */
import type { LlmToolDefinition } from '../ports/llm.js';
import type { Session } from '../entities/session.js';

/** 工具执行时能看到的东西。**只有会话**——其它依赖由工具自己在构造时闭包捕获(见 `application/tools/`)。 */
export interface ToolContext {
  /** 本轮开始时的会话状态。**同一轮里的多个工具看到的是同一份**,变更靠返回值折叠。 */
  session: Session;
  /**
   * ★ **本次执行是不是「重放一轮待确认的调用」**(阶段 3)。缺省 `undefined` = **首次执行**。
   *
   * - `'approved'`:用户**点过确认** → 真做,该花钱的花钱(`render_look`)。
   * - `'declined'` :那一轮没被确认(用户转而说了别的)→ **明确告诉模型这次没做**,
   *   ★ 且**不许再返回 `pendingConfirmation`** —— 否则闸门会自己重新武装,
   *   会话永远出不去(它已经不再是"等待",而是"用户没同意"这个事实)。
   *
   * ★ **为什么不是布尔值**:三态各有不同的话要说,而且 `undefined` 与 `false` 的区别
   *   正是这条闸门的安全性的来源——**只有显式的 `'approved'` 能触发计费**。
   *   缺省(`undefined`)一律停在"请用户确认",而不是"默默出图"。
   *   同 §5.4 那条:「缺省值必须没有意外副作用」,这里的副作用是**花钱**。
   */
  confirmation?: 'approved' | 'declined';
}

/** 需要用户先点确认、才能执行的动作(目前只有 `render_look`)。 */
export interface PendingConfirmation {
  /** 给前端判断该弹什么。 */
  kind: 'render_look';
  /** 给用户看的一句话:**要花什么、大概多少**(§7.4.2:确认对话框必须说清代价)。 */
  summary: string;
}

/** 工具执行的结果。 */
export interface ToolOutcome {
  /** 回填给模型的 observation 文本。**它是 prompt,要用模型读得懂的话写**(§7.3 第 3 条同理)。 */
  content: string;
  /** 失败时置真。模型据此决定重试还是换路。 */
  isError?: boolean;
  /**
   * 会话变更。**只在真的改了时才返回**,不改就不返回——
   * 免得每一轮都产生一次无意义的会话写入。
   */
  session?: Session;
  /**
   * ★ **这个动作没有真正执行,它在等用户点确认**(§7.4:贵的操作由人拍板)。
   *
   * 置了它之后:① 它的 `tool_result` **这一轮不还**(还了就等于告诉模型"做完了");
   * ② `agent-loop` 必须**当场停下**并把这个事件透给前端。
   * 细节见 `agent-loop.ts` 里 `awaiting_confirmation` 那段注释——**那是本协议最脆的地方**。
   */
  pendingConfirmation?: PendingConfirmation;
}

export interface Tool {
  readonly definition: LlmToolDefinition;
  run(input: unknown, context: ToolContext): Promise<ToolOutcome>;
}

/** 把一批工具按名字索引,供 `agent-loop` 分发。 */
export function indexTools(tools: readonly Tool[]): Map<string, Tool> {
  return new Map(tools.map((t) => [t.definition.name, t]));
}
