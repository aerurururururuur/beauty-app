/**
 * application/agent-loop.ts —— ★ harness。整个 agent 模块唯一有真实复杂度的地方。
 *
 * 形状照工具调用循环的**通行实现**(§7.3:**模仿形状,不是抄源码**),
 * 下面每条都标了它对应哪条约定,便于将来对照原文核。
 *
 * ── 循环骨架 ────────────────────────────────────────────────────────────────
 *   ① 调 LLM(带 tools)
 *   ② **把 assistant 那一轮原样追加**进 `messages[]`
 *   ③ 没有 tool_use 块 → 终止本轮,交还用户
 *   ④ 有 tool_use 块 → 逐个执行 → **全部结果合成一条 user 消息** → 回到 ①
 *
 * ── 六条被结构钉死的不变量(违反它们会 400 或静默丢结果)────────────────────
 *   [A] **assistant 那一轮必须原样回填。** 漏掉或不完整是 `unexpected role` 类
 *       400 的头号成因——协议是无状态的,每轮都要整份重发。
 *   [B] **每个 `tool_use` 必须配一个 `tool_result`**,一个都不能少。
 *       所以下面**先建 `results` 数组、再统一收集**,而不是"成功才 push"。
 *   [C] **同一轮的结果装进同一条 user 消息**(`toolResults()` 是唯一构造入口)。
 *       拆成多条会让模型**学会不再并行调用工具**。
 *   [D] **工具错误转 observation,不抛穿循环**(§7.3 第 4 条)。
 *       抛穿 = 用户看到 500,而不是一句「那张图没出来,我换个方式再试」。
 *   [E] **未知工具名也要回 `tool_result`**[B 的推论]。模型会编工具名,这是常态不是异常。
 *   [F] **必须有迭代上限与超时**(§10 `[I4]`)。没有这个护栏的 agent 不能上线。
 *
 * ── ⑦ ★ 等待用户确认:本文件**最脆的一处**(阶段 3 起)──────────────────────
 *
 * `render_look` 要花钱,所以它**不能由模型自己决定执行**(§7.4)。协议是这样:
 *
 *   模型调 `render_look` → 工具**不调用引擎**,返回 `pendingConfirmation`
 *   → 循环**当场停下**(`awaiting_confirmation`),那一轮的 `tool_use` **故意不还结果**
 *   → 前端弹确认框 → 用户点确认 → `POST /agent/sessions/:id/render`
 *   → 回到本文件,把那一轮**重放**一遍(这次 `confirmation='approved'`)→ 真出图
 *
 * **三处必须一起理解,否则会写出必然 400 的代码:**
 *
 * 1. ★ **不能还一半结果。** [B] 说的是"最终都要还",但**一次发给模型的那批必须齐**。
 *    所以一轮里只要有一个工具在等确认,**整轮的结果都不发**——包括那些已经真跑过的
 *    (`patch_brief` 之类)。它们的会话变更**照常折叠**,只是不汇报。
 * 2. ★ **因此那一轮会被整轮重跑**。这就是 `tool.ts` 约束 3 的来历:
 *    **每个工具都必须可重入**。现在四个都满足(三个免费的设值/只读,`render_look`
 *    本身由 `confirmation` 把着,重跑不带 `approved` 就只会再等一次)。
 * 3. ★ **停机点不是"这一轮结束",而是"欠着一条 `tool_result`"**。
 *    所以**任何**下次进入本文件的路径都必须先把它了结——
 *    用户的下一句话、用户点确认,都走下面 `ⓞ` 那段。**漏了就是下一轮 400。**
 *    `test/agent-loop.test.ts` 里那条"暂停后直接发消息"的用例钉的就是这一条。
 */
import { AppError } from '../../shared/index.js';
import type { Session } from '../domain/entities/session.js';
import { appendMessages } from '../domain/entities/session.js';
import { ToolResultBlock } from '../domain/entities/message.js';
import type { ToolUseBlock } from '../domain/entities/message.js';
import {
  assistantMessage,
  danglingToolUses,
  textMessage,
  textOf,
  toolResults,
  toolUsesOf,
} from '../domain/entities/message.js';
import type { SkinTonePalette } from '../../makeup/index.js';
import type { Llm, LlmResponse } from '../domain/ports/llm.js';
import type { PendingConfirmation, Tool, ToolOutcome } from '../domain/tools/tool.js';
import { buildSystemPrompt } from './system-prompt.js';
import { TOOL_NAMES } from '../domain/tools/definitions.js';

/** 单轮对话最多几趟 LLM 往返。§10 `[I4]`。 */
export const DEFAULT_MAX_ITERATIONS = 8;
/** 单轮对话墙钟上限。§10 `[I4]`。 */
export const DEFAULT_TURN_TIMEOUT_MS = 60_000;
/** 输出上限。★ 线上有的实现对 `max_tokens` 是**必填**,所以这里必须有兜底。 */
export const DEFAULT_MAX_TOKENS = 1024;

/**
 * 本轮为什么结束。**收束原因要和异常分开**——§12.2 的验收明确要求
 * 「预算耗尽行为:收束 + 建议走表单路径,**不抛错**」。
 */
export type AgentStopReason =
  | 'end_turn'
  | 'max_iterations'
  | 'max_tokens'
  | 'refusal'
  | 'llm_unavailable'
  | 'timeout'
  /**
   * ★ **不是异常,是"等用户点一下"**(见文件头 ⑦)。
   * 前端收到它就该把确认框弹出来——它和 `timeout` / `llm_unavailable` 那几条
   * **收束原因**放在同一个枚举里,但含义完全不同:那几条是"没做成",这条是"轮到你了"。
   */
  | 'awaiting_confirmation';

/** 流式事件协议(§7.3 第 6 条)。前端据此显示「正在查衣橱…」。 */
export type AgentEvent =
  /** 一段正文。⚠️ 阶段 2 的 LLM 端口非流式,所以**每轮只会有一条**,内容是整段。 */
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolUseId: string; name: string }
  | { type: 'tool_end'; toolUseId: string; name: string; isError: boolean }
  /**
   * ★ **有个动作在等用户确认**(目前只有 `render_look`)。
   * `summary` 就是要显示在确认框上的那句话——前端**原样展示**,不要自己再拼一遍
   * (与 `lookDescription` 同一条规矩:两处拼就会有两套说法)。
   */
  | { type: 'tool_pending'; toolUseId: string; name: string; summary: string }
  | { type: 'turn_end'; reason: AgentStopReason; iterations: number };

export interface AgentTurnResult {
  session: Session;
  events: AgentEvent[];
  stopReason: AgentStopReason;
}

export interface AgentRunOptions {
  /**
   * ★ **重放一轮待确认的调用时,用户给的决定**(见文件头 ⑦)。
   *
   * - `undefined`(缺省):如果有待确认的一轮,一律按 `'declined'` 处理 ——
   *   **没被明说"用户点了确认",就当没同意。** 这条缺省是安全的:
   *   搞错了只是少花一次钱,反过来则是**替用户花了钱**。
   * - `'approved'`:只有「用户点了确认」那条 HTTP 路径会传它。
   */
  resume?: 'approved' | 'declined';
  /**
   * ★ **这一轮的独立超时预算**(✏️ 2026-10-01),毫秒。缺省用 `AgentLoopOptions.turnTimeoutMs`。
   *
   * 需要它是因为出图那一轮要跑 **3~7 次**引擎调用(每个上妆步一张),
   * 而缺省的 60 秒只够一张多一点 —— 截断的后果是"图出了但模型没说话",
   * 而用户已经付了钱。见 `confirm-render.ts`。
   * ⚠️ 判据仍在**每轮迭代开头**(`agent-loop.ts` 主循环),所以它不是"硬中断"。
   */
  turnTimeoutMs?: number;
}

export interface AgentLoopOptions {
  llm: Llm;
  /** 工具注册表。★ 它同时就是**白名单**——查不到的名字一律拒绝(安全底线)。 */
  tools: ReadonlyMap<string, Tool>;
  /** 肤色词表。★ **必传** —— 它只用来在系统提示里印「该肤色可用色」那一行(v16),
   *  但那是每次会话白花一个回合的原因,少传就退回"让模型猜"。同 `ProposeLookTool` 那一格的理由。 */
  palette: SkinTonePalette;
  maxIterations?: number;
  turnTimeoutMs?: number;
  maxTokens?: number;
  /** 时钟注入,只为让超时用例可测(缺省 `Date.now`)。 */
  now?: () => number;
}

/**
 * LLM 不可达时的收束话术。
 *
 * ⚠️ **原来这里写着「你可以先用 `POST /api/jobs` 拿图」——那条路已经不存在了**,
 *   而 `[I7]`「要点名出路」这条原则随之**降级**:现在唯一诚实的出路就是再发一次。
 *   留着一个指向 404 的建议,比只说"出错了"更糟。
 */
const LLM_DOWN_TEXT = '我这会儿连不上后台,没能回你这句话。稍后再发一次,我接着帮你调。';

/**
 * 会补话的收束原因。★ **不带 `llm_unavailable`**(它有自己那句,见上)
 * 也**不带 `awaiting_confirmation`**(那不是收束,是"轮到你了",见 `closeAwaiting`)。
 */
type ClosingReason = 'timeout' | 'max_iterations' | 'max_tokens' | 'refusal';

/**
 * 收束话术。★ 每一条都点明"你还能做什么"——只说"到上限了"等于把用户卡在原地。
 *
 * ★ `refusal` 曾经**不在这里**,而那是四种收束里唯一一个服务端不补话的:
 *   模型拒答时可能**一个字都不给**(拒答允许内容为空),那一轮就落成**空气泡**——
 *   用户看到一片空白,不知道刚才发生了什么。前端当时自己补了一句兜底
 *   (`stores/agent.js` 的 `closingNote`),那是**在替服务端擦屁股**。
 *   现在归位:服务端保证"每一轮收束都有一句话",前端那句删除。
 *
 * ⚠️ **但 `refusal` 只在"模型一个字没给"时才用这句**(见主循环 ③)。
 *   模型若自己解释了它为什么拒答,那句话就是回答本身——再叠一句就是**在它嘴上说话**,
 *   而且会出现两句互相打架的说明。
 */
const CLOSING_WORDS: Record<ClosingReason, string> = {
  timeout: '这次聊得太久了,我先停一下。你可以直接说想要的方向,我马上接着调。',
  max_iterations: '我在这件事上来回太多次了,先停下。你可以把要求说得再具体一点,我重新来。',
  max_tokens: '我这边的回复被截断了。你把要求再说一次,我简短点回你。',
  refusal: '这次我没能给出回答——模型那边拒答了。换个说法再试一次,或者把要求写得更具体些。',
};

export class AgentLoop {
  constructor(private readonly opts: AgentLoopOptions) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  /**
   * 跑一轮。
   *
   * `userText` **可以不给** —— 用户点「确认出图」时他并没有说话,
   * 那一轮的输入是"确认"这个动作本身(见文件头 ⑦)。
   */
  async run(
    session: Session,
    userText?: string,
    options: AgentRunOptions = {},
  ): Promise<AgentTurnResult> {
    const maxIterations = this.opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const deadline =
      this.now() + (options.turnTimeoutMs ?? this.opts.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS);
    const events: AgentEvent[] = [];

    // 之后所有变更都以「返回新 Session」折叠,不就地改。
    let current = session;


    // ★ 「这一轮是不是这次会话的开场」——历史里还没有 assistant 说过话。
    //   只看**进来的**那份会话:后面折叠出来的不算(重放确认那一轮尤其不是开场)。
    const isOpeningTurn = !session.messages.some((m) => m.role === 'assistant');

    // ── ⓞ ★ 先把「欠着 tool_result 的那一轮」了结(见文件头 ⑦ 第 3 条)─────────
    //   这一步**不能省**:上一轮停在等待确认时,那条 `tool_use` 还欠着结果,
    //   带着它去调 LLM 必 400。用户点确认、用户改说别的、用户什么都没点就又说了一句,
    //   三种情况**走的是同一段代码**,区别只在 `options.resume`。
    const dangling = danglingToolUses(current.messages);
    if (dangling.length > 0) {
      // ★ 缺省 `'declined'`:没被明说是"用户点了确认"就一律当没同意(见 `AgentRunOptions`)。
      const confirmation = options.resume ?? 'declined';
      const replay = await this.executeCalls(dangling, current, confirmation, events);
      // ★ 用户这句话(如果有)**并进这条消息**,不另起一条 —— 连发两条 `role:'user'`
      //   是 Anthropic 那一支会 400 的形状(`toolResults` 的注释)。
      current = appendMessages(replay.session, [toolResults(replay.results, userText)]);
      if (replay.pending) return this.closeAwaiting(current, events, replay.pending, 0);
    } else if (userText !== undefined) {
      // 没有欠账 → 常规路径:用户这句话自己进历史。
      current = appendMessages(current, [textMessage('user', userText)]);
    }
    // ⚠️ `dangling.length === 0 && userText === undefined` 也是合法的:
    //   服务端被要求"确认"一个没有待确认项的会话(用例层已经挡过一次,这里是兜底)。
    //   此时不追加任何消息,直接接着跑——总比抛错好(循环不抛错的规矩)。

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (this.now() > deadline) {
        return this.close(current, events, 'timeout', iteration);
      }

      // ★ 开场那一轮**点名**要妆面:它的全部意义就是把妆面记进会话,而实测里
      //   模型会只调 `patch_brief`、然后在正文里把妆面讲完(见 `system-prompt.ts` v11)
      //   ——那一步没落进会话,后面整条出图链就都没有依据。
      //   ⚠️ 落了就松手,别挡住它接着说话;出了开场那一轮也照旧不点名。
      const wantsLook =
        isOpeningTurn && !current.lookSpec && this.opts.tools.has(TOOL_NAMES.proposeLook);
      /**
       * ✏️ 2026-10-01:**点名分两段,先读配方、再填妆面单。**
       *
       * ⚠️ **不这样分,`read_style_recipe` 在开场那一轮就形同虚设。** `requireTool` 是
       *   `tool_choice: {function: …}` —— 点名谁,模型**这一轮就只能调那一个**。
       *   于是"先读配方再填 `zones`"这件事在最需要它的那一轮(开场)根本做不到,
       *   而开场那一轮正是每轮必被区集打回的那一次。
       *   ⇒ 把第一段点名给 `read_style_recipe`,它一答过就换回 `propose_look`。
       *
       * ★ 判据是「**历史里出现过那一调没有**」。开场那一轮的历史里不可能有(有 assistant
       *   就不叫开场了),所以它真正管的是**同一次运行内**第一段点名答过没有 —— 一答过
       *   就换成 `propose_look`,读失败(比如它编了个 id)也一样:那之后该由模型自己决定
       *   要不要再读,而不是被钉在读取上出不去。
       * ⚠️ 注册表里没有 `read_style_recipe` 时整段退回旧行为(同下面那条"没有 `propose_look` 就不点名")。
       */
      const readRecipeFirst =
        wantsLook &&
        this.opts.tools.has(TOOL_NAMES.readStyleRecipe) &&
        !current.messages.some((m) =>
          toolUsesOf(m).some((c) => c.name === TOOL_NAMES.readStyleRecipe),
        );
      const requireTool = !wantsLook
        ? undefined
        : readRecipeFirst
          ? TOOL_NAMES.readStyleRecipe
          : TOOL_NAMES.proposeLook;

      // ── ① 调 LLM ──
      let response: LlmResponse;
      try {
        response = await this.opts.llm.chat({
          // ★ 「有没有产品库」现问注册表,不另存一个布尔值——注册表本来就是
          //   "哪些工具真的存在"的唯一出处(理由见 `SystemPromptOptions` 的注释)。
          system: buildSystemPrompt(current, {
            hasProducts: this.opts.tools.has(TOOL_NAMES.listProducts),
            palette: this.opts.palette,
          }),
          messages: current.messages,
          // ★ 工具契约**按当前会话现算**(每次迭代都算,不能提到循环外):
          //   `propose_look` 的 `tone` 白名单要按会话里的肤色收窄,而那一格可能是
          //   上一迭代的 `patch_brief` 才填上的。没实现 `definitionFor` 的工具用它自己的契约。
          tools: [...this.opts.tools.values()].map((t) => t.definitionFor?.(current) ?? t.definition),
          ...(requireTool !== undefined ? { requireTool } : {}),
          maxTokens: this.opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        });
      } catch (err) {
        // 传输层挂了。★ 这里**吞掉异常换一句话**是老式写法,但在这个位置是对的:
        // 用户在对话中间,看到 500 不如看到"我这会儿连不上,稍后再发一次"。
        console.warn(`[agent] LLM 调用失败:${err instanceof Error ? err.message : String(err)}`);
        events.push({ type: 'text_delta', text: LLM_DOWN_TEXT });
        const withReply = appendMessages(current, [textMessage('assistant', LLM_DOWN_TEXT)]);
        events.push({ type: 'turn_end', reason: 'llm_unavailable', iterations: iteration });
        return { session: withReply, events, stopReason: 'llm_unavailable' };
      }

      // ── ② assistant 那一轮原样追加 [A] ──
      const assistant = assistantMessage(response.content);
      current = appendMessages(current, [assistant]);

      const text = textOf(assistant);
      if (text) events.push({ type: 'text_delta', text });

      // ── ③ 没有工具调用 → 本轮结束 ──
      const calls = toolUsesOf(assistant);
      if (calls.length === 0) {
        const reason = this.stopReasonOf(response, iteration, maxIterations);
        // ★ `refusal` 是唯一需要分两种情况的收束:
        //   · 模型自己解释了为什么拒答(`text` 非空)→ 那句话就是回答,**不补**;
        //   · 一个字都没给 → 不补就是个空气泡,走 `close()` 补一句(见 `CLOSING_WORDS`)。
        //   其余收束原因都不在这里补:它们要么本就有正文,要么在别处补过。
        if (reason === 'refusal' && !text) {
          return this.close(current, events, 'refusal', iteration);
        }
        events.push({ type: 'turn_end', reason, iterations: iteration });
        return { session: current, events, stopReason: reason };
      }

      // ── ④ 执行工具 [B] ──
      const executed = await this.executeCalls(calls, current, undefined, events);
      current = executed.session;

      // ★ 有动作在等用户确认 → **当场停下,这一轮的 `tool_result` 一个都不还**
      //   (见文件头 ⑦ 第 1 条:发一半 = 下一轮 400;全不发,等确认后整轮重放)。
      if (executed.pending) {
        return this.closeAwaiting(current, events, executed.pending, iteration);
      }

      // ★ [C] 全部结果合成**一条** user 消息。
      current = appendMessages(current, [toolResults(executed.results)]);

      // ★ 截断的保护:`max_tokens` 时工具调用可能是残缺的。
      //   结果已经还了(不还下一轮必 400),但**不再继续循环**——
      //   拿一份残缺的入参接着推理,只会把错误放大。
      if (response.stopReason === 'max_tokens') {
        return this.close(current, events, 'max_tokens', iteration);
      }
    }

    // ── 触顶 [F] ──
    return this.close(current, events, 'max_iterations', maxIterations);
  }

  /**
   * 逐个执行一批调用(主循环的 ④ 与重放路径**共用这一段**)。
   *
   * ★ **它不追加消息**——`tool_result` 到底还还是不还,只有调用方知道
   * (有 `pending` 就一个都不还)。把"追加"留给调用方,是为了让那条规则**只有一处判断**。
   *
   * 返回的 `results` 在有 `pending` 时**会被调用方丢掉**,这是有意的:
   * 那一轮整轮要重放,单独还一半会 400(见文件头 ⑦)。
   */
  private async executeCalls(
    calls: readonly ToolUseBlock[],
    session: Session,
    confirmation: 'approved' | 'declined' | undefined,
    events: AgentEvent[],
  ): Promise<{ results: ToolResultBlock[]; session: Session; pending: PendingConfirmation | null }> {
    const results: ToolResultBlock[] = [];
    // ★ 传**当前的** `current`:同一轮里多个工具要按顺序叠加副作用,
    //   后一个必须看得到前一个改过的会话,否则后者的返回值会覆盖前者。
    let current = session;
    let pending: PendingConfirmation | null = null;

    for (const call of calls) {
      events.push({ type: 'tool_start', toolUseId: call.id, name: call.name });
      const outcome = await this.runToolSafely(call, current, confirmation);
      // ★ 工具成功与否**只有事件里那个布尔**,被拒的理由一个字都不进日志
      //   (`tool_result` 的内容只回填给模型)。诊断时就只能靠猜。
      if (outcome.isError) console.warn(`[agent] 工具 ${call.name} 被拒:${outcome.content}`);
      if (outcome.session) current = outcome.session;
      events.push({
        type: 'tool_end',
        toolUseId: call.id,
        name: call.name,
        isError: outcome.isError === true,
      });

      if (outcome.pendingConfirmation) {
        // ★ 只记事件,**不 push `tool_result`** —— 还了就等于告诉模型"做完了"。
        pending = outcome.pendingConfirmation;
        events.push({
          type: 'tool_pending',
          toolUseId: call.id,
          name: call.name,
          summary: outcome.pendingConfirmation.summary,
        });
        continue;
      }

      // ★ `outcome.isError` 是 `boolean | undefined`,这里原样传进去 ——
      //   构造器会把值为 `undefined` 的键删掉,所以"没出错"那条路不会凭空多一个键。
      results.push(
        new ToolResultBlock({
          type: 'tool_result',
          toolUseId: call.id,
          content: outcome.content,
          isError: outcome.isError,
        }),
      );
    }

    return { results, session: current, pending };
  }

  /**
   * 停在「等用户确认」上。★ **刻意不补一句脚本话术**——
   * 与 `close()` 那几条不同,这里不是"没做成",模型在调工具前通常已经
   * 按工具描述说了「确认之后我就开始出图」。再补一句只会重复它,
   * 而真正该出现的提示在**前端的确认框**上(`tool_pending` 事件里带了那句话)。
   */
  private closeAwaiting(
    session: Session,
    events: AgentEvent[],
    pending: PendingConfirmation,
    iterations: number,
  ): AgentTurnResult {
    // `pending` 只用于日志:它已经由 `tool_pending` 事件透给前端了。
    console.log(`[agent] 等待用户确认:${pending.kind}`);
    events.push({ type: 'turn_end', reason: 'awaiting_confirmation', iterations });
    return { session, events, stopReason: 'awaiting_confirmation' };
  }

  /**
   * 收束:补一句给用户的话 + `turn_end` 事件。**不抛错**(§12.2 验收)。
   * 话术里点明还能做什么——只说"到上限了"等于把用户卡在原地。
   */
  private close(
    session: Session,
    events: AgentEvent[],
    reason: ClosingReason,
    iterations: number,
  ): AgentTurnResult {
    const text = CLOSING_WORDS[reason];
    const withReply = appendMessages(session, [textMessage('assistant', text)]);
    events.push({ type: 'text_delta', text });
    events.push({ type: 'turn_end', reason, iterations });
    return { session: withReply, events, stopReason: reason };
  }

  /** 正常终止时的原因归一(只在没有工具调用时用)。 */
  private stopReasonOf(
    response: LlmResponse,
    _iteration: number,
    _maxIterations: number,
  ): AgentStopReason {
    if (response.stopReason === 'max_tokens') return 'max_tokens';
    if (response.stopReason === 'refusal') return 'refusal';
    return 'end_turn';
  }

  /**
   * 执行一个工具调用,**保证一定返回一个 `ToolOutcome`**(§7.3 第 4 条 / [D][E])。
   * 这个函数是「工具错误不抛穿循环」的唯一落点——实现里漏 catch 也拦得住。
   */
  private async runToolSafely(
    call: ToolUseBlock,
    session: Session,
    confirmation?: 'approved' | 'declined',
  ): Promise<ToolOutcome> {
    const tool = this.opts.tools.get(call.name);
    if (!tool) {
      // [E] 模型编了个不存在的工具名。**仍然必须回一条结果**。
      // ★ 提到可用名单:不说清有哪些,模型很可能换个名字再编一个,白烧一轮。
      return {
        content:
          `没有名为「${call.name}」的工具。可用工具:${[...this.opts.tools.keys()].join(' / ')}。` +
          '请改用其中之一,或直接用文字回复用户。',
        isError: true,
      };
    }

    // ★ 适配器解析 `arguments` 失败时会把**原始字符串**交上来(见 `dashscope-llm.ts` 翻译 1)。
    //   在这里统一认出来并直说。让模型去猜"缺字段"(它会收到一个被包在字符串里的 `{}`)
    //   是浪费轮次的典型成因——而轮次在这里是免费的,在阶段 3 就不一定了。
    if (typeof call.input === 'string') {
      return {
        content:
          `工具「${call.name}」的参数不是合法 JSON,无法解析。` +
          '请按该工具的参数 schema 重新给出一段合法 JSON。',
        isError: true,
      };
    }

    try {
      // ★ `confirmation` 由**本循环**决定,不由模型决定(见文件头 ⑦)。
      //   传 `undefined` 时工具就该停在"请用户确认"上。
      return await tool.run(call.input, {
        session,
        ...(confirmation !== undefined ? { confirmation } : {}),
      });
    } catch (err) {
      // ★ 校验类失败(`AppError`)的消息是**写给人/模型看的**,
      //   可以原样回填;其它异常**不把内部细节喂给模型**(同 `error-handler.ts`
      //   只在 500 时说一句"服务内部错误"的取舍),细节只进日志。
      if (err instanceof AppError) {
        return { content: err.message, isError: true };
      }
      console.warn(`[agent] 工具 ${call.name} 抛出未捕获异常`, err);
      return {
        content: `工具「${call.name}」执行时出了内部错误,这次没完成。你可以换个方式再试,或改用别的工具。`,
        isError: true,
      };
    }
  }
}
