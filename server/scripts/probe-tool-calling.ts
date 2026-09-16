/**
 * scripts/probe-tool-calling.ts —— 【实验脚本,不在服务运行路径上】
 *
 * 用途:回答**一个问题**——阿里云百炼(DashScope)的 OpenAI 兼容端点,
 * **到底支不支持 function calling / tools 参数,哪些模型支持**。
 *
 * 为什么值得单独写一个脚本:`docs/plan/makeup-agent-design.md` §7.5 记着,
 * 这件事**只从搜索引擎摘要读到过**(摘要原话:"some models support function calling, some don't"),
 * 官方文档站当时被网络策略拦截、**没读到原文**。而 tool calling 是**整个对话式 agent 的地基**——
 * 它不成立,agent 模块(该文 §7)整个不用开工。**这是阶段 2 真正被卡住的那一格。**
 *
 * 测什么(不是只测"回没回 tool_calls"):
 *   round 1: 带 tools 发一句必然触发工具的话 → 看是否回 tool_calls(以及名字/参数对不对)
 *   round 2: 把 tool 结果回填 → 看是否能给出最终自然语言答复
 *   **两轮都过,才算"这个模型能跑 agent 循环"**;只过第一轮说明不了问题。
 *
 * 用法:
 *   npx tsx scripts/probe-tool-calling.ts --dry-run        # 只看请求体,不发送、不花钱
 *   npx tsx scripts/probe-tool-calling.ts                  # 跑缺省候选模型表
 *   npx tsx scripts/probe-tool-calling.ts --models qwen-plus,qwen-max
 *   npx tsx scripts/probe-tool-calling.ts --list           # 只列该端点认得的模型
 *
 * 产物:`out/probe-tool-calling/<时间戳>-<模型>.json`(原始响应,**是夹具不是日志**)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDotEnvIfPresent } from '../src/modules/shared/infrastructure/config.js';

// ── 配置 ────────────────────────────────────────────────────────────────────

const DEFAULT_API_HOST = 'https://dashscope.aliyuncs.com';

/**
 * 候选表。名字取自 `--list`(`GET /compatible-mode/v1/models` 实测返回 252 个),
 * **不是从摘要抄的**——摘要那次给的 `qwen3.5-plus` / `deepseek-chat` 之类,
 * 端点上的实际形态以本表为准。
 *
 * 选这 7 个的理由:覆盖「经典稳定别名 / 廉价快速 / 最新旗舰 / 跨厂商」四类,
 * 且都是文本模型(agent 主循环用文本就够)。
 */
const DEFAULT_MODELS = [
  'qwen-plus', // 经典缺省别名,最稳
  'qwen-flash', // 廉价快速档,演示成本敏感时的候选
  'qwen3.8-max', // 最新旗舰
  'qwen3.5-plus', // 中间档
  'deepseek-v4-flash', // DeepSeek 系在百炼上的最新(owner 点名要看过 deepseek)
  'deepseek-v3', // DeepSeek 经典档
  'glm-5.3', // 跨厂商对照:非阿里系
];

const OUT_DIR = path.join(import.meta.dirname, '..', 'out', 'probe-tool-calling');
const TIMEOUT_MS = 30_000;

/** 工具定义与那句"必然触发"的提问。刻意取一个模型不可能自己知道答案的工具。 */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的当前天气。只有在用户明确问天气时才调用。',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名,例如 北京' },
        },
        required: ['city'],
      },
    },
  },
];

const USER_TURN_1 = '北京今天天气怎么样?';
/** round 2 回填的假工具结果。内容无关紧要,要的是"模型能不能接着把话说完"。 */
const FAKE_TOOL_RESULT = '{"city":"北京","condition":"晴","temperatureC":24}';

// ── argv ────────────────────────────────────────────────────────────────────

interface Argv {
  dryRun: boolean;
  list: boolean;
  models: string[];
}

function usage(): never {
  console.error(`用法: tsx scripts/probe-tool-calling.ts [选项]

  --dry-run          只打印请求体,不发送(不花钱)
  --list             只列该端点认得的模型
  --models a,b,c     覆盖缺省候选模型表(逗号分隔)
  -h, --help         显示本帮助
`);
  process.exit(2);
}

function parseArgv(argv: string[]): Argv {
  const out: Argv = { dryRun: false, list: false, models: DEFAULT_MODELS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') usage();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--list') out.list = true;
    else if (a === '--models') {
      const v = argv[++i];
      if (!v) usage();
      out.models = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      console.error(`未知参数:${a}`);
      usage();
    }
  }
  return out;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

interface ProbeResult {
  model: string;
  httpStatus: number | null;
  /** round 1 是否回了 tool_calls。 */
  toolCallReturned: boolean;
  toolName?: string;
  toolArgs?: string;
  /** round 2 是否给出了最终自然语言答复。 */
  loopCompleted: boolean;
  finalText?: string;
  latencyMs: number;
  /** 失败原因(fetch 异常 / HTTP 错误 / 解析异常)。 */
  error?: string;
  raw?: unknown;
}

/**
 * 只重试连接阶段错误(与 qwen-image-makeup.ts 同一判据):
 * 整体超时**刻意不重试**——请求可能已经到达服务端并计费。
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
    if (cur.name === 'TimeoutError') return false; // 整体超时不重试
    cur = cur.cause;
  }
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  attempts = 3,
): Promise<{ status: number; json: unknown }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = { _unparsed: text.slice(0, 2000) };
      }
      return { status: res.status, json };
    } catch (err) {
      if (attempt < attempts && isConnectPhaseError(err)) {
        const wait = 500 * attempt;
        console.warn(`  · 连接阶段错误,${wait}ms 后重试(${attempt}/${attempts - 1})`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

// ── 探针主体 ────────────────────────────────────────────────────────────────

/** 从响应里把 choices[0].message 掏出来;拿不到就返回 undefined。 */
function firstMessage(json: unknown): Record<string, unknown> | undefined {
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const msg = (choices[0] as { message?: unknown }).message;
  return msg && typeof msg === 'object' ? (msg as Record<string, unknown>) : undefined;
}

/** 错误响应体的可读描述(百炼错误体形状不定,尽量兜)。 */
function describeApiError(status: number, json: unknown): string {
  const j = json as { error?: { message?: string; code?: string }; message?: string };
  const detail = j?.error?.message ?? j?.message ?? JSON.stringify(json).slice(0, 300);
  const code = j?.error?.code ? ` [${j.error.code}]` : '';
  return `HTTP ${status}${code}: ${detail}`;
}

async function probeModel(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<ProbeResult> {
  const url = `${baseUrl}/chat/completions`;
  const started = Date.now();
  const result: ProbeResult = {
    model,
    httpStatus: null,
    toolCallReturned: false,
    loopCompleted: false,
    latencyMs: 0,
  };

  try {
    // ── round 1:应该回 tool_calls ──
    const round1 = await postJson(url, apiKey, {
      model,
      messages: [{ role: 'user', content: USER_TURN_1 }],
      tools: TOOLS,
      tool_choice: 'auto',
    });
    result.httpStatus = round1.status;
    result.raw = round1.json;

    if (round1.status !== 200) {
      result.error = describeApiError(round1.status, round1.json);
      result.latencyMs = Date.now() - started;
      return result;
    }

    const msg1 = firstMessage(round1.json);
    const toolCalls = msg1?.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      // 200 但没回工具调用 —— 这是"不支持"最典型的形态:模型自己在正文里瞎编答案。
      const content = typeof msg1?.content === 'string' ? msg1.content.slice(0, 120) : '';
      result.error = `未返回 tool_calls(模型直接作答:${content || '空'})`;
      result.latencyMs = Date.now() - started;
      return result;
    }

    result.toolCallReturned = true;
    const call = toolCalls[0] as {
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    result.toolName = call.function?.name;
    result.toolArgs = call.function?.arguments;

    // ── round 2:把工具结果回填,看能不能把话说完 ──
    const round2 = await postJson(url, apiKey, {
      model,
      messages: [
        { role: 'user', content: USER_TURN_1 },
        { role: 'assistant', content: msg1?.content ?? null, tool_calls: toolCalls },
        { role: 'tool', tool_call_id: call.id, content: FAKE_TOOL_RESULT },
      ],
      tools: TOOLS,
    });

    if (round2.status === 200) {
      const msg2 = firstMessage(round2.json);
      const text = typeof msg2?.content === 'string' ? msg2.content : '';
      if (text.trim()) {
        result.loopCompleted = true;
        result.finalText = text.trim();
      } else {
        result.error = 'round 2 未给出最终答复(回合未收束)';
      }
    } else {
      result.error = `round 2 ${describeApiError(round2.status, round2.json)}`;
    }
  } catch (err) {
    result.error = `请求异常:${err instanceof Error ? err.message : String(err)}`;
  }

  result.latencyMs = Date.now() - started;
  return result;
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

async function listModels(baseUrl: string, apiKey: string): Promise<void> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status !== 200) {
    console.log(`GET /models → HTTP ${res.status}`);
    console.log(text.slice(0, 800));
    return;
  }
  let ids: string[] = [];
  try {
    const json = JSON.parse(text) as { data?: { id?: string }[] };
    ids = (json.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  } catch {
    console.log('响应不是 JSON,原文:');
    console.log(text.slice(0, 800));
    return;
  }
  console.log(`GET /models → HTTP 200,共 ${ids.length} 个:`);
  for (const id of ids.sort()) console.log(`  ${id}`);
}

async function main(): Promise<void> {
  loadDotEnvIfPresent(path.join(import.meta.dirname, '..', '.env'));

  const apiKey = process.env.DASHSCOPE_API_KEY;
  const apiHost = process.env.DASHSCOPE_API_HOST ?? DEFAULT_API_HOST;
  const baseUrl = `${apiHost}/compatible-mode/v1`;
  const argv = parseArgv(process.argv.slice(2));

  console.log(`端点  ${baseUrl}`);
  console.log(`Key   ${apiKey ? `已提供(长度 ${apiKey.length})` : '缺失 → 见 .env 的 DASHSCOPE_API_KEY'}`);
  console.log('');

  if (!apiKey) process.exit(1);

  if (argv.list) {
    await listModels(baseUrl, apiKey);
    return;
  }

  if (argv.dryRun) {
    console.log('--dry-run:请求体(未发送)');
    console.log(
      JSON.stringify(
        {
          url: `${baseUrl}/chat/completions`,
          model: `(逐个替换为:${argv.models.join(' | ')})`,
          messages: [{ role: 'user', content: USER_TURN_1 }],
          tools: TOOLS,
          tool_choice: 'auto',
        },
        null,
        2,
      ),
    );
    return;
  }

  const results: ProbeResult[] = [];
  for (const model of argv.models) {
    console.log(`── ${model} ──`);
    const r = await probeModel(baseUrl, apiKey, model);
    results.push(r);
    const verdict = r.loopCompleted
      ? '✅ 能跑完整 agent 循环'
      : r.toolCallReturned
        ? '⚠️ 回了 tool_calls,但回合没走完'
        : '❌ 不支持';
    console.log(`   ${verdict}  (${r.latencyMs}ms)`);
    if (r.toolName) console.log(`   工具调用 → ${r.toolName}(${r.toolArgs ?? ''})`);
    if (r.finalText) console.log(`   最终答复 → ${r.finalText.slice(0, 120)}`);
    if (r.error) console.log(`   原因 → ${r.error}`);
    console.log('');
  }

  // 落夹具:原始响应 + 汇总。有了它,以后不用重复烧这次调用。
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const summary = {
    probedAt: new Date().toISOString(),
    baseUrl,
    userTurn1: USER_TURN_1,
    tools: TOOLS,
    results,
  };
  const file = path.join(OUT_DIR, `${stamp}-summary.json`);
  writeFileSync(file, JSON.stringify(summary, null, 2), 'utf8');

  console.log('── 汇总 ──');
  for (const r of results) {
    const mark = r.loopCompleted ? '✅' : r.toolCallReturned ? '⚠️ ' : '❌';
    console.log(`${mark} ${r.model.padEnd(16)} ${r.error ?? 'OK'}`);
  }
  console.log(`\n夹具已写入 ${file}`);

  // 退出码:只要有一个模型能跑完整循环就算过(接缝成立)。
  process.exit(results.some((r) => r.loopCompleted) ? 0 : 1);
}

main().catch((err) => {
  console.error('未捕获异常:', err);
  process.exit(1);
});
