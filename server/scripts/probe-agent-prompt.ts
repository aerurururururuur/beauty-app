/**
 * scripts/probe-agent-prompt.ts —— 【实验脚本,不在服务运行路径上】
 *
 * 用途:回答**一个问题**——system 提示词里的哪一句,把工具调用整体压掉了?
 *
 * 背景(`docs/plan/makeup-agent-design.md` §14.1,2026-09-16 那条待办):
 * 真模型(`AGENT_LLM=real`(当时写作 `dashscope`) + `qwen-plus`)在真会话里**一个工具都不调**,
 * 把整套妆面用散文写出来,于是 `brief` / `lookSpec` 全空 ⇒ 界面那条出图入口
 * 根本摆不出来 ⇒ **用户拿不到图**。当时用单变量对照定位到**规则 3 的后半句**
 * 「不知道就用一句话问清楚」,但**每个变体只跑了 1 次**,采样不确定。
 *
 * 所以本脚本做的是那一轮验证的**可重复版本**:同一句用户原话、同一批工具、
 * 只换 system 提示词的**一处**文字,重复 N 次,把结果记下来。
 *
 * ★★ **它跑的是真循环 + 真工具,不是"问模型会不会调工具"。**
 *   这一点是刻意的:【工具被调用了】只是**代理指标**,真正要的是
 *   **会话里落下一份合法的 `lookSpec`**(§7.4.3 的链:没有它就没有出图入口)。
 *   两者会分开——实测里就出现过这一类:模型调了 `propose_look`,
 *   但它同时把猜出来的 `skinTone` 写进了 `brief`,而**按肤色收窄的校验器**
 *   (§6 规矩 4)会把那一版妆面整个打回。**只数 `tool_calls` 是看不出这件事的。**
 *   所以这里用 `AgentLoop` + `createToolRegistry` 走真的分发与校验,记的是
 *   `lookSpec` 落没落、工具报没报错、`brief` 填了什么。
 *
 * ⚠️ **它花钱**(每次一批模型调用),不是 CI 的一部分。产物落在
 *   `out/probe-agent-prompt/<时间戳>/`,**是夹具不是日志**。
 *
 * 用法:
 *   npx tsx scripts/probe-agent-prompt.ts --dry-run                 # 只打印请求概要,不发送、不花钱
 *   npx tsx scripts/probe-agent-prompt.ts --variant all --reps 3    # 跑全部变体,各 3 次
 *   npx tsx scripts/probe-agent-prompt.ts --variant v12a --reps 3
 *   npx tsx scripts/probe-agent-prompt.ts --reps 3 --no-products    # 不注册产品工具(4 个工具那档)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AgentLoop,
  DashScopeLlm,
  appendMessages,
  buildSystemPrompt,
  createSession,
  createToolRegistry,
  textMessage,
  type Llm,
  type LlmRequest,
  type LlmResponse,
  type Session,
} from '../src/modules/agent/index.js';
import {
  loadConfig,
  loadDotEnvIfPresent,
  readDashScopeApiKey,
} from '../src/modules/shared/infrastructure/config.js';

/**
 * 用户那一句。★ **逐字取自 2026-09-16 真机实测**(§14.1):
 * 它有"场合 + 肤色 + 肤质"三样,而肤色说的是**含糊的「偏深」**——
 * 那正是规则 3 把整轮吃掉的那个形状。**不要"改得更清楚一点"**,那就换了实验条件。
 */
const USER_TURN = '我下周有个面试，肤色偏深、混油皮，帮我看看画什么妆';

/**
 * 规则 3 那一段(从 `3.` 到下一个编号规则之前)。
 *
 * ★ **按结构找,不按原文找**:`v12` 之后提示词里已经没有那句老话了,
 *   若还按字面匹配,脚本会在**代码改动的当天**变成一句"找不到"就退出——
 *   而它恰恰是改动之后最该还能跑的那个东西(要能回头比"改前/改后")。
 *   找不到时**会抛**(静默测同一个东西比跑失败更坏,§9 后记①那个教训)。
 */
const RULE3_BLOCK = /^3\. \*\*肤色不许猜。\*\*[\s\S]*?(?=^4\. )/m;

/**
 * `v11` 的规则 3 **原文**。留着它才有"改前/改后"这一对——
 * `v11` 变体的意思就是"把这一条还原回去",其余一字不动。
 */
const RULE3_V11 = '3. **肤色不许猜。** 猜错会让整套配色走偏。不知道就用一句话问清楚。\n';

/** 候选改法的共用前半句(「不许猜」要保住,它挨着红线 §13-3)。 */
const RULE3_HEAD = '3. **肤色不许猜。** 猜错会让整套配色走偏——';

/**
 * 变体表。**每一个变体只改规则 3 那一条**,别的一字不动。
 *
 * - `current` = 代码里现在这一版(缺省基线)
 * - `v11`     = 把规则 3 还原成 `v11` 的原文(改前/改后那一对)
 * - `v12a`    = "+问的同时把该做的做完"
 * - `v12b`    = `v12a` +**点名「偏深」不算说清楚**(实测把模型顶回只反问,未采用)
 * - `v12c`    = 只把后半句从"问清楚"改成"记下来"
 * - `v12d`    = ★ **v12 采用的那一版**(+ "妆面不需要肤色" + 肤色显式留空)
 *
 * ⚠️ 变体文本**故意在这里各留一份**:`v12` 采用 `v12d` 之后,`v12a`/`v12b`/`v12c`
 *   在代码里就不存在了,而它们是"为什么没选它"的证据。删掉它们,那段结论就没法复算。
 */
const VARIANTS: Record<string, (prompt: string) => string> = {
  current: (prompt) => prompt,

  v11: (prompt) => replaceRule3(prompt, RULE3_V11),

  v12a: (prompt) =>
    replaceRule3(
      prompt,
      [
        RULE3_HEAD,
        '所以 `patch_brief` 的 `skinTone` 只在她说清楚是哪一档时才填。',
        '★ **但"问"不等于"这一轮只问"**:缺一项就先问这一项,**同时把这一轮该做的做完**——',
        '她这一轮说过的一切(场合、肤质、穿搭、原话)先用 `patch_brief` 记进状态,',
        '再按已知信息用 `propose_look` 出一版妆面讲给她听(肤色那一格**空着就空着**),',
        '她回答之后再改。★ **不许因为缺一项就把整轮用来反问**:那样这一轮什么都没落进状态,',
        '用户手上也不会多出任何东西。',
      ].join('\n'),
    ),

  v12b: (prompt) =>
    replaceRule3(
      prompt,
      [
        RULE3_HEAD,
        '所以 `patch_brief` 的 `skinTone` 只在她说清楚是哪一档时才填,**含糊的说法不算说清楚**',
        '(「偏深」是 `tan` 还是 `deep` 仍不知道,那时就该问)。',
        '★ **但"问"不等于"这一轮只问"**:缺一项就先问这一项,**同时把这一轮该做的做完**——',
        '她这一轮说过的一切(场合、肤质、穿搭、原话)先用 `patch_brief` 记进状态,',
        '再按已知信息用 `propose_look` 出一版妆面讲给她听(肤色那一格**空着就空着**),',
        '她回答之后再改。★ **不许因为缺一项就把整轮用来反问**:那样这一轮什么都没落进状态,',
        '用户手上也不会多出任何东西。',
      ].join('\n'),
    ),

  v12c: (prompt) =>
    replaceRule3(
      prompt,
      [
        RULE3_HEAD,
        '所以 `patch_brief` 的 `skinTone` 只在她说清楚是哪一档时才填。',
        '不确定时**照常往下走**:她说过的一切先用 `patch_brief` 记下,',
        '再按已知信息用 `propose_look` 出一版妆面,把缺的那一项**顺口**问一句。',
      ].join('\n'),
    ),

  v12d: (prompt) =>
    replaceRule3(
      prompt,
      [
        RULE3_HEAD,
        '所以 `patch_brief` 的 `skinTone` 只有她**自己说出是哪一档**时才填;',
        '说不清是哪一档的(如「偏深」)**留空,别替她定**。缺的那一项要在回复里问一句。',
        '★ **但"问"不占用这一轮**:**妆面本身不需要肤色**——`propose_look` 里根本没有这个字段,',
        '所以这一轮该做的是:先把她说过的记下(`patch_brief`,肤色留空),',
        '再按已知信息出一版妆面(`propose_look`),最后在正文里问缺的那一项。',
        '她答了之后再记一次肤色,需要就改一版妆面。',
        '★ **不许因为缺一项就把整轮用来反问**——那样这一轮什么都没落进状态,',
        '用户手上也不会多出任何东西。',
      ].join('\n'),
    ),
};

function replaceRule3(prompt: string, next: string): string {
  if (!RULE3_BLOCK.test(prompt)) {
    throw new Error(
      '提示里找不到规则 3(形状应为「3. **肤色不许猜。** …」且后面紧跟 4.)——' +
        '提示词结构变了,本脚本的替换前提失效了',
    );
  }
  // ★ 原块**带**结尾那个换行(它到 `4.` 之前为止),所以替换的文本也补一个,
  //   否则规则 3 的末行会和规则 4 挤成同一行。
  return prompt.replace(RULE3_BLOCK, next.endsWith('\n') ? next : `${next}\n`);
}

// ── argv ────────────────────────────────────────────────────────────────────

interface Argv {
  dryRun: boolean;
  variants: string[];
  reps: number;
  products: boolean;
  /** `--verify <变体>`:**不发送任何请求**,只核对"代码里现在这一段 == 当时测的那一段"。 */
  verify?: string;
}

function usage(): never {
  console.error(`用法: tsx scripts/probe-agent-prompt.ts [选项]

  --dry-run          只打印请求概要,不发送(不花钱)
  --variant a,b      跑哪些变体(缺省 all):${Object.keys(VARIANTS).join(' / ')}
  --reps N           每个变体跑几次(缺省 3)
  --no-products      按"没有产品库"发(4 个工具那档)
  --verify <变体>    ★ 发一个字节都不发:核对"代码里现在这一段"与"该变体当时测的那一段"是否逐字相同
                     (用来钉住"发出去的就是实测过的那一份",改动后、花钱前先跑它)
  -h, --help         显示本帮助
`);
  process.exit(2);
}

function parseArgv(argv: string[]): Argv {
  const out: Argv = {
    dryRun: false,
    variants: Object.keys(VARIANTS),
    reps: 3,
    products: true,
    verify: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') usage();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-products') out.products = false;
    else if (a === '--verify') {
      const v = argv[++i];
      if (!v) usage();
      out.verify = v;
      if (!(v in VARIANTS)) {
        console.error(`未知变体:${v}`);
        usage();
      }
    } else if (a === '--variant') {
      const v = argv[++i];
      if (!v) usage();
      if (v !== 'all') {
        out.variants = v.split(',').map((s) => s.trim()).filter(Boolean);
        for (const name of out.variants) {
          if (!(name in VARIANTS)) {
            console.error(`未知变体:${name}`);
            usage();
          }
        }
      }
    } else if (a === '--reps') {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1) usage();
      out.reps = v;
    } else {
      console.error(`未知参数:${a}`);
      usage();
    }
  }
  return out;
}

// ── 把真 LLM 包一层:每次调用只换 system 提示词 ──────────────────────────────
//
// ★ 这样循环、工具分发、校验器**全是线上那一套**;被换掉的只有实验变量。
//   `AgentLoop` 每轮自己调 `buildSystemPrompt`,所以这里拿到的是**真机那份**。

class PromptSwapLlm implements Llm {
  readonly name: string;

  constructor(
    private readonly inner: Llm,
    private readonly swap: (system: string | undefined) => string | undefined,
  ) {
    this.name = `probe:${inner.name}`;
  }

  chat(request: LlmRequest): Promise<LlmResponse> {
    return this.inner.chat({ ...request, system: this.swap(request.system) });
  }
}

// ── 空依赖:本实验只跑"聊需求 → 出妆面"那一步,不碰衣橱、不碰出图 ────────────
//
// ⚠️ 它们**不是"随便糊一个"**:没有它们就装配不出真注册表,而注册表就是
//   提示词里那份免费工具名单的出处(`hasProducts` 也是从它现算的)。

const noopCosmetics = { listByUser: async () => [] };

const neverUsedEngine = {
  name: 'probe-noop',
  generate: async () => {
    throw new Error('probe 不该走到出图这一步');
  },
};

const fakeArtifacts = {
  putFace: async () => {
    throw new Error('probe 不该走到传照片这一步');
  },
  resolveFace: async () => {
    throw new Error('probe 不该走到解析照片这一步');
  },
  putRender: async () => {
    throw new Error('probe 不该走到出图这一步');
  },
  readRender: async () => null,
  removeAll: async () => {},
  listStored: async () => [],
};

const fakeProducts = {
  overview: () => ({
    name: 'probe',
    brand: 'probe',
    categories: [],
    matchingGuide: { columns: [], rows: [] },
    notes: [],
    products: [],
  }),
  find: () => undefined,
};

// ── 跑一个变体 ──────────────────────────────────────────────────────────────

interface Observation {
  variant: string;
  rep: number;
  stopReason: string;
  /** ★ 因变量:会话里到底有没有落下一份妆面单。 */
  hasLookSpec: boolean;
  /** 记下来的 `brief`(`skinTone` 是不是猜出来的,看这里)。 */
  brief: unknown;
  /** 这一次到底做了什么:工具名 + 成没成。 */
  toolCalls: { name: string; isError: boolean; resultHead: string }[];
  /** 模型这一轮的正文(收尾那句)。 */
  textHead: string;
  inputTokens: number;
  outputTokens: number;
}

async function runOnce(
  variant: string,
  rep: number,
  llm: Llm,
  tools: ReturnType<typeof createToolRegistry>,
  outDir: string,
): Promise<Observation> {
  const loop = new AgentLoop({ llm, tools });
  let session: Session = createSession(`probe-${variant}-${rep}`, 'probe-user');
  const result = await loop.run(session, USER_TURN);
  session = result.session;

  const nameOf = new Map<string, string>();
  for (const m of session.messages) {
    for (const b of m.content) if (b.type === 'tool_use') nameOf.set(b.id, b.name);
  }
  const toolCalls: Observation['toolCalls'] = [];
  for (const m of session.messages) {
    for (const b of m.content) {
      if (b.type !== 'tool_result') continue;
      toolCalls.push({
        name: nameOf.get(b.toolUseId) ?? '?',
        isError: b.isError === true,
        resultHead: b.content.slice(0, 120).replace(/\n/g, ' '),
      });
    }
  }

  const text = result.events
    .filter((e) => e.type === 'text_delta')
    .map((e) => (e.type === 'text_delta' ? e.text : ''))
    .join('');

  const obs: Observation = {
    variant,
    rep,
    stopReason: result.stopReason,
    hasLookSpec: session.lookSpec !== undefined,
    brief: session.brief,
    toolCalls,
    textHead: text.slice(0, 100).replace(/\n/g, ' '),
    inputTokens: 0,
    outputTokens: 0,
  };
  writeFileSync(
    path.join(outDir, `${variant}-${rep}.json`),
    JSON.stringify({ obs, messages: session.messages }, null, 2),
  );
  return obs;
}

async function main(): Promise<void> {
  const argv = parseArgv(process.argv.slice(2));
  loadDotEnvIfPresent(path.join(import.meta.dirname, '..', '.env'));
  const config = loadConfig();

  const session = appendMessages(createSession('probe', 'probe-user'), [
    textMessage('user', USER_TURN),
  ]);
  const base = buildSystemPrompt(session, { hasProducts: argv.products });
  const tools = createToolRegistry({
    cosmetics: noopCosmetics,
    engine: neverUsedEngine,
    artifacts: fakeArtifacts,
    maxRenders: 3,
    ...(argv.products ? { products: fakeProducts } : {}),
  });

  console.log(`端点:${config.agentBaseUrl}`);
  console.log(`模型:${config.agentModel}`);
  console.log(`工具:${[...tools.keys()].join(' / ')}`);
  console.log(`用户:${USER_TURN}`);
  console.log(`system 长度:${base.length}(v11 基线)`);
  for (const name of argv.variants) {
    console.log(`  变体 ${name}:${VARIANTS[name]!(base).length} 字`);
  }

  // ── --verify:一次调用都不发,只核对"发出去的 == 实测过的那一份" ────────────
  //
  // ★ 这一格的存在理由就是本项目那条判据:**长度一致即同一份**(§14.1 那条实测记录)。
  //   `v12` 采用 `v12d` 之后,"代码里这段 ≠ 当时测的那段"是个**静默**的错——
  //   提示词肉眼看着差不多,而实测结论其实已经不适用了。所以它得能被机器核对,
  //   而且必须**免费**(花钱才能确认,人就不会去确认)。
  if (argv.verify) {
    // 两边都**只取规则 3 那一段**再比:整个 prompt 相比毫无意义(它必然不同)。
    const want = RULE3_BLOCK.exec(VARIANTS[argv.verify]!(base))?.[0] ?? '(取不到)';
    const shipped = RULE3_BLOCK.exec(base)?.[0] ?? '(取不到)';
    if (shipped === want) {
      console.log(`\n✅ --verify ${argv.verify}:代码里现在这一段与当时测的那一段**逐字相同**。`);
      return;
    }
    console.error(`\n❌ --verify ${argv.verify}:不一致。`);
    console.error(`现在发出去的(${shipped.length} 字):\n${shipped}`);
    console.error(`当时测的(${want.length} 字):\n${want}`);
    process.exit(1);
  }

  if (argv.dryRun) {
    console.log('\n--dry-run:不发送。');
    return;
  }

  const llm = new DashScopeLlm({
    // ★ key 从 `readDashScopeApiKey()` 取,不在 `ServerConfig` 上(见那里的注释)。
    apiKey: readDashScopeApiKey(),
    baseUrl: config.agentBaseUrl,
    model: config.agentModel,
    timeoutMs: 60_000,
  });

  const outDir = path.join(
    import.meta.dirname,
    '..',
    'out',
    'probe-agent-prompt',
    new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
  );
  mkdirSync(outDir, { recursive: true });

  const observations: Observation[] = [];
  for (const name of argv.variants) {
    const swap = (system: string | undefined): string | undefined =>
      system === undefined ? undefined : VARIANTS[name]!(system);
    const swapped = new PromptSwapLlm(llm, swap);
    for (let rep = 1; rep <= argv.reps; rep++) {
      process.stdout.write(`[${name} #${rep}] … `);
      const obs = await runOnce(name, rep, swapped, tools, outDir);
      observations.push(obs);
      const calls = obs.toolCalls.map((c) => `${c.name}${c.isError ? '✗' : '✓'}`).join(',');
      console.log(
        `lookSpec:${obs.hasLookSpec ? '有' : '空'} | stop=${obs.stopReason} | ` +
          `brief=${JSON.stringify(obs.brief)} | 工具:${calls || '(一个都没调)'}`,
      );
    }
  }

  writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify({ userTurn: USER_TURN, agentModel: config.agentModel, observations }, null, 2),
  );

  // ── 汇总:每个变体"落下一份妆面"的命中率 ──
  console.log('\n变体          有 lookSpec   工具被调过');
  for (const name of argv.variants) {
    const rows = observations.filter((o) => o.variant === name);
    const withLook = rows.filter((o) => o.hasLookSpec).length;
    const withTools = rows.filter((o) => o.toolCalls.length > 0).length;
    console.log(
      `${name.padEnd(12)}  ${String(withLook).padStart(2)}/${rows.length}` +
        `${' '.repeat(9)}${String(withTools).padStart(2)}/${rows.length}`,
    );
  }
  console.log(`\n产物:${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
