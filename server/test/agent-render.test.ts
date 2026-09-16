/**
 * 阶段 3「出图接线」的状态机单测:**等待确认 → 重放 → 真出图 → TTL 真删**。
 *
 * ★ 这一组测的是**钱与隐私**这两件不能出错的事,所以全部**不联网、不烧钱**:
 *   引擎与存储都是本地假实现,LLM 是脚本化的 `MockLlm`。
 *
 * ⚠️ 它们**管不了**的那一半,照 `makeup-engine.test.ts` 的规矩写在这里:
 *   真引擎出图好不好看、平台方哪天改了行为、真盘上删得干不干净(只有真实文件系统那一组
 *   碰到盘,但它测的是本仓库自己的 `rm` 调用),都要靠**一次付费实测 + 人工验收**。
 *   **单测全绿不等于这条路已经验过。**
 *
 * 用例编号呼应 `agent-loop.ts` 文件头 ⑦ 的三条推论:
 *   ① 一轮里只要有一个工具在等确认,**整轮结果都不发**
 *   ② 所以那一轮会被**整轮重跑** → 每个工具必须可重入
 *   ③ ★ **停机点 = 欠着一条 `tool_result`**,任何下次入口都必须先了结它
 */
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../src/modules/shared/index.js';
import { FileSystemArtifactStore } from '../src/modules/assets/index.js';
import { describeLook } from '../src/modules/makeup/index.js';
import type { Engine, EngineInput, EngineResult, LookSpec } from '../src/modules/makeup/index.js';
import {
  AgentLoop,
  AttachPhoto,
  ConfirmRender,
  GetRender,
  InMemorySessionStore,
  MockLlm,
  NO_CONFIRMATION_NOTICE,
  PurgeExpiredSessions,
  RenderLookTool,
  StartSession,
  TOOL_NAMES,
  appendMessages,
  assistantMessage,
  createSession,
  danglingToolUses,
  indexTools,
  mockText,
  mockTextAndToolCalls,
  mockToolCall,
  patchBrief,
  renderConfirmationSummary,
  renderReadiness,
  setFaceRef,
  setLookSpec,
  textMessage,
  textOf,
  toSessionView,
  toolUsesOf,
} from '../src/modules/agent/index.js';
import type {
  PhotoUpload,
  Session,
  ToolResultBlock,
  ToolUseBlock,
  SessionArtifacts,
  Tool,
  ToolContext,
  ToolOutcome,
  UserDirectory,
} from '../src/modules/agent/index.js';

// ── 测试替身 ─────────────────────────────────────────────────────────────────

const SAMPLE_LOOK: LookSpec = {
  occasion: 'interview',
  base: { coverage: 3, finish: 'satin', warmth: 0 },
  zones: {
    lip: { tone: 'rose', finish: 'matte', intensity: 3 },
    cheek: { tone: 'coral', finish: 'satin', intensity: 2 },
    // ★ 四个区都要给:`describeLook` 会逐区取 `zone.tone`,漏一个就会在视图那一步炸。
    eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 },
    brow: { shape: 'natural', intensity: 2 },
  },
};

const FACE_REF = { storeKey: 'inputs/s1/face/face-x.png', mimeType: 'image/png' };

/** 记录每次 `generate` 的入参;返回值可换。 */
class RecordingEngine implements Engine {
  readonly name = 'recording';
  readonly inputs: EngineInput[] = [];

  constructor(private readonly outcome: EngineResult | Error = okResult()) {}

  async generate(input: EngineInput): Promise<EngineResult> {
    this.inputs.push(input);
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

function okResult(): EngineResult {
  return {
    resultFilePath: 'mem://rendered.png',
    mimeType: 'image/png',
    look: { engine: 'mock', style: '测试', model: 'mem', templateVersion: 'v1' },
  };
}

/** 内存版会话产物存储。同时**记下调用顺序**,好断言"先删文件再删记录"。 */
class FakeSessionArtifacts implements SessionArtifacts {
  readonly trace: string[] = [];
  readonly putRenders: { sessionId: string; seq: number; sourceFilePath: string }[] = [];
  /** 置真则 `putRender` 抛错(用来验"写盘失败不会在会话里留下一条取不到的图")。 */
  failPutRender = false;
  private readonly files = new Map<string, { data: string; mimeType: string }>();

  async putFace(sessionId: string, file: PhotoUpload): Promise<{ storeKey: string; mimeType: string }> {
    this.trace.push(`putFace:${sessionId}`);
    const storeKey = `inputs/${sessionId}/face/${file.originalName}`;
    this.files.set(storeKey, { data: 'face-bytes', mimeType: file.mimeType });
    return { storeKey, mimeType: file.mimeType, originalName: file.originalName };
  }

  async resolveFace(sessionId: string): Promise<string> {
    this.trace.push(`resolveFace:${sessionId}`);
    return `mem://${sessionId}/face.png`;
  }

  async putRender(sessionId: string, seq: number, sourceFilePath: string, mimeType: string) {
    if (this.failPutRender) throw new Error('盘写满了');
    this.trace.push(`putRender:${sessionId}:${seq}`);
    this.putRenders.push({ sessionId, seq, sourceFilePath });
    const storeKey = `results/${sessionId}/r${seq}/result.png`;
    this.files.set(storeKey, { data: `render-${seq}`, mimeType });
    return { storeKey, mimeType };
  }

  async readRender(sessionId: string, seq: number) {
    const entry = this.files.get(`results/${sessionId}/r${seq}/result.png`);
    return entry
      ? { stream: Readable.from([entry.data]), mimeType: entry.mimeType }
      : null;
  }

  async removeAll(sessionId: string): Promise<void> {
    this.trace.push(`removeAll:${sessionId}`);
    for (const key of [...this.files.keys()]) {
      if (key.includes(`/${sessionId}/`)) this.files.delete(key);
    }
  }

  /**
   * ★ 盘上现有的会话 id(顶层那一段)。从存的键里切:`inputs/<id>/…` / `results/<id>/…`。
   * ⚠️ 这个方法**必须**在:缺了它 `sweepOrphans()` 会抛,而那里的 `try/catch`
   *   会把它吞成一条告警 + 0 —— 于是孤儿清理**静默不工作**,测试却全绿。
   *   (这个假实现当初就漏了它,是"重启残骸"那条用例把它逼出来的。)
   */
  async listStored(): Promise<string[]> {
    const ids = new Set<string>();
    for (const key of this.files.keys()) {
      const [, id] = key.split('/');
      if (id) ids.add(id);
    }
    return [...ids];
  }

  /** 断言辅助:盘上还剩几个文件。 */
  size(): number {
    return this.files.size;
  }
}

class ThrowingArtifacts extends FakeSessionArtifacts {
  override async removeAll(sessionId: string): Promise<void> {
    // 先记痕迹再抛:好断言"循环没有中断"(见那组用例)。
    this.trace.push(`removeAll:${sessionId}`);
    throw new Error('文件被占用');
  }
}

/** 列不出存储的假实现(权限/目录被占):验第二遍扫描失败时**不拖垮第一遍**。 */
class BlindArtifacts extends FakeSessionArtifacts {
  override async listStored(): Promise<string[]> {
    throw new Error('读不了目录');
  }
}

/**
 * 数 `save` 次数的会话存储。
 * ★ 入口 B 要**代递**一条提议(见 `confirm-render.ts`),而那条提议**只许在整趟末尾
 *   跟着结果一起落一次库**——中途多存一次,用户刷新就会看到一个模型从没提过的确认框。
 *   这条不变量没有别的观测点:`save` 次数是它唯一的外显。
 */
class CountingSessionStore extends InMemorySessionStore {
  saves = 0;
  override async save(session: Session): Promise<void> {
    this.saves += 1;
    return super.save(session);
  }
}

/** 只会返回"等我确认"的假工具,用来单独验循环的停机/重放(不碰引擎)。 */
class PendingTool implements Tool {
  readonly definition = {
    name: 'pending_tool',
    description: '测试用',
    inputSchema: { type: 'object' as const, properties: {} },
  };
  readonly confirmations: (string | undefined)[] = [];
  readonly sideEffects: string[] = [];
  calls = 0;

  constructor(private readonly opts: { alwaysPending?: boolean } = {}) {}

  async run(_input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
    this.calls++;
    this.confirmations.push(ctx.confirmation);
    if (this.opts.alwaysPending || ctx.confirmation === undefined) {
      return {
        content: '等用户确认',
        pendingConfirmation: { kind: 'render_look', summary: '要出图吗?' },
        // ★ 同轮里"真跑过"的副作用:停顿时**照常折叠**,只是不汇报。
        session: patchBrief(ctx.session, { occasion: 'interview' }),
      };
    }
    this.sideEffects.push(`ran:${ctx.confirmation}`);
    return { content: `已按「${ctx.confirmation}」处理` };
  }
}

/** 免费工具:记录它被调了几次(用来验"整轮都不发结果"时它照常有副作用)。 */
class FreeTool implements Tool {
  readonly definition = {
    name: 'free_tool',
    description: '测试用',
    inputSchema: { type: 'object' as const, properties: {} },
  };
  calls = 0;
  async run(_input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
    this.calls++;
    return { content: '免费工具跑完了', session: patchBrief(ctx.session, { skinTone: 'deep' }) };
  }
}

/**
 * 构造一个**裸的** `tool_use` 块。
 * ★ 与 `mockToolCall` 的区别是它返回的是一整个 `LlmResponse` 还是单个内容块——
 *   `mockTextAndToolCalls` 要的是**块**(它自己拼 text),给错了不会报错,
 *   只会得到一个没有 `type` 的畸形块,而循环会当成"模型没有调工具"直接收尾。
 */
const call = (id: string, name: string, input: unknown = {}): ToolUseBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});

const baseSession = (over: Partial<Session> = {}): Session => ({
  ...createSession('s1', 'u1'),
  ...over,
});

const readySession = (): Session =>
  setFaceRef(setLookSpec(baseSession(), SAMPLE_LOOK), FACE_REF);

function renderTool(
  engine: Engine,
  artifacts: SessionArtifacts,
  maxRenders = 3,
): RenderLookTool {
  return new RenderLookTool({ engine, artifacts, maxRenders });
}

afterEach(() => {
  rmSyncTempDirs();
});

const tempDirs: string[] = [];
function mkTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-render-'));
  tempDirs.push(dir);
  return dir;
}
function rmSyncTempDirs(): void {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

// ── ① RenderLookTool 的三态 ──────────────────────────────────────────────────

describe('render_look 三态', () => {
  it('没有妆面单 → 拒绝,并点名 propose_look(引擎一次都没调)', async () => {
    const engine = new RecordingEngine();
    const out = await renderTool(engine, new FakeSessionArtifacts()).run(
      {},
      { session: setFaceRef(baseSession(), FACE_REF) },
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('propose_look');
    expect(engine.inputs).toHaveLength(0);
    expect(out.pendingConfirmation).toBeUndefined();
  });

  it('没有照片 → 拒绝,并请用户上传(引擎一次都没调)', async () => {
    const engine = new RecordingEngine();
    const out = await renderTool(engine, new FakeSessionArtifacts()).run(
      {},
      { session: setLookSpec(baseSession(), SAMPLE_LOOK) },
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('照片');
    expect(engine.inputs).toHaveLength(0);
  });

  it('★ 首次执行(confirmation 缺省)→ 只给确认请求,**不调引擎、不改会话**', async () => {
    const engine = new RecordingEngine();
    const session = readySession();
    const out = await renderTool(engine, new FakeSessionArtifacts()).run({}, { session });

    expect(engine.inputs).toHaveLength(0);
    expect(out.session).toBeUndefined();
    expect(out.pendingConfirmation).toEqual({
      kind: 'render_look',
      summary: renderConfirmationSummary(session, 3),
    });
    // 给模型的话必须**明确它还不能宣布成功**(否则它会说"图已经出好了")。
    expect(out.content).toContain('不要说你已经出好了');
  });

  it("用户点了「不用了」→ 明确说没花钱、没出行,且**不再挂着确认请求**", async () => {
    const engine = new RecordingEngine();
    const out = await renderTool(engine, new FakeSessionArtifacts()).run(
      {},
      { session: readySession(), confirmation: 'declined' },
    );

    expect(engine.inputs).toHaveLength(0);
    expect(out.isError).toBeUndefined();
    expect(out.content).toContain('没有生成任何图、也没有产生费用');
    // ★ 不清闸门 = 用户拒绝之后又被问一次。
    expect(out.pendingConfirmation).toBeUndefined();
  });

  it('★ 批准 → 真出图:引擎拿到妆面单与照片路径,会话里记下第 1 张', async () => {
    const engine = new RecordingEngine();
    const artifacts = new FakeSessionArtifacts();
    const session = appendMessages(readySession(), [textMessage('user', '就这样吧')]);

    const out = await renderTool(engine, artifacts).run(
      {},
      { session, confirmation: 'approved' },
    );

    expect(engine.inputs).toHaveLength(1);
    expect(engine.inputs[0]?.lookSpec).toEqual(SAMPLE_LOOK);
    expect(engine.inputs[0]?.face.filePath).toBe('mem://s1/face.png');
    // §4.1:风景不参与妆容方向,所以这条路**永远是空的**。
    expect(engine.inputs[0]?.scenes).toEqual([]);

    expect(out.isError).toBeUndefined();
    expect(out.session?.renders).toHaveLength(1);
    expect(out.session?.renders[0]?.seq).toBe(1);
    // ★ 记的是**此刻**这份妆面的说法(历史,不跟着后来的改动走)。
    expect(out.session?.renders[0]?.lookDescription).toBe(describeLook(SAMPLE_LOOK));
    expect(artifacts.putRenders).toEqual([
      { sessionId: 's1', seq: 1, sourceFilePath: 'mem://rendered.png' },
    ]);
    // 会话是新建的,原对象不动(纯函数)。
    expect(session.renders).toHaveLength(0);
  });

  it('★ 先落盘再记会话:写盘失败时,**会话里不会多出一张取不到的图**', async () => {
    const artifacts = new FakeSessionArtifacts();
    artifacts.failPutRender = true;

    const out = await renderTool(new RecordingEngine(), artifacts).run(
      {},
      { session: readySession(), confirmation: 'approved' },
    );

    expect(out.isError).toBe(true);
    expect(out.session).toBeUndefined();
  });

  it('引擎失败 → 转成 observation,如实告诉用户"没出图"(不抛穿循环)', async () => {
    const engine = new RecordingEngine(new Error('生图超时'));
    const out = await renderTool(engine, new FakeSessionArtifacts()).run(
      {},
      { session: readySession(), confirmation: 'approved' },
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('没出来');
    expect(out.session).toBeUndefined();
  });

  it('额度用完 → **提议阶段就拒绝**,不给一个点下去必然失败的确认框', async () => {
    const engine = new RecordingEngine();
    const full = baseSession({
      renders: [1, 2, 3].map((seq) => ({
        seq,
        ref: { storeKey: `results/s1/r${seq}/result.png`, mimeType: 'image/png' },
        lookDescription: 'x',
        createdAt: '2026-09-16T00:00:00.000Z',
      })),
    });
    const out = await renderTool(engine, new FakeSessionArtifacts(), 3).run(
      {},
      { session: setFaceRef(setLookSpec(full, SAMPLE_LOOK), FACE_REF) },
    );

    expect(out.isError).toBe(true);
    expect(out.pendingConfirmation).toBeUndefined();
    expect(engine.inputs).toHaveLength(0);
  });

  it('★ 提议时还有额度、用户点确认时已经用完 → 第二遍检查拦住,引擎不调', async () => {
    const engine = new RecordingEngine();
    // 用户在"看到确认框"与"点确认"之间又出了两张,把额度占满。
    const raced = baseSession({
      renders: [
        { seq: 1, ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' }, lookDescription: 'a', createdAt: 'x' },
        { seq: 2, ref: { storeKey: 'results/s1/r2/result.png', mimeType: 'image/png' }, lookDescription: 'b', createdAt: 'x' },
        { seq: 3, ref: { storeKey: 'results/s1/r3/result.png', mimeType: 'image/png' }, lookDescription: 'c', createdAt: 'x' },
      ],
    });

    const out = await renderTool(engine, new FakeSessionArtifacts(), 3).run(
      {},
      { session: setFaceRef(setLookSpec(raced, SAMPLE_LOOK), FACE_REF), confirmation: 'approved' },
    );

    expect(out.isError).toBe(true);
    expect(engine.inputs).toHaveLength(0);
    expect(out.session).toBeUndefined();
  });

  it('maxRenders=0 表示不限制:提议时照常给确认框', async () => {
    const out = await renderTool(new RecordingEngine(), new FakeSessionArtifacts(), 0).run(
      {},
      { session: readySession() },
    );
    expect(out.pendingConfirmation).toBeDefined();
    // 不限制时不报"还剩几张"这句(它只会让人以为有个上限)。
    expect(out.pendingConfirmation?.summary).not.toContain('上限');
  });

  it('★★ 每一条失败都必须缀上「这次没弹确认框」—— 漏掉的那一支正是翻车的那一支', async () => {
    // 2026-09-16 真实端到端:模型调了 render_look,工具因**还没收到照片**而报错,
    // 它却照样回了一句「确认之后我就开始出图」,用户在等一个不存在的确认框。
    // 所以每一个 error 分支末尾都要带上这句(见 `NO_CONFIRMATION_NOTICE`)。
    // ★ 这里**逐支走一遍**而不是只测缺照片那支:风险不在那一支写没写对,
    //   而在**加第六个分支时想不起要缀**——这个测试才会在那时候挂。
    const noLook = await renderTool(new RecordingEngine(), new FakeSessionArtifacts()).run(
      {},
      { session: setFaceRef(baseSession(), FACE_REF) },
    );
    const noFace = await renderTool(new RecordingEngine(), new FakeSessionArtifacts()).run(
      {},
      { session: setLookSpec(baseSession(), SAMPLE_LOOK) },
    );

    const full = baseSession({
      renders: [1, 2, 3].map((seq) => ({
        seq,
        ref: { storeKey: `results/s1/r${seq}/result.png`, mimeType: 'image/png' },
        lookDescription: 'x',
        createdAt: 'x',
      })),
    });
    const quotaAtPropose = await renderTool(
      new RecordingEngine(),
      new FakeSessionArtifacts(),
      3,
    ).run({}, { session: setFaceRef(setLookSpec(full, SAMPLE_LOOK), FACE_REF) });

    const quotaAtApprove = await renderTool(
      new RecordingEngine(),
      new FakeSessionArtifacts(),
      3,
    ).run(
      {},
      {
        session: setFaceRef(setLookSpec(full, SAMPLE_LOOK), FACE_REF),
        confirmation: 'approved',
      },
    );

    const engineDown = await renderTool(
      new RecordingEngine(new Error('生图超时')),
      new FakeSessionArtifacts(),
    ).run({}, { session: readySession(), confirmation: 'approved' });

    for (const [label, out] of [
      ['没有妆面', noLook],
      ['没有照片', noFace],
      ['提议时超额', quotaAtPropose],
      ['确认时超额', quotaAtApprove],
      ['引擎失败', engineDown],
    ] as const) {
      expect(out.isError, `${label}那一支居然是成功的`).toBe(true);
      expect(out.content, `${label}那一支漏了「没有弹出确认框」那句`).toContain(
        NO_CONFIRMATION_NOTICE,
      );
    }
  });

  it('⚠️ 这段提醒**只挂在失败上**:成功提议那一支带上它就说反了', async () => {
    const out = await renderTool(new RecordingEngine(), new FakeSessionArtifacts()).run(
      {},
      { session: readySession() },
    );
    expect(out.content).not.toContain(NO_CONFIRMATION_NOTICE);
    // 「用户没确认」那一支也不是失败:它是用户做的决定,不是工具没能耐。
    const declined = await renderTool(new RecordingEngine(), new FakeSessionArtifacts()).run(
      {},
      { session: readySession(), confirmation: 'declined' },
    );
    expect(declined.isError).toBeUndefined();
    expect(declined.content).not.toContain(NO_CONFIRMATION_NOTICE);
  });

  it('★ 可重入:连续两次"首次执行"都只给确认请求,引擎一次都没调', async () => {
    const engine = new RecordingEngine();
    const tool = renderTool(engine, new FakeSessionArtifacts());
    const session = readySession();

    const first = await tool.run({}, { session });
    const replay = await tool.run({}, { session });

    expect(first.pendingConfirmation).toBeDefined();
    expect(replay.pendingConfirmation).toEqual(first.pendingConfirmation);
    expect(engine.inputs).toHaveLength(0);
  });

  it('确认框那句话**不含任何金额**——未核过价的数字不能替用户做决定', () => {
    const summary = renderConfirmationSummary(readySession(), 3);
    expect(summary).toContain('按次计费');
    expect(summary).not.toMatch(/[¥￥$]|\d+\s*元/);
  });
});

// ── ② 循环:停在等确认 / 整轮重放 ────────────────────────────────────────────

describe('循环遇到「等确认」', () => {
  function loopWith(script: Parameters<typeof MockLlm>[0], tools: readonly Tool[]) {
    const llm = new MockLlm(script);
    const loop = new AgentLoop({ llm, tools: indexTools(tools) });
    return { llm, loop };
  }

  it('★ 停下:stopReason=awaiting_confirmation、有 tool_pending 事件、**那条 tool_use 仍欠着**', async () => {
    const tool = new PendingTool();
    const { loop } = loopWith(
      [mockTextAndToolCalls('我准备出图了', [call('c1', 'pending_tool')])],
      [tool],
    );

    const result = await loop.run(baseSession(), '出图吧');

    expect(result.stopReason).toBe('awaiting_confirmation');
    expect(result.events).toContainEqual({
      type: 'tool_pending',
      toolUseId: 'c1',
      name: 'pending_tool',
      summary: '要出图吗?',
    });
    // ★ 停机点就是"欠着一条 tool_result"——这正是下次进入时必须先了结的东西。
    expect(danglingToolUses(result.session.messages).map((c) => c.id)).toEqual(['c1']);
    expect(result.session.messages.flatMap((m) => m.content).some((b) => b.type === 'tool_result')).toBe(false);
    // ⚠️ 刻意不补脚本话术:模型在调工具前已经说过"我准备出图了"。
    expect(result.events.filter((e) => e.type === 'text_delta')).toHaveLength(1);
  });

  it('★ 同一轮里**真跑过的**工具:副作用照常折叠,但结果一个都不发(发一半 = 下一轮 400)', async () => {
    const free = new FreeTool();
    const pending = new PendingTool();
    const { loop } = loopWith(
      [
        mockTextAndToolCalls('', [call('c1', 'free_tool'), call('c2', 'pending_tool')]),
      ],
      [free, pending],
    );

    const result = await loop.run(baseSession(), 'go');

    expect(free.calls).toBe(1);
    // 副作用留下了……
    expect(result.session.brief.skinTone).toBe('deep');
    expect(result.session.brief.occasion).toBe('interview');
    // ……但**一条 tool_result 都没还**(两条都欠着)。
    expect(danglingToolUses(result.session.messages).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it("★ 用户点了确认 → **整轮重放**,这次工具拿到 'approved'", async () => {
    const tool = new PendingTool();
    const { llm, loop } = loopWith(
      [
        mockTextAndToolCalls('我准备出图了', [call('c1', 'pending_tool')]),
        mockText('图出来了'),
      ],
      [tool],
    );

    const paused = await loop.run(baseSession(), '出图吧');
    const resumed = await loop.run(paused.session, undefined, { resume: 'approved' });

    expect(tool.calls).toBe(2);
    expect(tool.confirmations).toEqual([undefined, 'approved']);
    expect(resumed.stopReason).toBe('end_turn');
    expect(danglingToolUses(resumed.session.messages)).toEqual([]);
    // 重放之后结果才回填,而且 LLM 看到的第二次请求里**没有任何欠账**。
    expect(llm.requests[1]?.messages.flatMap((m) => m.content).some((b) => b.type === 'tool_result')).toBe(true);
  });

  it("★ 缺省 = declined:没人说过「用户批准了」就当没同意(搞错了只少花一次钱)", async () => {
    const tool = new PendingTool();
    const { loop } = loopWith(
      [
        mockTextAndToolCalls('我准备出图了', [call('c1', 'pending_tool')]),
        mockText('好,那我们再聊聊'),
      ],
      [tool],
    );

    const paused = await loop.run(baseSession(), '出图吧');
    await loop.run(paused.session);

    expect(tool.confirmations).toEqual([undefined, 'declined']);
    expect(tool.sideEffects).toEqual(['ran:declined']);
  });

  it('★ 暂停后**直接说别的**(没点确认)→ 欠账与这句话并进**同一条** user 消息,不 400', async () => {
    const tool = new PendingTool();
    const { llm, loop } = loopWith(
      [
        mockTextAndToolCalls('我准备出图了', [call('c1', 'pending_tool')]),
        mockText('那我们换个方向'),
      ],
      [tool],
    );

    const paused = await loop.run(baseSession(), '出图吧');
    const next = await loop.run(paused.session, '算了,换个方向');

    // 那一轮先被按 declined 了结(清账),然后用户的这句话才进历史。
    expect(tool.confirmations).toEqual([undefined, 'declined']);
    const lastUser = next.session.messages[2];
    expect(lastUser?.role).toBe('user');
    // ★ `tool_result` 与新正文在**同一条**消息里:连发两条 role:'user' 在有的供应商那支会 400。
    expect(lastUser?.content.map((b) => b.type)).toEqual(['tool_result', 'text']);
    expect(lastUser?.content[1]).toMatchObject({ type: 'text', text: '算了,换个方向' });
    // ★ 第二次请求里**那条 `tool_use` 还在**(不变量 [A]:assistant 那一轮必须原样回填),
    //   但它**不再欠账**——这才是"不会 400"的判据。直接看"有没有 tool_use"会看错东西。
    expect(danglingToolUses(llm.requests[1]?.messages ?? [])).toEqual([]);
  });

  it('重放之后**又**停在等确认(比如额度没了)→ 仍然如实停下,不抛错', async () => {
    const tool = new PendingTool({ alwaysPending: true });
    const { loop } = loopWith(
      [mockTextAndToolCalls('', [call('c1', 'pending_tool')])],
      [tool],
    );

    const first = await loop.run(baseSession(), 'go');
    const second = await loop.run(first.session, undefined, { resume: 'approved' });

    expect(first.stopReason).toBe('awaiting_confirmation');
    expect(second.stopReason).toBe('awaiting_confirmation');
    // 重放那一轮**也不还结果**(还是欠着),所以再点一次确认仍然能接上。
    expect(danglingToolUses(second.session.messages).map((c) => c.id)).toEqual(['c1']);
  });
});

// ── ③ ConfirmRender:唯一会花钱的用例 ───────────────────────────────────────

/**
 * ★ 开会话时的归属检查。此前是 `README.md` 待办里标着「**仍未定**」的那一条,
 *   2026-09-16 拍板做(理由见 `agent/domain/ports/user-directory.ts` 文件头)。
 *
 * ⚠️ 这一组**必须存在**的理由不只是"没测过":端口是组装根注入的,
 *   而注入漏了/写错了在别处是**静默**的——check 不跑,201 照发。
 *   所以下面第一条断言的是"**真的抛了**",不是"没抛就对了"。
 */
describe('StartSession(归属用户必须存在)', () => {
  /**
   * `exists` 只认给定的那几个 id;其余一律 false。
   * ⚠️ 不复用 `helpers/fakes.ts` 的 `FakeUserDirectory`:最后一条要 `exists` **抛错**,
   *   那个假货表达不了(它只会回 true/false)。三条共用一个本地替身比混用两份清楚。
   */
  const directory = (known: readonly string[]): UserDirectory => ({
    exists: async (userId: string) => known.includes(userId),
  });

  async function setup(known: readonly string[]) {
    const store = new InMemorySessionStore();
    const usecase = new StartSession({ sessions: store, users: directory(known) });
    return { store, usecase };
  }

  it('★ 用户不存在 → USER_NOT_FOUND,且**一条会话都不落库**', async () => {
    const { store, usecase } = await setup(['u1']);

    await expect(usecase.execute('查无此人')).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
    // ★ 关键的一半:不能"先建了再回滚",也不能留下半条记录。
    //   留着的话它就是一个**没人认领的会话**,而会话落盘之后它会变成盘上的持久记录。
    expect(store.size()).toBe(0);
  });

  it('用户存在 → 照常开会话,`userId` 原样记在会话上', async () => {
    const { store, usecase } = await setup(['u1']);

    const session = await usecase.execute('u1');

    expect(session.userId).toBe('u1');
    // 新会话是**空的**——`StartSession` 一条消息都不追加(前端据此显示页面级提示)。
    expect(session.messages).toEqual([]);
    expect(store.size()).toBe(1);
    expect((await store.find(session.id))?.id).toBe(session.id);
  });

  it('`exists` 抛真错误(存储故障)→ **原样抛穿**,不许翻译成"用户不存在"', async () => {
    // ★ 这条防的是把 500 说成 404:组装根那个闭包只把 USER_NOT_FOUND 翻译成 false,
    //   其余照抛(见 `src/index.ts` 的 `userExists`)。用例这边不许多做一层兜底,
    //   否则"存储挂了"会伪装成"你没这个人",而用户会去重新注册一个已经有了的账号。
    const boom = new Error('存储挂了');
    const store = new InMemorySessionStore();
    const usecase = new StartSession({
      sessions: store,
      users: { exists: async () => { throw boom; } },
    });

    await expect(usecase.execute('u1')).rejects.toBe(boom);
    expect(store.size()).toBe(0);
  });
});

describe('ConfirmRender', () => {
  async function setup(script: Parameters<typeof MockLlm>[0], tools: readonly Tool[]) {
    const store = new InMemorySessionStore();
    const loop = new AgentLoop({ llm: new MockLlm(script), tools: indexTools(tools) });
    const usecase = new ConfirmRender({ sessions: store, loop });
    return { store, loop, usecase };
  }

  it('归属不符 / 不存在 → 同一个 SESSION_NOT_FOUND(不外泄存在性)', async () => {
    const { store, usecase } = await setup([mockText('x')], []);
    await store.create(baseSession());

    await expect(usecase.execute('s1', '别人')).rejects.toMatchObject({
      code: ErrorCode.SESSION_NOT_FOUND,
    });
    await expect(usecase.execute('不存在', 'u1')).rejects.toMatchObject({
      code: ErrorCode.SESSION_NOT_FOUND,
    });
  });

  /**
   * ⚠️ **这条用例的名字与理由都改过(2026-09-16),别照旧读它。**
   *
   * 它以前叫「没有待确认的出图请求就不跑循环——重复点击不能白烧一轮 LLM」,
   * 守的是"没有待确认项 ⇒ 422"。**那句话现在不再成立**:妆面照片齐、也没有欠账时,
   * 这一次点击是**正当的新请求**(入口 B,见下一个 describe),会真的出一张图。
   * ★ 于是"重复点击"那件事**只剩两条防线**(界面上的禁用 + 进程内 in-flight 锁),
   *   而不是靠这条 422 —— 那是"一次点击就花钱"的固有代价,如实记在
   *   `confirm-render.ts` 文件头的「残余空洞」里。
   *
   * 这条断言仍绿,但**守的东西变了**:它现在守的是**缺妆面**那一支
   * (这里的 `baseSession()` 既没妆面也没照片 ⇒ 报的是"还没有妆面")。
   * 不改名的话,下一个人会以为 422 还在管"没有待确认项"。
   */
  it('★ 缺妆面(也没有待确认的提议)→ 422 且**不跑循环**', async () => {
    const { store, usecase } = await setup([mockText('我不该被调用')], []);
    await store.create(baseSession());

    await expect(usecase.execute('s1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('有待确认的 render_look → 传 approved,出图并**存回**(存不回就会重复花钱)', async () => {
    const engine = new RecordingEngine();
    const artifacts = new FakeSessionArtifacts();
    const tool = renderTool(engine, artifacts);

    const store = new InMemorySessionStore();
    const loop = new AgentLoop({
      llm: new MockLlm([
        mockTextAndToolCalls('我准备出图了', [call('c1', 'render_look')]),
        mockText('图出好了'),
      ]),
      tools: indexTools([tool]),
    });
    const usecase = new ConfirmRender({ sessions: store, loop });

    // 先跑一轮,停在等确认。
    const first = await loop.run(readySession(), '出图吧');
    expect(first.stopReason).toBe('awaiting_confirmation');
    await store.create(first.session);

    const done = await usecase.execute('s1', 'u1');

    expect(engine.inputs).toHaveLength(1);
    expect(done.session.renders).toHaveLength(1);
    // ★ 落库的那份**不再是**停顿时那份(欠账已经了结)。
    const saved = await store.find('s1');
    expect(danglingToolUses(saved?.messages ?? [])).toEqual([]);
    expect(saved?.renders).toHaveLength(1);
  });
});

// ── ③-B ★ ConfirmRender 的入口 B:用户点界面上那条消息 ───────────────────────

/**
 * ✏️ 2026-09-16 新增。**这一组就是"用户要图不必再由模型转达"那条改动的落点**:
 * 妆面照片齐、也没有任何提议欠着时,用户点一下界面上那条带按钮的消息,
 * 服务端**代递**一条 `render_look` 提议,同一次请求里真出图。
 *
 * ⚠️ 全部是假引擎 + 假存储:**不联网、不花钱**。真机才暴露的那三个问题
 * (供应商认不认 `manual-` 这个不是它发的 id、模型拿到一条自己没产出过的 assistant 轮
 * 会怎么接话、历史里有了它之后会不会反复提议)靠**一次付费实测 + 人工验收**——
 * **这一组全绿不等于那条路已经验过。**
 */
describe('ConfirmRender —— 入口 B(用户点界面上那条消息)', () => {
  async function setupB(over: { maxRenders?: number; engine?: Engine } = {}) {
    const engine = over.engine ?? new RecordingEngine();
    const artifacts = new FakeSessionArtifacts();
    const store = new CountingSessionStore();
    const loop = new AgentLoop({
      // 一条脚本就够:代递的那条提议是**服务端合成**的、不经过模型,
      // 模型只被用来接最后那句收束语(同入口 A 重放完之后的 1 次调用)。
      llm: new MockLlm([mockText('图出好了,你看看这张行不行。')]),
      tools: indexTools([
        new RenderLookTool({ engine, artifacts, maxRenders: over.maxRenders ?? 3 }),
      ]),
    });
    return { engine, artifacts, store, usecase: new ConfirmRender({ sessions: store, loop }) };
  }

  it('★ 没有欠账、妆面照片齐 → 代递一条提议,**同一次请求里真出图**', async () => {
    const { engine, artifacts, store, usecase } = await setupB();
    await store.create(readySession());

    const done = await usecase.execute('s1', 'u1');

    // 引擎真被调了一次,拿的是那份妆面与那张照片(不是空的)。
    expect(engine.inputs).toHaveLength(1);
    expect(engine.inputs[0]?.lookSpec).toEqual(SAMPLE_LOOK);
    expect(engine.inputs[0]?.face.filePath).toBe('mem://s1/face.png');
    expect(done.session.renders).toHaveLength(1);
    expect(done.session.renders[0]?.seq).toBe(1);
    expect(artifacts.putRenders).toEqual([
      { sessionId: 's1', seq: 1, sourceFilePath: 'mem://rendered.png' },
    ]);

    const saved = (await store.find('s1'))!;
    // ★ 历史里留下的是"提议 → 批准"**一对**,而不是"没人调工具却出了图"——
    //   后者正是 v5–v11 那一串翻车的同一个病灶(模型手上没有状态,只能猜)。
    const calls = saved.messages.flatMap((m) => toolUsesOf(m));
    expect(calls.map((c) => c.name)).toEqual([TOOL_NAMES.renderLook]);
    expect(calls[0]?.id.startsWith('manual-')).toBe(true);
    expect(danglingToolUses(saved.messages)).toEqual([]);
    // ★ 合成的那条提议**一个字的正文都没有**:正文是"模型说的话",服务端不替它写。
    const proposal = saved.messages.find((m) => toolUsesOf(m).length > 0)!;
    expect(textOf(proposal)).toBe('');
    // ★ 它**只落了一次库**。中途多存一次,用户刷新就会看到一个模型从没提过的确认框。
    expect(store.saves).toBe(1);
  });

  it('★ 引擎失败:合成的那条提议**不会留在历史里当"模型提过"**', async () => {
    const { store, usecase } = await setupB({
      engine: new RecordingEngine(new Error('生图超时')),
    });
    await store.create(readySession());

    await usecase.execute('s1', 'u1');

    const saved = (await store.find('s1'))!;
    expect(saved.renders).toEqual([]);
    // 欠账照样还清 ⇒ 用户**再点一次是有意义的**(重试),而不是撞上一个幽灵确认框。
    expect(danglingToolUses(saved.messages)).toEqual([]);
  });

  it('★ 缺妆面 → 422 且**点名妆面**(不是"没有待确认项"),引擎一次都不调', async () => {
    const { engine, store, usecase } = await setupB();
    await store.create(setFaceRef(baseSession(), FACE_REF));

    await expect(usecase.execute('s1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      message: expect.stringContaining('妆面'),
    });
    expect(engine.inputs).toHaveLength(0);
  });

  it('★ 缺照片 → 422 且点名照片', async () => {
    const { engine, store, usecase } = await setupB();
    await store.create(setLookSpec(baseSession(), SAMPLE_LOOK));

    await expect(usecase.execute('s1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      message: expect.stringContaining('照片'),
    });
    expect(engine.inputs).toHaveLength(0);
  });

  it('★ 欠着的是**别的**工具 → 422(那是"上一轮崩在中间"的畸形状态,不叠一条提议)', async () => {
    const { engine, store, usecase } = await setupB();
    await store.create(
      appendMessages(readySession(), [assistantMessage([call('c1', 'patch_brief')])]),
    );

    await expect(usecase.execute('s1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(engine.inputs).toHaveLength(0);
  });

  it('★ 额度用尽 → 不调引擎、会话里不多图,而且**如实告诉用户**(不是静默失败)', async () => {
    const { engine, store, usecase } = await setupB({ maxRenders: 1 });
    await store.create(
      setFaceRef(
        setLookSpec(
          baseSession({
            renders: [
              {
                seq: 1,
                ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' },
                lookDescription: 'x',
                createdAt: 'x',
              },
            ],
          }),
          SAMPLE_LOOK,
        ),
        FACE_REF,
      ),
    );

    const done = await usecase.execute('s1', 'u1');

    // ★ 入口 B **没有"提议阶段"**,所以只剩 `render()` 里那第二遍额度检查在挡。
    expect(engine.inputs).toHaveLength(0);
    expect(done.session.renders).toHaveLength(1);
    // 这一轮照常收束(不抛),而模型拿到的那条结果明说要如实告诉用户——
    // 用户点了却出不了图,绝不能什么都不说。
    const results = done.session.messages
      .flatMap((m) => m.content)
      .filter((b): b is ToolResultBlock => b.type === 'tool_result');
    expect(results.some((r) => r.isError === true && r.content.includes('用完'))).toBe(true);
  });

  it('★ 并发重复点击:两个请求只有一个真的跑(进程内 in-flight 锁)', async () => {
    const { engine, store, usecase } = await setupB();
    await store.create(readySession());

    const settled = await Promise.allSettled([
      usecase.execute('s1', 'u1'),
      usecase.execute('s1', 'u1'),
    ]);

    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    // ★ 要紧的是这两条:**引擎只被调了一次**、会话里只有一张图。
    //   没有锁的话两个请求会各调一次引擎、各算出 `seq: 1`,出两张图扣两次钱、
    //   而会话里只留得下一条记录。
    expect(engine.inputs).toHaveLength(1);
    expect((await store.find('s1'))?.renders).toHaveLength(1);
  });

  it('★ 锁**一定要放开**:一次失败之后,下一次点击照常能出图', async () => {
    const { store, usecase } = await setupB();
    await store.create(setLookSpec(baseSession(), SAMPLE_LOOK)); // 缺照片 ⇒ 第一次抛

    await expect(usecase.execute('s1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });

    // 补上照片再点。锁漏放的话这里会一直报"正在出图",而那个会话**再也出不了图**。
    const withFace = setFaceRef((await store.find('s1'))!, FACE_REF);
    await store.save(withFace);

    const done = await usecase.execute('s1', 'u1');
    expect(done.session.renders).toHaveLength(1);
  });
});

// ── ④ AttachPhoto ───────────────────────────────────────────────────────────

describe('AttachPhoto', () => {
  const upload = (): PhotoUpload => ({
    originalName: 'me.png',
    mimeType: 'image/png',
    stream: Readable.from(['face-bytes']),
  });

  it('归属不符 → SESSION_NOT_FOUND,**且一个字节都没写**', async () => {
    const store = new InMemorySessionStore();
    const artifacts = new FakeSessionArtifacts();
    await store.create(baseSession());

    await expect(
      new AttachPhoto({ sessions: store, artifacts }).execute('s1', '别人', upload()),
    ).rejects.toMatchObject({ code: ErrorCode.SESSION_NOT_FOUND });
    expect(artifacts.size()).toBe(0);
  });

  it('★ 正常:只记引用与一句话,照片字节**不进 messages[]**', async () => {
    const store = new InMemorySessionStore();
    const artifacts = new FakeSessionArtifacts();
    await store.create(baseSession());

    const session = await new AttachPhoto({ sessions: store, artifacts }).execute(
      's1',
      'u1',
      upload(),
    );

    expect(session.faceRef?.storeKey).toBe('inputs/s1/face/me.png');
    expect(session.messages).toHaveLength(1);
    const text = JSON.stringify(session.messages);
    // ★ 历史里只有"我传了一张照片"这句话,没有任何 base64 / 路径。
    expect(text).toContain('我传了一张本人的正面照片');
    expect(text).not.toContain('face-bytes');
    expect(text).not.toContain('inputs/');
  });

  it('再传一张**覆盖**旧的(用户就是想换一张)', async () => {
    const store = new InMemorySessionStore();
    const artifacts = new FakeSessionArtifacts();
    await store.create(baseSession());
    const usecase = new AttachPhoto({ sessions: store, artifacts });

    await usecase.execute('s1', 'u1', upload());
    const second = await usecase.execute('s1', 'u1', {
      originalName: 'new.png',
      mimeType: 'image/jpeg',
      stream: Readable.from(['other']),
    });

    expect(second.faceRef?.storeKey).toBe('inputs/s1/face/new.png');
    expect(second.faceRef?.mimeType).toBe('image/jpeg');
  });
});

// ── ⑤ TTL 清理:隐私红线的落点 ──────────────────────────────────────────────

describe('PurgeExpiredSessions', () => {
  const OLD = '2026-09-01T00:00:00.000Z';
  const NOW = Date.parse('2026-09-16T12:00:00.000Z');

  it('★ 到期的:先删文件、再删记录(顺序反了会留下没人认领的照片)', async () => {
    const store = new InMemorySessionStore();
    const artifacts = new FakeSessionArtifacts();
    await store.create({ ...baseSession(), updatedAt: OLD });

    const { purged } = await new PurgeExpiredSessions({
      sessions: store,
      artifacts,
      ttlHours: 24,
      now: () => NOW,
    }).execute();

    expect(purged).toBe(1);
    expect(artifacts.trace).toEqual(['removeAll:s1']);
    expect(await store.find('s1')).toBeNull();
  });

  it('没到期的**原样留着**,也不碰文件', async () => {
    const store = new InMemorySessionStore();
    const artifacts = new FakeSessionArtifacts();
    await store.create({ ...baseSession(), updatedAt: '2026-09-16T11:00:00.000Z' });

    const { purged } = await new PurgeExpiredSessions({
      sessions: store,
      artifacts,
      ttlHours: 24,
      now: () => NOW,
    }).execute();

    expect(purged).toBe(0);
    expect(artifacts.trace).toEqual([]);
    expect(await store.find('s1')).not.toBeNull();
  });

  it('★ 一条删不掉不挡其它:失败的跳过,能删的照删', async () => {
    const store = new InMemorySessionStore();
    const artifacts = new ThrowingArtifacts();
    await store.create({ ...baseSession(), updatedAt: OLD });
    await store.create({ ...createSession('s2', 'u1'), updatedAt: OLD });

    const { purged } = await new PurgeExpiredSessions({
      sessions: store,
      artifacts,
      ttlHours: 24,
      now: () => NOW,
    }).execute();

    // 两条都失败(同一个假实现),但**循环没有中断**——两次尝试都发生过。
    expect(artifacts.trace).toEqual(['removeAll:s1', 'removeAll:s2']);
    expect(purged).toBe(0);
    // 记录留着:下一次扫描还会再遇到它们(能自愈)。
    expect(await store.find('s1')).not.toBeNull();
  });

  /**
   * ★ 第二遍扫描:盘上那些**没有会话认领**的目录。
   *
   * 这一组补的是一个此前写在注释里、现在已关掉的缺口:会话是内存实现,**进程重启即丢**,
   * 上一次进程留下的照片于是没有任何东西能认领、第一遍也枚举不到——
   * `[I8]` 那句"TTL 到期照片与产物被真实删除"**在重启之后就不成立了**。
   *
   * ⚠️ 这里同时也是那个"假实现漏了 `listStored`"的守卫:缺了它 `sweepOrphans()`
   *   会被自己的 `try/catch` 吞成 0,下面这几条会红(而不是悄悄变绿)。
   */
  describe('★ 没有人认领的存储目录(重启后的残骸)', () => {
    /** 盘上留一个上一轮进程的目录:照片在,会话记录已经随重启没了。 */
    const ghostPhoto = (artifacts: FakeSessionArtifacts, id: string) =>
      artifacts.putFace(id, {
        originalName: 'me.png',
        mimeType: 'image/png',
        stream: Readable.from(['x']),
      });

    it('★ 会话认领不到 → 真删;且不混进 purged', async () => {
      const store = new InMemorySessionStore();
      const artifacts = new FakeSessionArtifacts();
      await ghostPhoto(artifacts, 'ghost');
      expect(artifacts.size()).toBe(1);

      const { purged, orphans } = await new PurgeExpiredSessions({
        sessions: store,
        artifacts,
        ttlHours: 24,
        now: () => NOW,
      }).execute();

      expect(orphans).toBe(1);
      expect(artifacts.trace).toContain('removeAll:ghost');
      // ★ 照片真的从盘上消失了——这才是 `[I8]` 要的那件事。
      expect(artifacts.size()).toBe(0);
      // 孤儿不是会话,不许混进 purged(否则日志会说"清掉了 1 个会话")。
      expect(purged).toBe(0);
    });

    it('★★ 还活着的会话**一个文件都不许碰**(扫错方向就是把用户的照片删了)', async () => {
      const store = new InMemorySessionStore();
      const artifacts = new FakeSessionArtifacts();
      // 没到期(11:00),远在 cutoff 之内。
      await store.create({ ...baseSession(), updatedAt: '2026-09-16T11:00:00.000Z' });
      await ghostPhoto(artifacts, 's1');

      const { purged, orphans } = await new PurgeExpiredSessions({
        sessions: store,
        artifacts,
        ttlHours: 24,
        now: () => NOW,
      }).execute();

      expect(orphans).toBe(0);
      expect(purged).toBe(0);
      // ★ 只断言"没有任何删除动作"——`trace` 里还有造数据时记的 `putFace`。
      expect(artifacts.trace.filter((t) => t.startsWith('removeAll:'))).toEqual([]);
      expect(artifacts.size()).toBe(1);
      expect(await store.find('s1')).not.toBeNull();
    });

    it('到期的会话照旧走第一遍(不受第二遍影响)', async () => {
      const store = new InMemorySessionStore();
      const artifacts = new FakeSessionArtifacts();
      await store.create({ ...baseSession(), updatedAt: OLD });
      await ghostPhoto(artifacts, 's1');

      const { purged, orphans } = await new PurgeExpiredSessions({
        sessions: store,
        artifacts,
        ttlHours: 24,
        now: () => NOW,
      }).execute();

      expect(purged).toBe(1);
      // 第一遍已经把 `s1` 删了,第二遍列不到它 ⇒ 不该再算一次孤儿。
      expect(orphans).toBe(0);
      expect(artifacts.size()).toBe(0);
    });

    it('列不出盘时**不抛**,只跳过第二遍(第一遍的成果要留住)', async () => {
      const store = new InMemorySessionStore();
      const artifacts = new BlindArtifacts();
      await store.create({ ...baseSession(), updatedAt: OLD });

      const { purged, orphans } = await new PurgeExpiredSessions({
        sessions: store,
        artifacts,
        ttlHours: 24,
        now: () => NOW,
      }).execute();

      expect(purged).toBe(1); // 第一遍照常完成
      expect(orphans).toBe(0);
      expect(await store.find('s1')).toBeNull();
    });
  });
});

// ── ⑥ GetRender:取图 ───────────────────────────────────────────────────────

describe('GetRender', () => {
  async function withArtifacts() {
    const store = new InMemorySessionStore();
    const artifacts = new FakeSessionArtifacts();
    return { store, artifacts, usecase: new GetRender({ sessions: store, artifacts }) };
  }

  it('归属不符 → SESSION_NOT_FOUND', async () => {
    const { store, usecase } = await withArtifacts();
    await store.create(baseSession());
    await expect(usecase.execute('s1', '别人', 1)).rejects.toMatchObject({
      code: ErrorCode.SESSION_NOT_FOUND,
    });
  });

  it('★ 会话里没有这个序号 → RENDER_NOT_FOUND,且**不去问存储**', async () => {
    const { store, artifacts, usecase } = await withArtifacts();
    await store.create(baseSession());
    await expect(usecase.execute('s1', 'u1', 3)).rejects.toMatchObject({
      code: ErrorCode.RENDER_NOT_FOUND,
    });
    expect(artifacts.trace).toEqual([]);
  });

  it('★ 会话记着、盘上没有 → 也是 RENDER_NOT_FOUND,但**留下日志**(这是数据不一致)', async () => {
    const { store, usecase } = await withArtifacts();
    await store.create({
      ...baseSession(),
      renders: [
        { seq: 1, ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' }, lookDescription: 'x', createdAt: 'x' },
      ],
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(usecase.execute('s1', 'u1', 1)).rejects.toMatchObject({
      code: ErrorCode.RENDER_NOT_FOUND,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('正常:把字节交出去', async () => {
    const { store, artifacts, usecase } = await withArtifacts();
    await artifacts.putRender('s1', 1, 'mem://x', 'image/png');
    await store.create({
      ...baseSession(),
      renders: [
        { seq: 1, ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' }, lookDescription: 'x', createdAt: 'x' },
      ],
    });

    const artifact = await usecase.execute('s1', 'u1', 1);
    expect(artifact.mimeType).toBe('image/png');
    const chunks: Buffer[] = [];
    for await (const chunk of artifact.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('render-1');
  });
});

// ── ⑦ 对外视图 ──────────────────────────────────────────────────────────────

/**
 * ★ 三个读者共用的一份判据:工具(说给模型)、`ConfirmRender`(说给用户)、
 *   视图(决定摆不摆那条出图消息)。**判据只此一处,文案各写各的。**
 */
describe('renderReadiness —— 缺什么才算不能出图', () => {
  it('三态各报各的', () => {
    expect(renderReadiness(readySession())).toBe('ready');
    expect(renderReadiness(setFaceRef(baseSession(), FACE_REF))).toBe('no_look');
    expect(renderReadiness(setLookSpec(baseSession(), SAMPLE_LOOK))).toBe('no_face');
  });

  it('两样都缺时报 `no_look`(顺序是定的:先说妆面,再说照片)', () => {
    // ★ 这不是随便排的:妆面是**先决**——没有妆面时"请用户传照片"是白让用户做一步。
    expect(renderReadiness(baseSession())).toBe('no_look');
  });
});

describe('会话视图', () => {
  it('★ 有待确认时才出现 `pendingRender`,那句话与工具用的是**同一句**', () => {
    const paused = appendMessages(readySession(), [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'render_look', input: {} }] },
    ]);

    const view = toSessionView(paused, { maxRenders: 3 });

    expect(view.pendingRender).toEqual({
      toolUseId: 'c1',
      summary: renderConfirmationSummary(paused, 3),
    });
    expect(view.hasFace).toBe(true);
  });

  it('没有欠账时**不出这个键**(前端据"有没有"决定弹不弹框)', () => {
    const view = toSessionView(readySession(), { maxRenders: 3 });
    expect('pendingRender' in view).toBe(false);
    expect(view.renders).toEqual([]);
  });

  // ── ✏️ 2026-09-16 新增:那条由**界面按状态自己摆**的出图消息 ─────────────────

  it('★ 妆面照片齐、没有待确认 → 出现 `renderOffer`,那句话与工具用的是**同一句**', () => {
    const session = readySession();
    const view = toSessionView(session, { maxRenders: 3 });

    expect(view.renderOffer).toEqual({
      summary: renderConfirmationSummary(session, 3),
      left: 3,
      max: 3,
      alreadyRendered: false,
    });
    expect('pendingRender' in view).toBe(false);
  });

  it('★ 有提议在等确认时**只有** `pendingRender` —— 界面上只该有一个出图入口', () => {
    // 两个都出现的话,同一屏上就有两个按钮指向同一次花钱(其中一个必然 422)。
    const paused = appendMessages(readySession(), [
      assistantMessage([call('c1', TOOL_NAMES.renderLook)]),
    ]);

    const view = toSessionView(paused, { maxRenders: 3 });

    expect(view.pendingRender).toBeDefined();
    expect('renderOffer' in view).toBe(false);
  });

  it('★ 缺妆面 / 缺照片 → 不摆那条消息(点下去必然失败的动作不该出现在屏幕上)', () => {
    const noLook = toSessionView(setFaceRef(baseSession(), FACE_REF), { maxRenders: 3 });
    const noFace = toSessionView(setLookSpec(baseSession(), SAMPLE_LOOK), { maxRenders: 3 });

    expect('renderOffer' in noLook).toBe(false);
    expect('renderOffer' in noFace).toBe(false);
  });

  it('★ 出过这一套 ⇒ `alreadyRendered` 为真(按钮据此改口);妆面一改就变回假', () => {
    // 这条消息**不会**在出完图之后消失(妆面照片还在、额度也还有),所以按钮会停在那里。
    // 出完还写着「确认生成」读起来像"刚才那件事还没做完",诱着用户再点一次——那一次是真花钱。
    const rendered = setFaceRef(
      setLookSpec(
        baseSession({
          renders: [
            {
              seq: 1,
              ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' },
              // ★ 与 `describeLook(session.lookSpec)` 逐字同源(服务端出图时就是这么记的)。
              lookDescription: describeLook(SAMPLE_LOOK),
              createdAt: 'x',
            },
          ],
        }),
        SAMPLE_LOOK,
      ),
      FACE_REF,
    );
    expect(toSessionView(rendered, { maxRenders: 3 }).renderOffer?.alreadyRendered).toBe(true);

    // 只改了唇色 ⇒ 已经不是那一套了,按钮该回到「确认生成」。
    const changed = setLookSpec(rendered, {
      ...SAMPLE_LOOK,
      zones: { ...SAMPLE_LOOK.zones, lip: { tone: 'berry', finish: 'matte', intensity: 3 } },
    });
    expect(toSessionView(changed, { maxRenders: 3 }).renderOffer?.alreadyRendered).toBe(false);
  });

  it('★ 额度用尽时那条消息**照旧在**,只是 `left` 为 0(前端据它不给按钮)', () => {
    // 妆面定了、照片也有了,用户当然会想"那图呢"——一片空白什么都不说,比说一句"次数用完了"更像坏了。
    const spent = setFaceRef(
      setLookSpec(
        baseSession({
          renders: [
            { seq: 1, ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' }, lookDescription: 'x', createdAt: 'x' },
          ],
        }),
        SAMPLE_LOOK,
      ),
      FACE_REF,
    );

    const view = toSessionView(spent, { maxRenders: 1 });

    expect(view.renderOffer?.left).toBe(0);
    expect(view.renderOffer?.max).toBe(1);
    expect(view.renderOffer?.summary).toContain('还可以出 0 张');
  });

  it('★ 不限量(`maxRenders = 0`)时 `left` 是 `null`,**不是 0**', () => {
    // 照 `rendersLeft()` 原样透出的话这里恒为 0,前端会把"随便出"读成"用完了",
    // 然后把一个能用的按钮藏起来。
    const view = toSessionView(readySession(), { maxRenders: 0 });

    expect(view.renderOffer?.left).toBeNull();
    expect(view.renderOffer?.max).toBe(0);
  });

  it('出过的图:url 是**本模块**的取图路由,lookDescription 是历史说法', () => {
    const withRender = baseSession({
      renders: [
        { seq: 1, ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' }, lookDescription: '当时那套', createdAt: '2026-09-16T00:00:00.000Z' },
      ],
    });

    const view = toSessionView(withRender, { maxRenders: 3 });

    expect(view.renders[0]).toEqual({
      seq: 1,
      url: '/agent/sessions/s1/renders/1',
      lookDescription: '当时那套',
      createdAt: '2026-09-16T00:00:00.000Z',
    });
    expect(view.hasFace).toBe(false);
    // ★ `messages[]` 一律不透出去(内部形状 + tool_result 里有衣橱全文)。
    expect('messages' in view).toBe(false);
  });

  it('★ 查过的产品:**恒在的数组**(照 renders,不是"空则无键")', () => {
    // 两种省略语义不能混用:renders / consultedProducts 表达的是"一个集合的状态"(空的),
    // pendingRender 表达的是"一件事在不在"(没有)。混用前端就得写两套判空。
    const view = toSessionView(readySession(), { maxRenders: 3 });
    expect(view.consultedProducts).toEqual([]);
    expect('consultedProducts' in view).toBe(true);
  });

  it('★ 查过的产品要透出 id/名称/类目 —— 前端那个「品牌参考」角标靠它,角标文案不由模型定', () => {
    const withProducts = baseSession({
      consultedProducts: [
        { id: '42-rouge', name: '某细管口红', categoryLabel: '唇部彩妆' },
        { id: '29-base', name: '某气垫', categoryLabel: '底妆类' },
      ],
    });

    const view = toSessionView(withProducts, { maxRenders: 3 });

    expect(view.consultedProducts).toEqual([
      { id: '42-rouge', name: '某细管口红', categoryLabel: '唇部彩妆' },
      { id: '29-base', name: '某气垫', categoryLabel: '底妆类' },
    ]);
  });

  it('额度报的是**剩余**张数,与配置同源', () => {
    const oneOut = baseSession({
      renders: [
        { seq: 1, ref: { storeKey: 'results/s1/r1/result.png', mimeType: 'image/png' }, lookDescription: 'x', createdAt: 'x' },
      ],
    });
    expect(renderConfirmationSummary(oneOut, 3)).toContain('还可以出 2 张(上限 3 张)');
    // 换一个上限,同一份会话报出来的数跟着变——**不是写死的**。
    expect(renderConfirmationSummary(oneOut, 5)).toContain('还可以出 4 张(上限 5 张)');
  });
});

// ── ⑧ ArtifactStore.remove:TTL 的"真删"实际落到哪 ──────────────────────────

describe('ArtifactStore.remove(真实文件系统)', () => {
  it('★ 连照片带全部产物一起真删,`<id>/r1` 这种嵌套目录也删得掉,且幂等', async () => {
    const dataDir = mkTempDir();
    const store = new FileSystemArtifactStore(dataDir);

    // 一张照片 + 两张成品图(嵌套 id 就是会话多图那条路)。
    await store.putInputFile('s1', 'face', {
      originalName: 'me.png',
      mimeType: 'image/png',
      stream: Readable.from(['face']),
    });
    const src = path.join(dataDir, 'src.png');
    writeFileSync(src, 'img');
    await store.putResult('s1/r1', src, 'image/png');
    await store.putResult('s1/r2', src, 'image/png');
    // 另一个会话的东西必须**不受影响**。
    await store.putResult('s10/r1', src, 'image/png');

    expect(existsSync(path.join(dataDir, 'inputs', 's1'))).toBe(true);
    await store.remove('s1');

    expect(existsSync(path.join(dataDir, 'inputs', 's1'))).toBe(false);
    expect(existsSync(path.join(dataDir, 'results', 's1'))).toBe(false);
    // ★ 前缀相近的邻居不能被误删(`s1` 不该连 `s10` 一起删)。
    expect(existsSync(path.join(dataDir, 'results', 's10', 'r1'))).toBe(true);

    // 幂等:删不存在的不算错(清理任务可能重复跑)。
    await expect(store.remove('s1')).resolves.toBeUndefined();
  });

  it("★ `remove('..')` 必须被拦——放它过去就是一次 `rm -rf <dataDir>`", async () => {
    const dataDir = mkTempDir();
    const store = new FileSystemArtifactStore(dataDir);
    writeFileSync(path.join(dataDir, 'users.json'), '{"别删我":true}');

    // `path.join('inputs', '..')` 规范化成 `.`,resolve 出来正好是数据目录**根**。
    await expect(store.remove('..')).rejects.toThrow(/非法的存储键/);
    // 外面那层目录连同里面的东西必须原样在。
    expect(existsSync(path.join(dataDir, 'users.json'))).toBe(true);
  });

  it('越界到数据目录**外面**的 id 也被拦', async () => {
    const dataDir = mkTempDir();
    const store = new FileSystemArtifactStore(dataDir);
    await expect(store.remove('../../outside')).rejects.toThrow(/非法的存储键/);
  });
});
