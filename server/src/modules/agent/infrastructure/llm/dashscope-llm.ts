/**
 * infrastructure/llm/dashscope-llm.ts —— 阿里云百炼(DashScope)适配器。
 *
 * ★ **本文件是 `llm.ts` 端口存在的全部理由。** 供应商的全部差异都关在这里:
 * 出了这个文件,`agent-loop` 与工具看到的只有中性的 `Message` / `ContentBlock`。
 *
 * 形状依据(`docs/plan/makeup-agent-design.md` §7.5.1):**`[实测]`,不是读文档来的**——
 * 官方文档站(`help.aliyun.com` / `alibabacloud.com`)在开发环境**被网络策略拦截,始终没读到**。
 * 下面的形状来自 `npm run probe:tools` 打出的原始响应(夹具在 `out/probe-tool-calling/`):
 *
 *   finish_reason: "tool_calls"
 *   message: { role: "assistant", content: "",
 *              tool_calls: [{ index: 0, id: "call_...", type: "function",
 *                             function: { name: "get_weather", arguments: "{\"city\": \"北京\"}" } }] }
 *
 * ⚠️ **这个区别在平台方改行为时会先于文档失效**(§7.5.2 末)。所以 §11 要求
 * LLM 调用**要做 record/replay**——这类形状依据全靠实测,而实测会随平台方改行为失效,
 * 夹具是它唯一的留存(§11)。⚠️ 这条**还没做**;生图那边曾经做过一套,2026-09-29 已删掉。
 *
 * ── 三处必须显式处理的翻译(不做就是 bug,不是疏漏)────────────────────────
 * 1. **`arguments` 是 JSON 字符串,不是对象。** 这是与块式协议的分歧点。解析失败时
 *    **原样把字符串交上去**,由 `agent-loop` 认出并回一句"参数不是合法 JSON"——
 *    在这里编一个空对象会让模型收到一个莫名其妙的"缺字段"错误。
 *    ✏️ **2026-10-03:那个字符串回填时必须换成 `{}`**(见 `wireArguments`)——
 *    出站方向接口只收 JSON 对象,原样发出去第二轮必 400,那条纠错路**一次都走不通**。
 * 2. **结果回填要拆条。** 内部是「一条 user 消息装 N 个结果」(那是对的形状),
 *    而线上这里要求每个结果一条独立的 `role:'tool'` 消息。
 * 3. ★ **`is_error` 在这里没有对应字段,是有损翻译。** 线上这个形状里没有出错位,
 *    而**丢掉它会让模型以为失败的工具成功了。** 所以错误结果
 *    在 `content` 前面加「错误:」前缀把这一位补回去。
 *    ★ **这是本项目在这条线上自己补的约定,不是线上协议的一部分**——
 *    所以不能只靠它。真正的保险是**工具的错误文案本身就写成自解释的中文整句**
 *    (见 `agent-loop.ts` 那几条 `isError` 分支),前缀只是把这个事实再顶到最前面。
 *    ★ 这是**有损**的:块式协议的原生出错位能表达"前缀表达不了"的语义,
 *    这里一旦加了前缀就与普通正文同形。**换供应商时这一格要重新对一遍。**
 */
import type { ContentBlock, Message } from '../../domain/entities/message.js';
import { TextBlock, ToolUseBlock, textOf, toolUsesOf } from '../../domain/entities/message.js';
import type {
  Llm,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  LlmUsage,
} from '../../domain/ports/llm.js';
import { LlmUnavailableError } from '../../domain/errors/llm-unavailable-error.js';

export interface DashScopeLlmOptions {
  apiKey: string;
  /** 形如 `https://dashscope.aliyuncs.com/compatible-mode/v1`(**不带**尾斜杠)。 */
  baseUrl: string;
  /** 模型名。实测 `qwen-flash` 847ms / `qwen-plus` 1390ms 都能跑完整两轮(§7.5.1)。 */
  model: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 只重试**连接阶段**错误,整体超时**刻意不重试**。
 * 判据与 `scripts/qwen-image-makeup.ts` / `probe-tool-calling.ts` **完全一致**,
 * 理由也一样:整体超时意味着"已经发出去、没等到响应",服务端**可能已经跑完并计费**,
 * 盲目重试会重复烧钱。
 */
const RETRYABLE_CONNECT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
]);

function isConnectPhaseError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CONNECT_CODES.has(code)) return true;
    if (cur.name === 'TimeoutError') return false;
    cur = cur.cause;
  }
  return false;
}

/**
 * ★ `fetch` 失败时 `err.message` 只有 `fetch failed`,真原因在 `err.cause` 里;
 *   不打出来,下面那条重试日志就只剩「重试了」三个字,排查只能靠猜。
 * ★ 与 `makeup/infrastructure/connect-retry.ts` 那份**刻意各留一份**(本模块不 import 它的深路径)。
 */
function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as NodeJS.ErrnoException).code;
    parts.push(`${cur.message}${code ? ` [${code}]` : ''}`);
    cur = cur.cause;
  }
  return parts.join(' ← ') || String(err);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── 内部形状 → 线上形状 ─────────────────────────────────────────────────────

interface WireToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

function toWireMessages(system: string | undefined, messages: readonly Message[]): unknown[] {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });

  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = textOf(m);
      const calls = toolUsesOf(m);
      if (calls.length === 0) {
        out.push({ role: 'assistant', content: text });
      } else {
        out.push({
          role: 'assistant',
          // ★ 有工具调用时正文可能是空串。实测响应里就是 `""`;
          //   回填时给 `null` 比给 `""` 稳(空串可能被当成"有正文")。
          content: text === '' ? null : text,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: 'function',
            // ★ 翻译 1:对象 → JSON 字符串。出去时序列化,回来时解析,两边对称。
            function: { name: c.name, arguments: wireArguments(c.input) },
          })),
        });
      }
      continue;
    }

    // user:可能是纯正文,也可能是工具结果
    const results = m.content.filter((b) => b.type === 'tool_result');
    if (results.length > 0) {
      // ★ 翻译 2 + 3:每个结果一条独立消息;错误位用「错误:」前缀补回来。
      for (const r of results) {
        if (r.type !== 'tool_result') continue;
        out.push({
          role: 'tool',
          tool_call_id: r.toolUseId,
          content: r.isError ? `错误:${r.content}` : r.content,
        });
      }
      const text = textOf(m);
      if (text) out.push({ role: 'user', content: text });
      continue;
    }
    out.push({ role: 'user', content: textOf(m) });
  }
  return out;
}

function toWireTools(tools: LlmRequest['tools']): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      // ★ 内部叫 `inputSchema`(中性名),这里翻译成线上的 `parameters`。
      parameters: t.inputSchema,
    },
  }));
}

// ── 线上形状 → 内部形状 ─────────────────────────────────────────────────────

/** 解析工具入参。**失败时原样返回字符串**,交给 `agent-loop` 报"参数不是合法 JSON"。 */
function parseToolArguments(raw: string | undefined): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    // ★ 解析器的原话**必须留下**:V8 会给出 `position N (line L column C)`,
    //   那是唯一能在 2000 多字符里定位的线索 —— 实测那几次的开头 200 字符**完全合法**
    //   (`{ "styleName": …`),毛病在后面某处;只看开头等于什么都没看到。
    //   所以按解析器给的 offset 截一窗出来打,**别让人去数第几个字符**。
    const why = err instanceof Error ? err.message : String(err);
    const at = Number(/position (\d+)/.exec(why)?.[1]);
    const where = Number.isFinite(at)
      ? `\n  错处:…${raw.slice(Math.max(0, at - 80), at + 80)}…`
      : `\n  原文:${raw.slice(0, 120)}…${raw.slice(-160)}`;
    console.warn(`[agent] 工具参数不是合法 JSON(${raw.length} 字符):${why}${where}`);
    return raw;
  }
}

/**
 * 回填时的反方向:把 `input` 序列化成出线的 `arguments`。
 *
 * ★ **必须是 JSON 对象。** `input` 可能是 `parseToolArguments` 原样留下的**字符串**
 *   (解析失败时那一段),直接 `JSON.stringify` 出来是个合法的 JSON *字符串字面量*,
 *   而接口只收对象 —— 实测报 400 `function.arguments ... must be in JSON format`,
 *   于是「回一句『参数不是合法 JSON』让模型重试」那条路**一次都走不通**
 *   (2026-10-03 实测:第二轮必 400,用户看到的是"连不上")。
 *   ⚠️ 代价:模型回看到自己的参数变成了 `{}`,纠错依据只剩那条工具结果 —— 所以
 *   `agent-loop.runToolSafely` 那边同时会打一行日志(不让这次替换静默发生)。
 */
function wireArguments(input: unknown): string {
  const text = JSON.stringify(input);
  return typeof text === 'string' && text.startsWith('{') ? text : '{}';
}

/**
 * `finish_reason` → 归一化终止原因(映射表见 `domain/ports/llm.ts` 文件头)。
 * ★ 表外的值**必须留下一条日志**(那条注释承诺的就是这一句):
 *   `end_turn` 的含义是"模型说完了",而没见过的终止原因很可能不是那个意思 ——
 *   供应商悄悄改行为时,这里静默归到 `end_turn` 会把一整轮提前结束掉,却什么都不报。
 */
function toStopReason(finish: unknown): LlmStopReason {
  if (finish === 'tool_calls') return 'tool_use';
  if (finish === 'stop' || finish === 'end_turn') return 'end_turn';
  if (finish === 'length') return 'max_tokens';
  if (finish === 'content_filter') return 'refusal';
  console.warn(
    `[agent] LLM 返回了映射表外的 finish_reason:${JSON.stringify(finish)},按 end_turn 处理`,
  );
  return 'end_turn';
}

/**
 * 读用量。两个字段**都**是数字才认,否则整个 `undefined`。
 * ⚠️ 缺的那个位置**不许补 0**:那会让"供应商没报用量"在账上长得跟"用量真的是 0"
 *    一模一样,而后者永远不会被谁发现(§14-06)。
 */
function toUsage(usage: unknown): LlmUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown };
  if (typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') {
    return undefined;
  }
  return { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens };
}

function toContent(message: Record<string, unknown>): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  const text = message.content;
  if (typeof text === 'string' && text.trim() !== '') {
    blocks.push(new TextBlock({ type: 'text', text }));
  }

  const calls = message.tool_calls;
  if (Array.isArray(calls)) {
    calls.forEach((raw, index) => {
      const call = raw as WireToolCall;
      blocks.push(
        new ToolUseBlock({
          type: 'tool_use',
          // ★ id 缺失要兜底:没有 id 就配不上 tool_result,下一轮必 400。
          //   实测里 id 是有的(`call_ce5648...`),这只是防御。
          id: typeof call.id === 'string' && call.id !== '' ? call.id : `call_fallback_${index}`,
          name: typeof call.function?.name === 'string' ? call.function.name : '',
          input: parseToolArguments(call.function?.arguments),
        }),
      );
    });
  }

  return blocks;
}

// ── 适配器 ──────────────────────────────────────────────────────────────────

export class DashScopeLlm implements Llm {
  readonly name: string;

  constructor(private readonly opts: DashScopeLlmOptions) {
    this.name = `dashscope:${opts.model}`;
  }

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.opts.model,
      messages: toWireMessages(request.system, request.messages),
      ...(toWireTools(request.tools) ? { tools: toWireTools(request.tools) } : {}),
      // 缺省 auto:模型自己决定调不调工具。**不要用 'required'**——
      // 那会让纯聊天轮也被逼着调工具,而我们的对话大部分时间是纯聊天。
      // ★ `requireTool` 是**点名要某一个**,比 'required' 窄得多(理由见 `LlmRequest`)。
      ...(request.tools && request.tools.length > 0
        ? {
            tool_choice: request.requireTool
              ? { type: 'function', function: { name: request.requireTool } }
              : 'auto',
          }
        : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    };

    const json = await this.postJson('/chat/completions', body, request.timeoutMs);

    const choices = (json as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new LlmUnavailableError('响应里没有 choices');
    }
    const choice = choices[0] as { message?: unknown; finish_reason?: unknown };
    const message =
      choice.message && typeof choice.message === 'object'
        ? (choice.message as Record<string, unknown>)
        : {};

    const blocks = toContent(message);
    const usage = toUsage((json as { usage?: unknown }).usage);

    // ★ 有工具参数没解析出来时,再补一行**只有这里才有的事实**:模型是"写坏了"
    //   还是"被截断了"。判据在用量上 —— 顶到 `max_tokens` 就是截断。
    //   (位置窗口由 `parseToolArguments` 那一端打,它才拿得到 `SyntaxError`。)
    if (blocks.some((b) => b.type === 'tool_use' && typeof b.input === 'string')) {
      console.warn(
        `[agent] 上面那条坏参数的来历:finish_reason=${JSON.stringify(choice.finish_reason)}` +
          ` · completion_tokens=${usage?.outputTokens ?? '未报'} · max_tokens=${request.maxTokens ?? '未传'}`,
      );
    }

    return {
      content: blocks,
      stopReason: toStopReason(choice.finish_reason),
      usage,
      raw: json,
    };
  }

  /** 发请求,带连接阶段重试。失败一律抛 {@link LlmUnavailableError}。 */
  private async postJson(pathname: string, body: unknown, timeoutMs?: number): Promise<unknown> {
    const url = `${this.opts.baseUrl}${pathname}`;
    const attempts = 3;

    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            // ★ 永不打印 key 的值——日志里只出现长度与掩码前缀。
            Authorization: `Bearer ${this.opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });

        const text = await res.text();
        if (!res.ok) {
          // 鉴权失败 / 限流 / 5xx 都到这里。**不重试**:这些不是连接抖动,
          // 重试只会把同一个错误再撞三次(限流时还会加重)。
          throw new LlmUnavailableError(
            `LLM 返回 HTTP ${res.status}:${text.slice(0, 300)}`,
          );
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new LlmUnavailableError(`响应不是 JSON:${text.slice(0, 300)}`);
        }
      } catch (err) {
        if (err instanceof LlmUnavailableError) throw err;
        if (attempt < attempts && isConnectPhaseError(err)) {
          const wait = 500 * attempt;
          // ★ 整条链都要:最外层永远只有 `fetch failed`,code 在 `err.cause` 上。
          console.warn(
            `[agent] LLM 连接阶段错误,${wait}ms 后重试(${attempt}/${attempts - 1}):${describeError(err)}`,
          );
          await sleep(wait);
          continue;
        }
        // ★ 三次都没接上时这一句是用户看到的那句 —— 只说"fetch failed"等于没说。
        throw new LlmUnavailableError(`LLM 请求失败:${describeError(err)}`, err);
      }
    }
  }
}
