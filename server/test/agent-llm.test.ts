/**
 * LLM 适配器单测:打桩 `fetch`,不联网。
 *
 * ★ 这一组盯的是 `dashscope-llm.ts` 文件头列的那三处「不做就是 bug」的翻译,
 *   以及**出站方向的形状**——那半边平时不会报错,只会让模型拿到看不懂的历史。
 *
 * 真实联网的部分(以及"平台方哪天偷偷改了行为")留给 `scripts/probe-tool-calling.ts`
 * 与夹具,单测必须离线可跑、不 flaky(与 `weather.test.ts` 同一条规矩)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DashScopeLlm,
  LlmUnavailableError,
  assistantMessage,
  textMessage,
  toolResults,
} from '../src/modules/agent/index.js';
import type { LlmRequest } from '../src/modules/agent/index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 一条典型的线上回复(形状取自 `npm run probe:tools` 的实测夹具)。 */
function completion(over: Record<string, unknown> = {}): unknown {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              index: 0,
              id: 'call_ce5648',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city": "北京"}' },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 128, completion_tokens: 20 },
    ...over,
  };
}

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal('fetch', mock);
  return mock;
}

function adapter(): DashScopeLlm {
  return new DashScopeLlm({
    apiKey: 'sk-not-a-real-key',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-flash',
  });
}

/** 取出发给线上的请求体。 */
function sentBody(mock: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const init = mock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 入站:线上形状 → 内部形状 ─────────────────────────────────────────────────

describe('入站翻译', () => {
  it('finish_reason 归一化,arguments 的 JSON 字符串解析成对象', async () => {
    stubFetch(completion());

    const res = await adapter().chat({ messages: [textMessage('user', '北京天气')] });

    expect(res.stopReason).toBe('tool_use');
    expect(res.content).toEqual([
      { type: 'tool_use', id: 'call_ce5648', name: 'get_weather', input: { city: '北京' } },
    ]);
    expect(res.usage).toEqual({ inputTokens: 128, outputTokens: 20 });
  });

  it('空正文不产出一个空 text 块(免得污染 textOf)', async () => {
    stubFetch(completion());
    const res = await adapter().chat({ messages: [textMessage('user', 'x')] });
    expect(res.content.some((b) => b.type === 'text')).toBe(false);
  });

  it('arguments 不是合法 JSON 时**原样交上去**,不编一个空对象', async () => {
    stubFetch({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{ id: 'c1', function: { name: 't', arguments: '{"tone":' } }],
          },
        },
      ],
    });

    const res = await adapter().chat({ messages: [textMessage('user', 'x')] });

    // 字符串原样留给 agent-loop 去认(它会回一句"参数不是合法 JSON")。
    expect(res.content[0]).toMatchObject({ input: '{"tone":' });
  });

  it('缺 id 也兜一个 —— 没有 id 就配不上 tool_result,下一轮必 400', async () => {
    stubFetch({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: { content: null, tool_calls: [{ function: { name: 't', arguments: '{}' } }] },
        },
      ],
    });

    const res = await adapter().chat({ messages: [textMessage('user', 'x')] });

    expect(res.content[0]).toMatchObject({ type: 'tool_use', id: 'call_fallback_0' });
  });

  it('其它 finish_reason 也各归各位', async () => {
    const cases: [string, string][] = [
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
      ['content_filter', 'refusal'],
      ['不认识的值', 'end_turn'],
    ];
    for (const [raw, expected] of cases) {
      stubFetch({ choices: [{ finish_reason: raw, message: { content: 'hi' } }] });
      expect((await adapter().chat({ messages: [textMessage('user', 'x')] })).stopReason).toBe(expected);
      vi.unstubAllGlobals();
    }
  });
});

// ── 出站:内部形状 → 线上形状 ─────────────────────────────────────────────────

describe('出站翻译', () => {
  it('工具定义翻成 function 形状,inputSchema → parameters', async () => {
    const mock = stubFetch(completion());

    await adapter().chat({
      messages: [textMessage('user', 'x')],
      tools: [{ name: 't', description: '说明', inputSchema: { type: 'object' } }],
    });

    const body = sentBody(mock);
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 't', description: '说明', parameters: { type: 'object' } } },
    ]);
    // ★ 缺省 auto:纯聊天轮也要能纯聊天,不能被逼着调工具。
    expect(body.tool_choice).toBe('auto');
    expect(body.model).toBe('qwen-flash');
  });

  it('没有工具时不带 tools / tool_choice', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({ messages: [textMessage('user', 'x')] });

    const body = sentBody(mock);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('system 提到顶层,不进 messages', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({ system: '你是顾问', messages: [textMessage('user', 'x')] });

    const body = sentBody(mock);
    expect((body.messages as { role: string }[])[0]).toEqual({ role: 'system', content: '你是顾问' });
  });

  it('★ 结果要拆条:每个 tool_result 一条 role:tool 消息', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({
      messages: [
        textMessage('user', 'x'),
        assistantMessage([
          { type: 'text', text: '我查一下' },
          { type: 'tool_use', id: 'c1', name: 'a', input: { n: 1 } },
          { type: 'tool_use', id: 'c2', name: 'b', input: {} },
        ]),
        toolResults([
          { type: 'tool_result', toolUseId: 'c1', content: 'A' },
          { type: 'tool_result', toolUseId: 'c2', content: 'B' },
        ]),
      ],
    });

    const msgs = sentBody(mock).messages as Record<string, unknown>[];
    // assistant 一轮原样回填:对象序列化成 JSON 字符串。
    expect(msgs[1]).toEqual({
      role: 'assistant',
      content: '我查一下',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'a', arguments: '{"n":1}' } },
        { id: 'c2', type: 'function', function: { name: 'b', arguments: '{}' } },
      ],
    });
    expect(msgs[2]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'A' });
    expect(msgs[3]).toEqual({ role: 'tool', tool_call_id: 'c2', content: 'B' });
  });

  it('★ 有工具调用且正文为空时给 null(空串可能被当成"有正文")', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({
      messages: [
        assistantMessage([{ type: 'tool_use', id: 'c1', name: 'a', input: {} }]),
      ],
    });

    expect((sentBody(mock).messages as Record<string, unknown>[])[0]?.content).toBeNull();
  });

  it('★ is_error 是有损翻译:靠「错误:」前缀把这一位补回去', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({
      messages: [
        toolResults([
          { type: 'tool_result', toolUseId: 'c1', content: '参数不合法' },
          { type: 'tool_result', toolUseId: 'c2', content: '这次没成功', isError: true },
        ]),
      ],
    });

    const msgs = sentBody(mock).messages as Record<string, unknown>[];
    expect(msgs[0]?.content).toBe('参数不合法');
    expect(msgs[1]?.content).toBe('错误:这次没成功');
  });

  it('maxTokens 透传成 max_tokens', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({ messages: [textMessage('user', 'x')], maxTokens: 512 });
    expect(sentBody(mock).max_tokens).toBe(512);
  });
});

// ── 失败路径 ─────────────────────────────────────────────────────────────────

describe('失败路径', () => {
  it('HTTP 非 2xx → LlmUnavailableError,且**不重试**(限流重试只会更糟)', async () => {
    const mock = stubFetch({ error: 'nope' }, 401);

    await expect(adapter().chat({ messages: [textMessage('user', 'x')] })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('连接阶段错误重一次后成功', async () => {
    const connectErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const mock = vi
      .fn()
      .mockRejectedValueOnce(connectErr)
      .mockResolvedValueOnce(jsonResponse(completion()));
    vi.stubGlobal('fetch', mock);

    const res = await adapter().chat({ messages: [textMessage('user', 'x')] });

    expect(mock).toHaveBeenCalledTimes(2);
    expect(res.stopReason).toBe('tool_use');
  });

  it('响应不是 JSON / 没有 choices → LlmUnavailableError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('不是 json', { status: 200 })));
    await expect(adapter().chat({ messages: [textMessage('user', 'x')] })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );

    vi.unstubAllGlobals();
    stubFetch({ choices: [] });
    await expect(adapter().chat({ messages: [textMessage('user', 'x')] })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
  });

  it('★ 请求头带 key,但**任何日志里都不出现 key 的值**', async () => {
    const mock = stubFetch(completion());
    const errors: unknown[][] = [];
    const spies = (['log', 'warn', 'error', 'info'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        errors.push(args);
      }),
    );

    await adapter().chat({ messages: [textMessage('user', 'x')] });

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-not-a-real-key');
    expect(JSON.stringify(errors)).not.toContain('sk-not-a-real-key');
    spies.forEach((s) => s.mockRestore());
  });

  it('LlmRequest 上的超时透传给 AbortSignal', async () => {
    const mock = stubFetch(completion());
    await adapter().chat({ messages: [textMessage('user', 'x')], timeoutMs: 1234 });

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

// ── 端口契约 ─────────────────────────────────────────────────────────────────

describe('端口契约', () => {
  it('name 带上模型名,便于日志分辨是哪一档', () => {
    expect(adapter().name).toBe('dashscope:qwen-flash');
  });

  it('raw 原样留着(落夹具用,不参与业务判断)', async () => {
    const body = completion();
    stubFetch(body);
    const res = await adapter().chat({ messages: [textMessage('user', 'x')] });
    expect(res.raw).toEqual(body);
  });

  it('入参 message 数组不被适配器改写', async () => {
    const mock = stubFetch(completion());
    const request: LlmRequest = {
      messages: [assistantMessage([{ type: 'tool_use', id: 'c1', name: 'a', input: { n: 1 } }])],
    };
    const snapshot = structuredClone(request.messages);

    await adapter().chat(request);

    expect(request.messages).toEqual(snapshot);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
