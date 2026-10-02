/**
 * agent-loop 状态机单测:用脚本化的 mock LLM 驱动 harness,不联网、不烧钱。
 *
 * ★ §11 把这一组称为「**这一层唯一真正的风险控制**」——LLM 的行为不可测,
 *   但**循环的骨架可测**:把不确定性关在 `llm.ts` 端口里,外面全是确定的。
 *
 * 下面每个用例对应 `agent-loop.ts` 文件头的一条不变量,编号照抄那里:
 *   [A] assistant 那一轮原样回填   [B] 每个 tool_use 都配一个 tool_result
 *   [C] 同轮结果装进同一条 user 消息 [D] 工具错误转 observation,不抛穿
 *   [E] 未知工具名也要回结果        [F] 迭代上限与超时
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import {
  AgentLoop,
  DEFAULT_MAX_ITERATIONS,
  LlmUnavailableError,
  TextBlock,
  ToolUseBlock,
  appendMessages,
  createSession,
  indexTools,
  patchBrief,
  setLookSpec,
  textMessage,
} from '../src/modules/agent/index.js';
import {
  MockLlm,
  mockText,
  mockTextAndToolCalls,
  mockToolCall,
} from './helpers/mock-llm.js';
import { BrowSpec, LookSpec, LookSpecBase, ZoneSpec } from '../src/modules/makeup/index.js';
import type {
  AgentLoopOptions,
  Llm,
  LlmRequest,
  LlmResponse,
  LlmToolDefinition,
  Session,
  Tool,
  ToolContext,
  ToolOutcome,
} from '../src/modules/agent/index.js';
import { realPalette } from './helpers/face-catalog.js';

// ── 测试替身 ─────────────────────────────────────────────────────────────────

function stubDefinition(name: string): LlmToolDefinition {
  return { name, description: `${name} 的测试用描述`, inputSchema: { type: 'object', properties: {} } };
}

/** 记录调用入参的工具;行为由构造时给的函数决定。 */
class RecordingTool implements Tool {
  readonly definition: LlmToolDefinition;
  readonly calls: unknown[] = [];

  constructor(name: string, private readonly fn: (input: unknown, ctx: ToolContext) => ToolOutcome | Promise<ToolOutcome>) {
    this.definition = stubDefinition(name);
  }

  async run(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
    this.calls.push(input);
    return this.fn(input, ctx);
  }
}

/** 永远抛的 LLM,用来验「连不上后台」那条收束分支。 */
class ThrowingLlm implements Llm {
  readonly name = 'throwing';
  calls = 0;
  async chat(_request: LlmRequest): Promise<LlmResponse> {
    this.calls++;
    throw new LlmUnavailableError('连不上');
  }
}

const SESSION = (): Session => createSession('s1', 'u1');

/** 造一个只装了给定工具的 loop。 */
function loopWith(
  script: readonly LlmResponse[],
  tools: readonly Tool[],
  extra: Partial<AgentLoopOptions> = {},
) {
  const llm = new MockLlm(script);
  const loop = new AgentLoop({ llm, tools: indexTools(tools), palette: realPalette(), ...extra });
  return { llm, loop };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 正常路径 ─────────────────────────────────────────────────────────────────

describe('单轮纯文字', () => {
  it('没有工具调用就结束:一次 LLM 往返、两条消息、原会话不被改动', async () => {
    const { llm, loop } = loopWith([mockText('明天面试的话,建议……')], []);
    const original = SESSION();

    const result = await loop.run(original, '明天面试');

    expect(result.stopReason).toBe('end_turn');
    expect(llm.requests).toHaveLength(1);
    expect(result.session.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(result.events).toEqual([
      { type: 'text_delta', text: '明天面试的话,建议……' },
      { type: 'turn_end', reason: 'end_turn', iterations: 1 },
    ]);
    // 纯函数:原会话不动。
    expect(original.messages).toHaveLength(0);
    expect(original.updatedAt).toBe(original.createdAt);
  });

  it('system 每轮现拼,且**不在 messages[] 里**(派生状态不存第二遍)', async () => {
    const { llm, loop } = loopWith([mockText('好')], []);
    await loop.run(SESSION(), '你好');

    expect(llm.requests[0]?.system).toBeTruthy();
    expect(llm.requests[0]?.messages.some((m) => m.role === 'system')).toBe(false);
  });

  it('拒答 / 截断被如实记进 stopReason,不假装成正常结束', async () => {
    const refuse = loopWith([{ content: [new TextBlock({ type: 'text', text: '抱歉' })], stopReason: 'refusal' }], []);
    expect((await refuse.loop.run(SESSION(), 'x')).stopReason).toBe('refusal');
  });

  /**
   * ★ 拒答**带话**与拒答**空手**是两件事,这一组是那个区别的证据。
   *   此前只有上面那条(带话),而空手那条会落成一个**空气泡**——
   *   用户看到一轮什么都没有,前端只好自己补一句兜底(现已删除)。
   */
  it('★ 拒答且一个字都没给 → 服务端补一句收束话,不是空气泡', async () => {
    const bare = loopWith([{ content: [], stopReason: 'refusal' }], []);
    const res = await bare.loop.run(SESSION(), 'x');

    expect(res.stopReason).toBe('refusal');
    // 会话里真的多了一条 assistant 正文(不是空串)。
    const texts = res.session.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content.filter((c) => c.type === 'text').map((c) => c.text).join(''))
      .filter(Boolean);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('拒答');
    // 同一句话也要经 `text_delta` 透给前端,否则前端拿到的还是空的。
    const deltas = res.events.filter((e) => e.type === 'text_delta');
    expect(deltas.map((e) => (e.type === 'text_delta' ? e.text : ''))).toEqual(texts);
    expect(res.events.at(-1)).toEqual({ type: 'turn_end', reason: 'refusal', iterations: 1 });
  });

  it('★ 拒答但模型自己说了话 → **不许**再补第二句(不在它嘴上说话)', async () => {
    const spoke = loopWith([{ content: [new TextBlock({ type: 'text', text: '这个我不能帮你做。' })], stopReason: 'refusal' }], []);
    const res = await spoke.loop.run(SESSION(), 'x');

    expect(res.stopReason).toBe('refusal');
    const texts = res.session.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content.filter((c) => c.type === 'text').map((c) => c.text).join(''))
      .filter(Boolean);
    expect(texts).toEqual(['这个我不能帮你做。']);
  });
});

// ── [A] assistant 原样回填 ───────────────────────────────────────────────────

describe('[A] assistant 那一轮原样回填', () => {
  it('第二次请求里带着与产出**逐字相同**的 tool_use 块', async () => {
    const tool = new RecordingTool('do_thing', () => ({ content: '做完了' }));
    const call = new ToolUseBlock({ type: 'tool_use', id: 'call_1', name: 'do_thing', input: { a: 1 } });
    const { llm, loop } = loopWith(
      [{ content: [call], stopReason: 'tool_use' }, mockText('好了')],
      [tool],
    );

    await loop.run(SESSION(), '帮我做');

    const second = llm.requests[1];
    expect(second?.messages).toHaveLength(3);
    expect(second?.messages[1]).toEqual({ role: 'assistant', content: [call] });
  });
});

// ── [B][C] 结果回填的形状 ────────────────────────────────────────────────────

describe('[B][C] 工具结果回填', () => {
  it('同一轮的两个结果装进**同一条** user 消息(拆多条会教模型放弃并行调用)', async () => {
    const a = new RecordingTool('a', () => ({ content: 'A 完成' }));
    const b = new RecordingTool('b', () => ({ content: 'B 完成' }));
    const { loop } = loopWith(
      [
        mockTextAndToolCalls('我先查两样', [
          new ToolUseBlock({ type: 'tool_use', id: 'c1', name: 'a', input: {} }),
          new ToolUseBlock({ type: 'tool_use', id: 'c2', name: 'b', input: {} }),
        ]),
        mockText('查完了'),
      ],
      [a, b],
    );

    const result = await loop.run(SESSION(), 'go');

    expect(result.session.messages).toHaveLength(4);
    const results = result.session.messages[2];
    expect(results?.role).toBe('user');
    expect(results?.content).toEqual([
      { type: 'tool_result', toolUseId: 'c1', content: 'A 完成' },
      { type: 'tool_result', toolUseId: 'c2', content: 'B 完成' },
    ]);
  });

  it('同轮多个工具按顺序叠加副作用:后一个看得到前一个改过的会话', async () => {
    const write = new RecordingTool('write', (_input, ctx) => ({
      content: '已记下场合',
      session: patchBrief(ctx.session, { occasion: 'interview' }),
    }));
    const read = new RecordingTool('read', (_input, ctx) => ({
      content: `读到的场合=${ctx.session.brief.occasion ?? '无'}`,
    }));
    const { loop } = loopWith(
      [
        mockTextAndToolCalls('', [
          new ToolUseBlock({ type: 'tool_use', id: 'c1', name: 'write', input: {} }),
          new ToolUseBlock({ type: 'tool_use', id: 'c2', name: 'read', input: {} }),
        ]),
        mockText('好'),
      ],
      [write, read],
    );

    const result = await loop.run(SESSION(), 'go');

    expect(result.session.messages[2]?.content[1]).toMatchObject({
      toolUseId: 'c2',
      content: '读到的场合=interview',
    });
  });

  it('终止判据以「有没有 tool_use 块」为准,不看 stopReason', async () => {
    // 块在、stopReason 却说 end_turn —— 这种不一致下直接结束,下一轮必 400。
    const tool = new RecordingTool('t', () => ({ content: 'ok' }));
    const { llm, loop } = loopWith(
      [
        {
          content: [new ToolUseBlock({ type: 'tool_use', id: 'c1', name: 't', input: {} })],
          stopReason: 'end_turn',
        },
        mockText('收尾'),
      ],
      [tool],
    );

    const result = await loop.run(SESSION(), 'go');

    expect(llm.requests).toHaveLength(2);
    expect(result.stopReason).toBe('end_turn');
    expect(result.session.messages).toHaveLength(4);
  });
});

// ── [D][E] 故障与越界 ────────────────────────────────────────────────────────

describe('[D] 工具失败不抛穿循环', () => {
  it('isError 观察喂回模型,循环继续', async () => {
    const boom = new RecordingTool('boom', () => ({ content: '这次没成功', isError: true }));
    const { llm, loop } = loopWith(
      [mockToolCall('c1', 'boom', {}), mockText('那我换个方式')],
      [boom],
    );

    const result = await loop.run(SESSION(), '试一下');

    expect(result.stopReason).toBe('end_turn');
    expect(llm.requests).toHaveLength(2);
    expect(result.session.messages[2]?.content[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'c1',
      isError: true,
    });
  });

  it('工具抛 AppError 时消息原样回填(那是写给模型看的 prompt)', async () => {
    const thrower = new RecordingTool('thrower', () => {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '妆面单不合法:tone 取值「x」不合法;可用:rose / coral');
    });
    const { loop } = loopWith([mockToolCall('c1', 'thrower', {}), mockText('改一下')], [thrower]);

    const result = await loop.run(SESSION(), 'go');

    expect(result.session.messages[2]?.content[0]).toMatchObject({
      isError: true,
      content: '妆面单不合法:tone 取值「x」不合法;可用:rose / coral',
    });
  });

  it('工具抛非 AppError 时**不把内部细节喂给模型**,只进日志', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thrower = new RecordingTool('thrower', () => {
      throw new Error('ECONNREFUSED 10.0.0.7:6379');
    });
    const { loop } = loopWith([mockToolCall('c1', 'thrower', {}), mockText('嗯')], [thrower]);

    const result = await loop.run(SESSION(), 'go');
    const content = (result.session.messages[2]?.content[0] as { content: string }).content;

    expect(content).not.toContain('ECONNREFUSED');
    expect(content).toContain('内部错误');
    expect(warn).toHaveBeenCalled();
  });
});

describe('[E] 模型编工具名', () => {
  it('照样回一条 tool_result,并列出可用工具(不说清它还会再编一个)', async () => {
    const known = new RecordingTool('patch_brief', () => ({ content: 'ok' }));
    const { llm, loop } = loopWith([mockToolCall('c1', 'patch_breif', {}), mockText('抱歉')], [known]);

    const result = await loop.run(SESSION(), 'go');
    const block = result.session.messages[2]?.content[0] as { content: string; isError?: boolean };

    expect(block.isError).toBe(true);
    expect(block.content).toContain('patch_breif');
    expect(block.content).toContain('patch_brief');
    // 关键:没有静默丢弃 —— 仍然欠了并还了这一条,所以能继续第二轮。
    expect(llm.requests).toHaveLength(2);
  });

  it('入参不是合法 JSON(adapter 原样交上来的字符串)时直说,且不执行工具', async () => {
    const tool = new RecordingTool('t', () => ({ content: '不该被调用' }));
    const { loop } = loopWith([mockToolCall('c1', 't', '{"tone":'), mockText('重来')], [tool]);

    const result = await loop.run(SESSION(), 'go');
    const block = result.session.messages[2]?.content[0] as { content: string; isError?: boolean };

    expect(block.isError).toBe(true);
    expect(block.content).toContain('不是合法 JSON');
    expect(tool.calls).toHaveLength(0);
  });
});

// ── [F] 护栏 ─────────────────────────────────────────────────────────────────

describe('[F] 迭代上限 / 超时 / 上游不可达', () => {
  it('撞上迭代上限时收束成一句话,不抛错', async () => {
    const tool = new RecordingTool('t', () => ({ content: '再想想' }));
    const script = Array.from({ length: DEFAULT_MAX_ITERATIONS }, (_v, i) => mockToolCall(`c${i}`, 't', {}));
    const { llm, loop } = loopWith(script, [tool], { maxIterations: 3 });

    const result = await loop.run(SESSION(), 'go');

    expect(result.stopReason).toBe('max_iterations');
    // 预算被守住:只调了 3 次,不是脚本长度。
    expect(llm.requests).toHaveLength(3);
    // user + (assistant + results) × 3 + 收束语
    expect(result.session.messages).toHaveLength(8);
    expect(result.events.at(-1)).toEqual({ type: 'turn_end', reason: 'max_iterations', iterations: 3 });
    // 收束语必须点明下一步,不能只说"到上限了"。
    expect(result.session.messages.at(-1)?.content[0]).toMatchObject({
      text: expect.stringContaining('具体一点'),
    });
  });

  it('超时在下一轮开头被拦下', async () => {
    const tool = new RecordingTool('t', () => ({ content: 'ok' }));
    const llm = new MockLlm([mockToolCall('c1', 't', {}), mockText('不该走到这')]);
    // 时钟注入:deadline 计算与第 1 轮用 0,第 2 轮直接跳到远超 deadline 的时刻。
    const times = [0, 0, 1_000_000];
    let i = 0;
    const loop = new AgentLoop({
      llm,
      tools: indexTools([tool]),
      palette: realPalette(),
      turnTimeoutMs: 1000,
      now: () => times[Math.min(i++, times.length - 1)] ?? 0,
    });

    const result = await loop.run(SESSION(), 'go');

    expect(result.stopReason).toBe('timeout');
    expect(llm.requests).toHaveLength(1);
  });

  it('LLM 连不上时优雅收束,并说清下一步是「稍后再发一次」', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const llm = new ThrowingLlm();
    const loop = new AgentLoop({ llm, tools: new Map(), palette: realPalette() });

    const result = await loop.run(SESSION(), '在吗');

    expect(result.stopReason).toBe('llm_unavailable');
    const text = (result.session.messages.at(-1)?.content[0] as { text: string }).text;
    // ★ 这里**不能再指向 `POST /api/jobs`**——那条路随 `jobs` 模块一起删了(`[I7]` 随之降级)。
    expect(text).toContain('稍后再发一次');
    expect(text).not.toContain('/api/jobs');
    // 用户那句话要留在历史里 —— 不然「我没说过」说不清。
    expect(result.session.messages[0]).toEqual(textMessage('user', '在吗'));
    expect(warn).toHaveBeenCalled();
  });

  it('max_tokens 截断:结果照还(B),但不再拿残缺入参继续推理', async () => {
    const tool = new RecordingTool('t', () => ({ content: 'ok' }));
    const { llm, loop } = loopWith(
      [
        {
          content: [
            new TextBlock({ type: 'text', text: '被截断的' }),
            new ToolUseBlock({ type: 'tool_use', id: 'c1', name: 't', input: {} }),
          ],
          stopReason: 'max_tokens',
        },
      ],
      [tool],
    );

    const result = await loop.run(SESSION(), 'go');

    expect(result.stopReason).toBe('max_tokens');
    expect(llm.requests).toHaveLength(1);
    expect(result.session.messages[2]?.content[0]).toMatchObject({ toolUseId: 'c1' });
  });
});

// ── 会话形状 ─────────────────────────────────────────────────────────────────

describe('会话写入', () => {
  it('用户那句话先进历史,且 updatedAt 被刷新', async () => {
    const { loop } = loopWith([mockText('嗯')], []);
    const session = SESSION();
    const result = await loop.run(session, '  明天面试  ');

    expect(result.session.messages[0]).toEqual(textMessage('user', '  明天面试  '));
    expect(result.session.updatedAt >= session.updatedAt).toBe(true);
  });

  it('appendMessages 是纯函数,不改原会话', () => {
    const session = SESSION();
    const next = appendMessages(session, [textMessage('user', 'hi')]);
    expect(session.messages).toHaveLength(0);
    expect(next.messages).toHaveLength(1);
  });
});

// ── 工具契约按会话现算(A2) ─────────────────────────────────────────────────

/**
 * ★ `Tool.definitionFor` 是**可选**的,不实现就用 `definition`(绝大多数工具如此)。
 *   `propose_look` 实现了它:`tone` 的白名单要按会话里的肤色收窄(§6 规矩 4)。
 *
 *   ⚠️ 这一组测的是**接线**(循环到底把哪一份契约发出去了)——
 *   没有它的话,`definitionFor` 可以是死代码而所有单测照绿,而那就是本仓
 *   反复点名的假开关:配置写了、代码跑了、200、日志干净,只有结果是错的。
 */
describe('工具契约按会话现算', () => {
  /** 契约随会话变的那种工具(`propose_look` 是唯一一个真的,这里拿假的测接线)。 */
  class TwoFaceTool implements Tool {
    readonly definition = stubDefinition('two_face');

    async run(_input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
      return { content: '已记下', session: patchBrief(ctx.session, { skinTone: 'olive' }) };
    }

    definitionFor(session: Session): LlmToolDefinition {
      return { ...this.definition, description: `肤色:${session.brief.skinTone ?? '未知'}` };
    }
  }

  const descOf = (llm: MockLlm, i: number): string | undefined =>
    llm.requests[i]?.tools?.find((t) => t.name === 'two_face')?.description;

  it('发出去的是 `definitionFor(会话)` 那一份,不是构造时那份 `definition`', async () => {
    const tool = new TwoFaceTool();
    const { llm, loop } = loopWith([mockText('好')], [tool]);

    await loop.run(SESSION(), '你好');

    expect(descOf(llm, 0)).toBe('肤色:未知');
  });

  it('★ 同一轮的**下一次迭代**要重算:上一迭代刚记下的肤色,这一迭代就该生效', async () => {
    // ⚠️ 这正是开场那一轮的形状:模型先调 `patch_brief` 记肤色,同轮再调 `propose_look`。
    //   契约若提到循环外算一次,这里第二次请求发的还是全量色相 —— 色相照旧被打回。
    const tool = new TwoFaceTool();
    const { llm, loop } = loopWith(
      [mockToolCall('c1', 'two_face', {}), mockText('好')],
      [tool],
    );

    const result = await loop.run(SESSION(), '橄榄皮,给我来个妆');

    expect(llm.requests).toHaveLength(2);
    expect(descOf(llm, 0)).toBe('肤色:未知');
    expect(descOf(llm, 1)).toBe('肤色:olive');
    // 肤色真的落进了会话(不是只在提示里变了)。
    expect(result.session.brief.skinTone).toBe('olive');
  });
});

// ── 开场那一轮点名要妆面 ─────────────────────────────────────────────────────

/**
 * ★ 背景:真模型(`qwen-plus`)在开场那一轮实测会**只调 `patch_brief`**,
 *   然后在正文里把整套妆面讲完,`lookSpec` 一直空着(`system-prompt.ts` 文件头 v11)。
 *   后果不是"少了一段话":会话里没有妆面 ⇒ `/result` 只能摆「回『开始设计』重走一遍」。
 *
 *   所以循环在这一轮**点名**要 `propose_look`,把"它自己决定调不调"这件事拿掉。
 *   ⚠️ 这条**只有在真 adapter 把 `requireTool` 翻译成线上参数时才成立** ——
 *   翻译那一头在 `dashscope-llm.ts`(单测打不到,**改它必须照 `out/` 那套 echo 法子看一眼实际发出的 body**)。
 */
describe('开场那一轮点名要妆面', () => {
  /**
   * 一份最小合法妆面单。`zones` 里 **`lip` / `cheek` / `eyeshadow` / `brow` 四个必填**
   * (另外六个区可选,见 `look-spec.ts` 的 `zonesSchema`)。
   * ⚠️ 少给不会当场炸:`LookSpec` 的构造函数**不校验**,要等 `describeLook` 拼系统提示时才
   *   在 `spec.zones.brow.shape` 上抛 —— 那时症状是整轮变成「LLM 调用失败」,看着像网络问题。
   *   所以这里靠 `npm run typecheck:test` 兜(它才看得见缺字段,`npm run typecheck` 看不见)。
   */
  const LOOK = new LookSpec({
    occasion: 'party',
    base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
    zones: {
      lip: new ZoneSpec({ tone: 'rose', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
      cheek: new ZoneSpec({ tone: 'coral', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
      eyeshadow: new ZoneSpec({ tone: 'nude', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
      brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
    },
  });

  /** 一个真的会写 `lookSpec` 的 `propose_look` 替身。 */
  const proposeLook = () =>
    new RecordingTool('propose_look', (_input, ctx) => ({
      content: '已记下这套妆面',
      session: setLookSpec(ctx.session, LOOK, undefined),
    }));

  it('开场 + 妆面为空 → 点名 propose_look;它落了就松手,不挡住后面说话', async () => {
    const { llm, loop } = loopWith(
      [mockToolCall('c1', 'propose_look', {}), mockText('按这个来')],
      [proposeLook()],
    );

    const result = await loop.run(SESSION(), '按我填的需求给我定一套妆。');

    expect(result.stopReason).toBe('end_turn');
    expect(result.session.lookSpec).toBeDefined();
    // 第一次点名,第二次松手 —— 否则模型再没有机会用正文收尾,只能一轮轮调工具到触顶。
    expect(llm.requests.map((r) => r.requireTool)).toEqual(['propose_look', undefined]);
  });

  it('★ 妆面被拒的那几轮**继续点名** —— 否则它又会退回"正文里讲一遍"', async () => {
    let seen = 0;
    const refusesOnce = new RecordingTool('propose_look', (_input, ctx) =>
      seen++ === 0
        ? { content: '妆面单不合法:…', isError: true }
        : { content: '已记下', session: setLookSpec(ctx.session, LOOK, undefined) },
    );
    const { llm, loop } = loopWith(
      [mockToolCall('c1', 'propose_look', {}), mockToolCall('c2', 'propose_look', {}), mockText('好')],
      [refusesOnce],
    );

    const result = await loop.run(SESSION(), '定一套妆');

    expect(result.session.lookSpec).toBeDefined();
    expect(llm.requests.map((r) => r.requireTool)).toEqual([
      'propose_look',
      'propose_look',
      undefined,
    ]);
  });

  /**
   * ★★ 2026-10-01:点名**分两段** —— 先 `read_style_recipe` 读配方,答过了再点名 `propose_look`。
   *
   * 不这样分,新加的那个工具在开场那一轮**形同虚设**:`requireTool` 是
   * `tool_choice: {function: …}`,点名谁模型这一轮就只能调那一个。而开场那一轮
   * 恰恰是每轮必被「区集与配方对不上」打回的那一次 —— 修不到它,就等于没修。
   */
  describe('开场先读配方(2026-10-01)', () => {
    /** 不改会话的 `read_style_recipe` 替身。 */
    const readRecipe = (outcome: ToolOutcome = { content: '配方正文' }) =>
      new RecordingTool('read_style_recipe', () => outcome);

    it('★ 第一段点名 read_style_recipe,它答过之后换回 propose_look', async () => {
      const { llm, loop } = loopWith(
        [
          mockToolCall('r1', 'read_style_recipe', { styleId: 'vital' }),
          mockToolCall('c1', 'propose_look', {}),
          mockText('按这个来'),
        ],
        [readRecipe(), proposeLook()],
      );

      const result = await loop.run(SESSION(), '按我填的需求给我定一套妆。');

      expect(result.session.lookSpec).toBeDefined(); // 两段都真的走完了
      expect(llm.requests.map((r) => r.requireTool)).toEqual([
        'read_style_recipe',
        'propose_look',
        undefined, // 妆面落了就松手,不挡住它用正文收尾
      ]);
    });

    it('★ 读配方那一步失败(它编了个 id)也照样换回 propose_look —— 不许把它钉在读取上出不去', async () => {
      const { llm, loop } = loopWith(
        [
          mockToolCall('r1', 'read_style_recipe', { styleId: '没这条' }),
          mockToolCall('c1', 'propose_look', {}),
          mockText('好'),
        ],
        [readRecipe({ content: '没有这一条配方。', isError: true }), proposeLook()],
      );

      const result = await loop.run(SESSION(), '定一套妆');

      expect(result.session.lookSpec).toBeDefined();
      expect(llm.requests.map((r) => r.requireTool)).toEqual([
        'read_style_recipe',
        'propose_look',
        undefined,
      ]);
    });
  });

  it('不是开场(历史里已经有人说过话) → 一个字都不点名', async () => {
    const { llm, loop } = loopWith([mockText('嗯')], [proposeLook()]);
    const talked = appendMessages(SESSION(), [textMessage('assistant', '你好')]);

    await loop.run(talked, '换个风格');

    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.requireTool).toBeUndefined();
  });

  it('开场但妆面已经在会话里 → 不点名(比如只补一句话)', async () => {
    const { llm, loop } = loopWith([mockText('好的')], [proposeLook()]);
    const withLook = setLookSpec(SESSION(), LOOK, undefined);

    await loop.run(withLook, '嗯');

    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.requireTool).toBeUndefined();
  });

  it('注册表里没有 propose_look → 不点名(点名一个不存在的工具只会白烧一轮)', async () => {
    const { llm, loop } = loopWith([mockText('好')], []);

    await loop.run(SESSION(), '定一套妆');

    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.requireTool).toBeUndefined();
  });
});
