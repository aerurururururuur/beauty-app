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
  MockLlm,
  appendMessages,
  createSession,
  indexTools,
  mockText,
  mockTextAndToolCalls,
  mockToolCall,
  patchBrief,
  textMessage,
} from '../src/modules/agent/index.js';
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
  const loop = new AgentLoop({ llm, tools: indexTools(tools), ...extra });
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
    const refuse = loopWith([{ content: [{ type: 'text', text: '抱歉' }], stopReason: 'refusal' }], []);
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
    const spoke = loopWith([{ content: [{ type: 'text', text: '这个我不能帮你做。' }], stopReason: 'refusal' }], []);
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
    const call = { type: 'tool_use' as const, id: 'call_1', name: 'do_thing', input: { a: 1 } };
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
          { type: 'tool_use', id: 'c1', name: 'a', input: {} },
          { type: 'tool_use', id: 'c2', name: 'b', input: {} },
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
          { type: 'tool_use', id: 'c1', name: 'write', input: {} },
          { type: 'tool_use', id: 'c2', name: 'read', input: {} },
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
        { content: [{ type: 'tool_use', id: 'c1', name: 't', input: {} }], stopReason: 'end_turn' },
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
      turnTimeoutMs: 1000,
      now: () => times[Math.min(i++, times.length - 1)] ?? 0,
    });

    const result = await loop.run(SESSION(), 'go');

    expect(result.stopReason).toBe('timeout');
    expect(llm.requests).toHaveLength(1);
  });

  it('LLM 连不上时优雅收束,并点名还能走哪条路', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const llm = new ThrowingLlm();
    const loop = new AgentLoop({ llm, tools: new Map() });

    const result = await loop.run(SESSION(), '在吗');

    expect(result.stopReason).toBe('llm_unavailable');
    const text = (result.session.messages.at(-1)?.content[0] as { text: string }).text;
    expect(text).toContain('POST /api/jobs');
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
            { type: 'text', text: '被截断的' },
            { type: 'tool_use', id: 'c1', name: 't', input: {} },
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
