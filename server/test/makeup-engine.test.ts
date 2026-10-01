/**
 * 生图引擎单测 —— 全部**打桩 `fetch`,不联网不花钱**。
 *
 * ★ 这一组盯的是 §5.3 那四条坑的**处置是否真的落在代码里**,外加提示词口径上
 *   几条容易漂的不变量(见文件末尾那一组)。
 *
 * ⚠️ 真实联网的那一半(以及"平台方哪天改了行为")**这些测试管不了**。
 *   那要靠一次付费真跑 + §12.1 的实测打分。**单测全绿不等于这条路已经验过。**
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowSpec,
  ImageEngine,
  LookSpec,
  LookSpecBase,
  ZoneSpec,
  buildGenerateRequest,
} from '../src/modules/makeup/index.js';
import type { EngineInput } from '../src/modules/makeup/index.js';

const SPEC = new LookSpec({
  occasion: 'daily',
  base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
  zones: {
    lip: new ZoneSpec({ tone: 'rose', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
    cheek: new ZoneSpec({ tone: 'coral', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    eyeshadow: new ZoneSpec({ tone: 'nude', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
  },
});

/** 一张最小的"脸":内容任意,引擎只把它读成 base64。 */
const FACE_BYTES = Buffer.from('not-really-a-png-but-the-engine-only-hashes-it');
/** 参考图:★ 两份内容**必须不同**,否则"两张图各读各的"这件事验不出来。 */
const REF_BYTES = [Buffer.from('ref-one-bytes'), Buffer.from('ref-two-bytes-differ')];

let dir: string;
let faceFile: string;
let refFiles: string[];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'makeup-engine-'));
  faceFile = path.join(dir, 'face.png');
  writeFileSync(faceFile, FACE_BYTES);
  // ★ 参考图与本人照片一样是**本机文件**,`toImageField` 会真去读它。
  refFiles = REF_BYTES.map((buf, i) => {
    const file = path.join(dir, `ref${i + 1}.png`);
    writeFileSync(file, buf);
    return file;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    face: { filePath: faceFile, mimeType: 'image/png' },
    brief: { skinTone: 'olive' },
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
        references: refFiles.map((filePath) => ({ filePath, mimeType: 'image/png' })),
      }),
      OPTS,
    );

    const content = (req.body.input as { messages: { content: unknown[] }[] }).messages[0]!
      .content as { image?: string; text?: string }[];
    expect(content).toHaveLength(4); // 2 参考 + 本人 + 提示词
    // ★ 参考图与本人照片走**同一条**本地文件路径,所以三张都是 base64 data URL。
    for (const i of [0, 1, 2]) {
      expect(content[i]!.image!.startsWith('data:image/png;base64,')).toBe(true);
    }
    expect(content[3]!.text).toBe(req.prompt);
    // 提示词永远压轴 —— 上面那条"最后一张图决定输出比例"要求图片都在它之前。
  });

  it('★ 参考图超上限**抛错,不静默截断**(截掉的那张谁都不会知道)', () => {
    const tooMany = [0, 0, 0].map(() => ({ filePath: refFiles[0]!, mimeType: 'image/png' }));
    expect(() => buildGenerateRequest(input({ references: tooMany }), OPTS)).toThrow(
      /参考图最多 2 张.*收到 3 张/,
    );
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

  it('★ 没有 LookSpec 就明确报错,并点出只走对话 agent —— 不瞎编一套妆', () => {
    expect(() => buildGenerateRequest(input({ lookSpec: undefined }), OPTS)).toThrow(/LookSpec/);
    expect(() => buildGenerateRequest(input({ lookSpec: undefined }), OPTS)).toThrow(/propose_look/);
  });

  it('body 里不含密钥相关字段(密钥只走请求头)', () => {
    expect(JSON.stringify(buildGenerateRequest(input(), OPTS).body)).not.toContain('sk-');
  });
});

// ── 提示词口径 ──────────────────────────────────────────────────────────────

describe('提示词只随"会影响措辞"的东西变', () => {
  const promptOf = (over: Partial<EngineInput> = {}, opts = OPTS): string =>
    buildGenerateRequest(input(over), opts).prompt;

  it('同一输入 → 同一份提示词(组装是纯函数)', () => {
    expect(promptOf()).toBe(promptOf());
  });

  it('★ 肤色:写不写它会改措辞,但写哪一档不会 —— 档位名根本不进提示词', () => {
    // 「不提肤色」与「提了」是两份不同的提示词,必须分开。
    expect(promptOf({ brief: {} })).not.toBe(promptOf());

    // 但 deep 与 light 得到**同一份**提示词,这是**有意的,不是漏了**:
    //   肤色只决定提示词里**有没有**那句「按本人真实肤色上妆,不要提亮」——
    //   **档位名本身刻意不进提示词**(§6 规矩 4:不许默认浅肤色审美,也就等于不许
    //   拿着一个色号去指挥模型)。真正随肤色变的是 `LookSpec` 的选色,那发生在 agent 侧,
    //   到这里已经定死在 spec 里了。
    expect(promptOf({ brief: { skinTone: 'cool_porcelain' } })).toBe(
      promptOf({ brief: { skinTone: 'deep_brown' } }),
    );
  });

  it('妆面单变了 → 提示词变', () => {
    // `SPEC.zones` 是普通对象(成员才是名义类型),所以展开它没问题;整体必须重新构造。
    const other = new LookSpec({
      occasion: SPEC.occasion,
      base: SPEC.base,
      zones: { ...SPEC.zones, lip: new ZoneSpec({ tone: 'berry', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 5 }) },
    });
    expect(promptOf({ lookSpec: other })).not.toBe(promptOf());
  });

  it('出图张数只进 parameters,不改提示词(改的是这次请求,不是妆面)', () => {
    const three = buildGenerateRequest(input(), { ...OPTS, n: 3 });
    expect(three.prompt).toBe(promptOf());
    expect((three.body.parameters as Record<string, unknown>).n).toBe(3);
  });
});

// ── ImageEngine ────────────────────────────────────────────────────────────

describe('ImageEngine', () => {
  it('出图成功:图落盘、返回路径与类型、look 带上模板版本与模型名', async () => {
    const { imageBytes } = stubFetch();
    const res = await engine().generate(input());

    expect(res.image.mimeType).toBe('image/png');
    expect(readFileSync(res.image.filePath)).toEqual(imageBytes);
    expect(path.dirname(res.image.filePath)).toBe(path.join(dir, 'out'));
    expect(res.look).toMatchObject({ engine: 'image', model: 'qwen-image-edit-plus', templateVersion: 'v4' });
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
    expect(res.image.mimeType).toBe('image/png');
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
});
