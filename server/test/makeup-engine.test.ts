/**
 * 生图引擎单测 —— 「真实引擎」与「夹具回放」两组,全部**打桩 `fetch`,不联网不花钱**。
 *
 * ★ 这一组盯的是 §5.3 那四条坑的**处置是否真的落在代码里**,以及 record/replay 的核心前提:
 *   **录像与回放算出的键必须逐位相同**——键一漂,回放永远未命中,而现象看起来像"没录"。
 *
 * ⚠️ 真实联网的那一半(以及"平台方哪天改了行为")**这些测试管不了**。
 *   那要靠一次付费录制 + §12.1 的实测打分。**单测全绿不等于这条路已经验过。**
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImageEngine,
  ReplayEngine,
  buildGenerateRequest,
  fixtureKeyOf,
  readFixture,
} from '../src/modules/makeup/index.js';
import type { EngineInput, GenerateRequest, LookSpec } from '../src/modules/makeup/index.js';

const SPEC: LookSpec = {
  occasion: 'daily',
  base: { coverage: 3, finish: 'satin', warmth: 0 },
  zones: {
    lip: { tone: 'rose', finish: 'matte', intensity: 3 },
    cheek: { tone: 'coral', finish: 'satin', intensity: 2 },
    eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 },
    brow: { shape: 'natural', intensity: 2 },
  },
};

/** 一张最小的"脸":内容任意,引擎只按字节算摘要。 */
const FACE_BYTES = Buffer.from('not-really-a-png-but-the-engine-only-hashes-it');

let dir: string;
let faceFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'makeup-engine-'));
  faceFile = path.join(dir, 'face.png');
  writeFileSync(faceFile, FACE_BYTES);
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    face: { filePath: faceFile, mimeType: 'image/png' },
    scenes: [],
    brief: { skinTone: 'medium' },
    lookSpec: SPEC,
    ...over,
  };
}

const OPTS = { apiHost: 'https://dashscope.aliyuncs.com', model: 'qwen-image-edit-plus' };

function completion(imageUrl = 'https://dashscope-result.oss-cn-beijing.aliyuncs.com/x.png') {
  return {
    output: { choices: [{ message: { content: [{ image: imageUrl }] } }] },
    usage: { image_count: 1, width: 1024, height: 1536 },
    request_id: 'req-abc-123',
  };
}

/** 先回 API 响应,再回图片字节。返回 stub,便于断言调用次数与请求体。 */
function stubFetch(apiBody: unknown = completion(), apiStatus = 200) {
  const imageBytes = Buffer.from('PNG-BYTES-9876543210');
  const mock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('dashscope-result')) {
      return Promise.resolve(new Response(imageBytes, { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(apiBody), {
        status: apiStatus,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', mock);
  return { mock, imageBytes };
}

function engine(over: Partial<ConstructorParameters<typeof ImageEngine>[0]> = {}): ImageEngine {
  return new ImageEngine({
    apiKey: 'sk-not-a-real-key',
    ...OPTS,
    outputDir: path.join(dir, 'out'),
    ...over,
  });
}

// ── 请求组装(§5.3 的四条坑)──────────────────────────────────────────────────

describe('buildGenerateRequest', () => {
  it('★ 坑 1:本人照片压轴 —— 多图输入时输出比例以最后一张为准', () => {
    const req = buildGenerateRequest(
      input({
        references: [
          { id: 'r1', title: 't', imageUrl: 'https://example.com/ref1.png', sourceUrl: 's' },
          { id: 'r2', title: 't', imageUrl: 'https://example.com/ref2.png', sourceUrl: 's' },
        ],
      } as Partial<EngineInput>),
      OPTS,
    );

    const content = (req.body.input as { messages: { content: unknown[] }[] }).messages[0]!
      .content as { image?: string; text?: string }[];
    expect(content).toHaveLength(4); // 2 参考 + 本人 + 提示词
    expect(content[0]!.image).toBe('https://example.com/ref1.png');
    expect(content[1]!.image).toBe('https://example.com/ref2.png');
    expect(content[2]!.image!.startsWith('data:image/png;base64,')).toBe(true);
    expect(content[2]!.text).toBeUndefined();
    expect(content[3]!.text).toBe(req.prompt);
    // 摘要顺序与请求顺序一致,face 在最后。
    expect(req.inputDigests.map((d) => d.role)).toEqual(['reference', 'reference', 'face']);
  });

  it('★ 坑 2:无后缀模型按能力归一化 —— 不传 size / prompt_extend,而不是告警后照发', () => {
    const plain = buildGenerateRequest(input(), {
      ...OPTS,
      model: 'qwen-image-edit',
      size: '1024*1536',
    });
    const params = plain.body.parameters as Record<string, unknown>;
    expect(params.size).toBeUndefined();
    expect(params.prompt_extend).toBeUndefined();

    // 带后缀的才吃这几个参数。
    const plus = buildGenerateRequest(input(), { ...OPTS, size: '1024*1536' });
    expect((plus.body.parameters as Record<string, unknown>).size).toBe('1024*1536');
    expect((plus.body.parameters as Record<string, unknown>).prompt_extend).toBe(true);
  });

  it('watermark 固定 false(我们不希望成品带水印)', () => {
    expect((buildGenerateRequest(input(), OPTS).body.parameters as Record<string, unknown>).watermark).toBe(false);
  });

  it('★ 没有 LookSpec 就明确报错,并点出表单路径的出路 —— 不瞎编一套妆', () => {
    expect(() => buildGenerateRequest(input({ lookSpec: undefined }), OPTS)).toThrow(/LookSpec/);
    expect(() => buildGenerateRequest(input({ lookSpec: undefined }), OPTS)).toThrow(/MAKEUP_ENGINE/);
  });

  it('body 里不含密钥相关字段(密钥只走请求头)', () => {
    expect(JSON.stringify(buildGenerateRequest(input(), OPTS).body)).not.toContain('sk-');
  });
});

// ── 夹具键 ──────────────────────────────────────────────────────────────────

describe('fixtureKeyOf —— 录像与回放必须算出同一个键', () => {
  const keyOf = (over: Partial<EngineInput> = {}, opts = OPTS): string =>
    fixtureKeyOf(buildGenerateRequest(input(over), opts) as GenerateRequest);

  it('同一输入 → 同一键', () => {
    expect(keyOf()).toBe(keyOf());
  });

  it('★ 键不含本机路径:同样的字节换个路径、换个文件名,仍是同一个键', () => {
    const other = path.join(dir, 'another-name.jpg');
    writeFileSync(other, FACE_BYTES);
    expect(keyOf({ face: { filePath: other, mimeType: 'image/jpeg' } })).toBe(keyOf());
  });

  it('★ 内容变了键就变(否则回放会把 A 的图当成 B 的结果)', () => {
    const other = path.join(dir, 'face2.png');
    writeFileSync(other, Buffer.from('different-bytes'));
    expect(keyOf({ face: { filePath: other, mimeType: 'image/png' } })).not.toBe(keyOf());
  });

  it('模型 / 出图张数 任一变化 → 键变', () => {
    expect(keyOf({}, { ...OPTS, model: 'qwen-image-edit-max' })).not.toBe(keyOf());
    expect(keyOf({}, { ...OPTS, n: 3 })).not.toBe(keyOf());
  });

  it('★ 肤色:写不写它会让键变,但写哪一档不会 —— 因为档位根本不进提示词', () => {
    // 「不提肤色」与「提了」是两份不同的请求,必须分开。
    expect(keyOf({ brief: {} })).not.toBe(keyOf());
    expect(keyOf({ brief: {} })).not.toBe(keyOf({ brief: { skinTone: 'deep' } }));

    // 但 deep 与 light 算出**同一个键**,这是**有意的,不是漏了**:
    //   肤色只决定提示词里**有没有**那句「按本人真实肤色上妆,不要提亮」——
    //   **档位名本身刻意不进提示词**(§6 规矩 4:不许默认浅肤色审美,也就等于不许
    //   拿着一个色号去指挥模型)。真正随肤色变的是 `LookSpec` 的选色,那发生在 agent 侧,
    //   到这里已经定死在 spec 里了。所以两者请求**逐字节相同**,回放给出同一个结果才是忠实的。
    expect(keyOf({ brief: { skinTone: 'light' } })).toBe(keyOf({ brief: { skinTone: 'deep' } }));
  });

  it('妆面单变了 → 键变', () => {
    const other: LookSpec = {
      ...SPEC,
      zones: { ...SPEC.zones, lip: { tone: 'berry', finish: 'matte', intensity: 5 } },
    };
    expect(keyOf({ lookSpec: other })).not.toBe(keyOf());
  });
});

// ── ImageEngine ────────────────────────────────────────────────────────────

describe('ImageEngine', () => {
  it('出图成功:图落盘、返回路径与类型、look 带上模板版本与模型名', async () => {
    const { imageBytes } = stubFetch();
    const res = await engine().generate(input());

    expect(res.mimeType).toBe('image/png');
    expect(readFileSync(res.resultFilePath)).toEqual(imageBytes);
    expect(path.dirname(res.resultFilePath)).toBe(path.join(dir, 'out'));
    expect(res.look).toMatchObject({ engine: 'image', model: 'qwen-image-edit-plus', templateVersion: 'v1' });
    // style 复用 describeLook:确定性、与 LookSpec 一一对应。
    expect(String((res.look as { style: string }).style)).toContain('玫瑰粉');
  });

  it('name 带上模型名,便于日志分辨是哪一档', () => {
    expect(engine().name).toBe('image:qwen-image-edit-plus');
  });

  it('★ HTTP 非 2xx 不重试(鉴权/限流再撞三次只会更糟)', async () => {
    const { mock } = stubFetch({ error: 'nope' }, 401);
    await expect(engine().generate(input())).rejects.toThrow(/HTTP 401/);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('接口用 200 回业务错误码 → 报错里带 code / message / request_id', async () => {
    stubFetch({ code: 'DataInspectionFailed', message: '图片审核未通过', request_id: 'req-9' });
    await expect(engine().generate(input())).rejects.toThrow(/审核未通过|req-9/);
  });

  it('连接阶段错误重试后成功', async () => {
    const { mock } = stubFetch();
    const connectErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const real = mock.getMockImplementation()!;
    mock.mockRejectedValueOnce(connectErr).mockImplementation(real as never);

    const res = await engine().generate(input());
    expect(res.mimeType).toBe('image/png');
  });

  it('★ 下载失败会重试;连续失败时把 URL 一起抛出来(图还活 24h,别白烧一次计费)', async () => {
    const apiBody = completion('https://dashscope-result.oss-cn-beijing.aliyuncs.com/save-me.png');
    let apiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('dashscope-result')) {
          return Promise.reject(Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }));
        }
        apiCalls++;
        return Promise.resolve(new Response(JSON.stringify(apiBody), { status: 200 }));
      }),
    );

    await expect(engine().generate(input())).rejects.toThrow(/save-me\.png/);
    // ★ 生成只发了一次 —— 下载失败**不能**触发重新生成(那会重复烧钱)。
    expect(apiCalls).toBe(1);
  });

  it('★ 任何日志里都不出现 key 的值', async () => {
    const { mock } = stubFetch();
    const logs: unknown[][] = [];
    const spies = (['log', 'warn', 'error', 'info'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args);
      }),
    );

    await engine().generate(input());

    const init = mock.mock.calls.find((c) => !String(c[0]).includes('dashscope-result'))![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-not-a-real-key');
    expect(JSON.stringify(logs)).not.toContain('sk-not-a-real-key');
    spies.forEach((s) => s.mockRestore());
  });

  it('不给 fixturesDir 就不写盘(缺省无副作用)', async () => {
    stubFetch();
    const fixturesDir = path.join(dir, 'fixtures');
    await engine().generate(input());
    expect(readdirSync(dir)).not.toContain('fixtures');
    expect(readFixture(fixturesDir, 'anything')).toBeNull();
  });
});

// ── record → replay ────────────────────────────────────────────────────────

describe('record / replay', () => {
  it('★ 录完再回放:命中,拿回同一张图,且**不联网**', async () => {
    const fixturesDir = path.join(dir, 'fixtures');
    const { imageBytes } = stubFetch();
    const recorded = await engine({ fixturesDir }).generate(input());

    // 录制留下的两份东西:json 与图。
    const files = readdirSync(fixturesDir);
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith('.png'))).toHaveLength(1);

    // ★ 夹具 json 里**不许有 base64**(几 MB 的字符串会让夹具没法读、没法 diff、没法进 git)。
    const fixtureJson = readFileSync(path.join(fixturesDir, files.find((f) => f.endsWith('.json'))!), 'utf8');
    expect(fixtureJson).not.toContain('base64');
    expect(fixtureJson).toContain('sha256');

    // 回放:把 fetch 换成"一调就炸",证明它真的不联网。
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        throw new Error('回放引擎不该发任何请求');
      }),
    );
    const replayed = await new ReplayEngine({
      fixturesDir,
      outputDir: path.join(dir, 'replay-out'),
      model: OPTS.model,
    }).generate(input());

    expect(readFileSync(replayed.resultFilePath)).toEqual(imageBytes);
    expect(readFileSync(replayed.resultFilePath)).toEqual(readFileSync(recorded.resultFilePath));
    expect(replayed.look).toMatchObject({ engine: 'replay' });
    // ★ 留一条线索:这张图是录的,不是当场生成的。
    expect((replayed.look as { replayedFrom?: string }).replayedFrom).toBeTruthy();
  });

  it('★ 未命中要**显式炸**,并说清该录哪一条 —— 静默给假图会让 CI 全绿地骗人', async () => {
    const fixturesDir = path.join(dir, 'empty-fixtures');
    await expect(
      new ReplayEngine({ fixturesDir, outputDir: path.join(dir, 'o'), model: OPTS.model }).generate(input()),
    ).rejects.toThrow(/未录制|未命中/);
  });

  it('★ 模板版本变了也算未命中 —— 措辞已变,录的那张图不再对应这次输入', async () => {
    const fixturesDir = path.join(dir, 'fixtures');
    stubFetch();
    await engine({ fixturesDir }).generate(input());

    const jsonFile = readdirSync(fixturesDir).find((f) => f.endsWith('.json'))!;
    const parsed = JSON.parse(readFileSync(path.join(fixturesDir, jsonFile), 'utf8')) as {
      templateVersion: string;
    };
    parsed.templateVersion = 'v0';
    writeFileSync(path.join(fixturesDir, jsonFile), JSON.stringify(parsed));

    await expect(
      new ReplayEngine({ fixturesDir, outputDir: path.join(dir, 'o'), model: OPTS.model }).generate(input()),
    ).rejects.toThrow(/模板/);
  });

  it('格式版本对不上 → 当"没有这份夹具",不按旧格式读出半个对象', () => {
    const fixturesDir = path.join(dir, 'fixtures');
    mkdirSync(fixturesDir, { recursive: true });
    writeFileSync(path.join(fixturesDir, 'wrongformat.json'), '{"formatVersion":0}');
    expect(readFixture(fixturesDir, 'wrongformat')).toBeNull();

    // 目录不存在也算"没有",不抛 —— 回放引擎要能把它变成"未录制"那句人话。
    expect(readFixture(path.join(dir, 'never-created'), 'anything')).toBeNull();
  });
});
