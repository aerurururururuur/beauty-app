/**
 * `AGENT_LLM=mock` 那段**脚本化演示**的整条链路单测。
 *
 * ★ **为什么单开一组,而且非要用装配里那一个 `DemoLlm` 不可。**
 *   `compose.ts` 把 `mock` 这一档接到了 `DemoLlm` 上,它现在是**缺省配置下唯一**
 *   能走到 `awaiting_confirmation` 的驱动(`MockLlm` 的空脚本永远走不到)。
 *   而"确认出图"是全项目唯一花钱的链路——它此前**一条自动化证据都没有**,
 *   只有"没挂待确认就 422"那一半。所以这里不另建一个同形状的替身:
 *   替身测不出"装配起来的那条到底通不通",而那正是要验的东西。
 *
 * ⚠️ **它测的是链路,不是妆效。** `MockEngine` 把输入照片原样当成品返回,
 *   所以"出图成功了"在这里只意味着"确认框点下去真的走到了引擎"。
 *   妆面好不好看只有 `MAKEUP_ENGINE=image` 能回答,而那要花钱,不在这组里。
 *
 * ⚠️ 也**测不出**"真模型会怎么回话":`DemoLlm` 是一段脚本,它按固定规则演,
 *   不解析语义。它证明的是**循环与闸门是通的**,不是模型的行为。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSystemArtifactStore } from '../src/modules/assets/index.js';
import { BrowSpec, LookSpec, LookSpecBase, MockEngine, ZoneSpec } from '../src/modules/makeup/index.js';
import type { EngineInput, EngineResult } from '../src/modules/makeup/index.js';
import { createSessionArtifacts } from '../src/session-artifacts.js';
import {
  AgentLoop,
  AttachPhoto,
  ConfirmRender,
  DemoLlm,
  InMemorySessionStore,
  PHOTO_ATTACHED_NOTE,
  RENDER_DECLINED_PREFIX,
  RENDER_DONE_PREFIX,
  RenderLookTool,
  SendMessage,
  StartSession,
  TOOL_NAMES,
  createSession,
  createToolRegistry,
  danglingToolUses,
  setFaceRef,
  setLookSpec,
  textOf,
  toSessionView,
} from '../src/modules/agent/index.js';
import type {
  CosmeticReader,
  PhotoUpload,
  Session,
  SessionArtifacts,
  ToolResultBlock,
} from '../src/modules/agent/index.js';
import { realFeatures, realPalette } from './helpers/face-catalog.js';
import { realHexOf } from './helpers/product-content.js';
import { STYLE_LIBRARY, styleById } from '../src/modules/styling/index.js';
import {
  renderCountOf,
  requiredZonesOf,
  targetOfStepName,
} from '../src/modules/agent/application/step-zones.js';

const USER = 'u1';
/**
 * ★ 开会话现在要校验归属用户存在。这里给的就是 `USER` 一个真用户——
 *   装配根那条闭包(`src/index.ts` 的 `userExists`)在这里的对应物。
 *   不存在的那条路没有放宽:`test/agent-render.test.ts` 里有一组专测它。
 */
const users = { exists: async (userId: string): Promise<boolean> => userId === USER };
/** 一句话里带"面试",所以演示脚本会把它认成 `interview` 这个场合。 */
const START_TEXT = '下周三面试,我偏油,不要太浓';
/**
 * 表单页那条动线的开场白 —— **逐字照抄** `vue/src/stores/design.js` 的 `OPENING_TEXT`。
 * ★ 一个字都不提场合,也不提肤色:需求全在 `POST /agent/sessions` 带的那份 `brief` 里。
 */
const FORM_OPENING = '按我填的需求给我定一套妆。';

/**
 * 记录每次 `generate` 的入参,行为仍然是**真的 `MockEngine`**。
 * 用它而不是手写一个假引擎,是为了让"引擎真的被调了一次、拿到的是那份妆面与照片路径"
 * 这句话有证据——而引擎自己的产物形状仍归 `mock-engine.test.ts` 管。
 */
class RecordingMockEngine extends MockEngine {
  readonly inputs: EngineInput[] = [];

  override async generate(input: EngineInput): Promise<EngineResult> {
    this.inputs.push(input);
    return super.generate(input);
  }
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 一份"什么都接上了"的装配,与本模块的 `createAgentModule` 同形(只是分步给出来)。 */
function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'demo-llm-'));
  tempDirs.push(dataDir);
  const artifacts: SessionArtifacts = createSessionArtifacts(
    new FileSystemArtifactStore(dataDir),
    // ★ 按真实配置传(`config.makeupOutDir` = `<DATA_DIR>/engine-out`)——
    //   它是"收编之后哪些源文件可以删"的那道边界。
    { engineOutDir: path.join(dataDir, 'engine-out') },
  );
  // 衣橱给空:这条链路验的是"需求 → 妆面 → 照片 → 确认出图",没有一步需要衣橱。
  const cosmetics: CosmeticReader = { listByUser: async () => [] };

  const engine = new RecordingMockEngine();
  const sessions = new InMemorySessionStore();
  // ★ `DemoLlm` 是**装配里那一个**,不是测试自己的替身(见文件头)。
  const llm = new DemoLlm(realPalette());
  const loop = new AgentLoop({
    llm,
    // ★ `palette` 是 `ToolDeps` 的必填项(缺了肤色收窄会**静默失效**)。
    //   这里用与组装根同一份真实词表 —— 拿假档位凑一个,测的就不是生产那条链路了。
    tools: createToolRegistry({
      cosmetics,
      engine,
      artifacts,
      palette: realPalette(),
      features: realFeatures(),
      // ★ 同组装根那道缝:色值查真产品库。这条链路是"对话 → 方案 → 出图"整条走一遍,
      //   色块没颜色是它在生产里最可能的坏法,拿空串替身就把它盖掉了。
      shades: { hexOf: realHexOf },
    }),
  });
  const renderTool = new RenderLookTool({ engine, artifacts });

  return {
    dataDir,
    artifacts,
    engine,
    sessions,
    loop,
    renderTool,
    startSession: new StartSession({ sessions, users }),
    sendMessage: new SendMessage({ sessions, loop }),
    attachPhoto: new AttachPhoto({ sessions, artifacts }),
    confirmRender: new ConfirmRender({ sessions, loop }),
  };
}

const upload = (): PhotoUpload => ({
  originalName: 'me.png',
  mimeType: 'image/png',
  stream: Readable.from(['face-bytes']),
});

/** 从会话历史里数出某个工具被调用过几次(`tool_use` 块的数量)。 */
function callsOf(session: Session, name: string): number {
  return session.messages
    .flatMap((m) => m.content)
    .filter((b) => b.type === 'tool_use' && b.name === name).length;
}

/** 历史里全部工具结果。 */
function resultsOf(session: Session): ToolResultBlock[] {
  return session.messages
    .flatMap((m) => m.content)
    .filter((b): b is ToolResultBlock => b.type === 'tool_result');
}

/** 会话历史里有没有**任何一条失败**的工具结果。 */
function hasToolError(session: Session): boolean {
  return resultsOf(session).some((b) => b.isError === true);
}

/** 最后一条 assistant 说的话(空串 = 它没说话,前端会得到一个空气泡)。 */
function lastAssistantText(session: Session): string {
  const assistant = [...session.messages].reverse().find((m) => m.role === 'assistant');
  return assistant ? textOf(assistant).trim() : '';
}

/**
 * 走到"确认框已经弹出来"那一步,并把摊子交给用例。
 * 三个用例都要这一段,抄三遍就会有三份不一样的走法。
 */
async function upToPending() {
  const h = setup();
  const session = await h.startSession.execute(USER);
  const first = await h.sendMessage.execute(session.id, USER, START_TEXT);
  await h.attachPhoto.execute(session.id, USER, upload());
  const pending = await h.sendMessage.execute(session.id, USER, '行,就按你说的');
  return { h, sessionId: session.id, first, pending };
}

// ── ① ★ 整条链路:需求 → 妆面 → 照片 → 确认框 → 真出图 ──────────────────────

describe('离线演示的整条链路', () => {
  it('★ 第一轮:记下需求 + 提一套妆面,然后要照片(**没有任何工具失败**)', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER);

    const turn = await h.sendMessage.execute(session.id, USER, START_TEXT);

    expect(turn.stopReason).toBe('end_turn');
    // ★ 需求原样进 `brief`:脚本解析不了意图,编一个"面试"出来就是替用户说了没说过的话。
    expect(turn.session.brief.sceneText).toBe(START_TEXT);
    // ★ spec 定下来了 ⇒ 它通过了 `validateLookSpec`(`propose_look` 失败时不会写 lookSpec)。
    expect(turn.session.lookSpec?.occasion).toBe('interview');
    // ★ 这一条是上面那句的**直接**证据:没有任何工具回过错。
    //   少了它,"spec 不合法"会与"spec 合法"长得一模一样(循环照样往下走)。
    expect(hasToolError(turn.session)).toBe(false);
    expect(turn.session.faceRef).toBeUndefined();

    // ★ 空会话不伪造开场白:这里每条 assistant 正文都是脚本真的说了话(见 `AgentView.vue`)。
    expect(lastAssistantText(turn.session)).not.toBe('');
  });

  it('★ 照片挂上之后:提议出图 → **停在等确认**(引擎一次都没调)', async () => {
    const { h, pending } = await upToPending();

    expect(pending.stopReason).toBe('awaiting_confirmation');
    expect(pending.events).toContainEqual(
      expect.objectContaining({ type: 'tool_pending', name: TOOL_NAMES.renderLook }),
    );
    // ★ 这才是"钱还没花":提议阶段引擎不该被调用。
    expect(h.engine.inputs).toHaveLength(0);
    // 欠着的那条 `tool_use` 就是停机点,也是下次进入时必须先了结的东西。
    expect(danglingToolUses(pending.session.messages).map((c) => c.name)).toEqual([
      TOOL_NAMES.renderLook,
    ]);

    // ── 对外视图 ──
    const view = toSessionView(pending.session);
    expect(view.pendingRender).toBeDefined();
    expect(view.hasFace).toBe(true);
    expect(view.renders).toEqual([]);
    expect(view.lookDescription).toBeDefined();
    // ★ 确认框那句话**只有一处来源**——事件里与视图里必须是同一句。
    const pendingEvent = pending.events.find((e) => e.type === 'tool_pending');
    expect(pendingEvent).toMatchObject({ summary: view.pendingRender?.summary });
  });

  it('★★ 假后端也不许转述那个确认框 —— 脚本演的就是我们允许的行为', async () => {
    const { pending } = await upToPending();

    // 真实模型那边是同一条禁令(见 `system-prompt.ts` 第 6 条与 `RENDER_LOOK` 的描述)。
    // ★ 这一支在脚本里**本来是"安全"的**:④ 保证照片已在,这句话又和 `render_look`
    //   的调用在同一条回复里,框一定会弹。**正因为"安全",它最容易被当成范式抄回去**
    //   ——而 `v7` 之后"转述那个框"本身就不合法了(框是界面自己弹、自己解释的)。
    //   假后端说的话也是产品说的话,这一条防的是两套说法漂开。
    expect(lastAssistantText(pending.session)).not.toMatch(
      /确认之后|点了确认|等你确认|等你点|交给你确认|交由你确认|请你确认|点一下确认/,
    );
    // 但它**要**把话说到"要不要出一张"—— 否则用户不知道该去看下面那张卡。
    expect(lastAssistantText(pending.session)).toContain('成片');
  });

  it('★ 点「确认出图」→ 整轮重放、**每个上妆步各出一张**,会话里全记下', async () => {
    const { h, sessionId, pending } = await upToPending();

    const done = await h.confirmRender.execute(sessionId, USER);

    expect(done.stopReason).toBe('end_turn');
    // ★ ✏️ 2026-10-01:一次确认出**多张**(每个上妆步一张)。示范脚本给的是
    //   `STYLE_LIBRARY[0]`(`natural`:底妆 / 局部提亮 / 腮红 / 眼妆 / 唇妆)⇒ 5 张。
    //   ⚠️ 这个数是**配方决定的**,不是常量:改 `STYLE_LIBRARY[0]` 这条会跟着动,
    //   而它要钉的正是"张数与配方对得上"这件事。
    const plan = pending.session.plan!;
    const shots = renderCountOf(plan);
    expect(shots).toBe(5);
    expect(h.engine.inputs).toHaveLength(shots);
    for (const input of h.engine.inputs) {
      expect(input.lookSpec).toEqual(pending.session.lookSpec);
      expect(input.face.filePath).toBeTruthy();
    }
    // ★ 逐张累积:`appliedZones` 只增不减,最后一张才是整套(它 = 今天那张成片)。
    const applied = h.engine.inputs.map((i) => i.appliedZones?.length ?? 0);
    expect(applied).toEqual([...applied].sort((a, b) => a - b));
    expect(h.engine.inputs.at(-1)?.appliedZones).toEqual(requiredZonesOf(plan).map((z) => z.role));
    // 第一张是底妆那一步 ⇒ 一个区都还没画上(但键**在**,不是 `undefined`)。
    expect(h.engine.inputs[0]?.appliedZones).toEqual([]);

    const view = toSessionView(done.session);
    expect(view.renders).toHaveLength(shots);
    expect(view.renders.map((r) => r.seq)).toEqual(
      Array.from({ length: shots }, (_, i) => i + 1),
    );
    expect(view.renders[0]?.url).toBe(`/agent/sessions/${sessionId}/renders/1`);
    // ★ 每个上妆步都对到一张图;护肤 / 妆前 / 防晒 / 定妆不在这张表里(它们没有图,
    //   服务端不摆一个点下去没有结果的入口)。
    const renderable = plan.steps.filter((s) => {
      const target = targetOfStepName(s.name);
      return target !== undefined && target !== 'none';
    });
    expect(Object.keys(view.stepRenders)).toHaveLength(renderable.length);
    // ★ 出了图就不再欠账,确认框不该再出现(否则用户会被问第二次)。
    expect(view.pendingRender).toBeUndefined();
    expect(danglingToolUses(done.session.messages)).toEqual([]);
    // ★ 出完之后脚本接住了话头,问"这张行不行",而不是又提议一次。
    expect(lastAssistantText(done.session)).not.toBe('');
    expect(callsOf(done.session, TOOL_NAMES.renderLook)).toBe(1);
  });

  it('★ 开一个新会话能**从头再演一遍**(这就是它按状态求值、不按顺序取脚本的理由)', async () => {
    const h = setup();

    const first = await h.startSession.execute(USER);
    const a = await h.sendMessage.execute(first.id, USER, START_TEXT);
    const second = await h.startSession.execute(USER);
    const b = await h.sendMessage.execute(second.id, USER, START_TEXT);

    // 按位置取脚本的写法,第二次会接着上次的位置往下演(甚至已经"演完了")。
    expect(b.session.lookSpec).toEqual(a.session.lookSpec);
    expect(b.session.brief.sceneText).toBe(START_TEXT);
    expect(b.stopReason).toBe('end_turn');
  });
});

// ── ② ★ 用户说「先不出图」之后:不再提议 ─────────────────────────────────────

describe('用户没点确认、而是说了句别的', () => {
  it('★ 待确认被收掉、确认框消失,而且**不再提议出图**、引擎一次都没调', async () => {
    const { h, sessionId, pending } = await upToPending();
    expect(pending.stopReason).toBe('awaiting_confirmation');

    const after = await h.sendMessage.execute(sessionId, USER, '这次先不出图,我们再调调妆面');

    // ★ 那一轮先被按 `declined` 了结(缺省就是不批准),这一步**还清了欠账**。
    expect(danglingToolUses(after.session.messages)).toEqual([]);
    const result = resultsOf(after.session).find((b) =>
      b.content.includes(RENDER_DECLINED_PREFIX),
    );
    // 被拒不是错误:它是一条正常结果,不该带 `isError`(带了会让模型以为工具坏了)。
    expect(result?.isError).toBeUndefined();
    // ★ 这句话里必须说清"没花钱"——用户点的是拒绝,他要知道自己没被扣费。
    expect(result?.content).toContain('没有产生费用');

    const view = toSessionView(after.session);
    // ★ 这就是"刷新之后卡片不会又冒出来"的依据。
    expect('pendingRender' in view).toBe(false);
    expect(h.engine.inputs).toHaveLength(0);
    // ★★ 最要紧的一条:没有**新增**的 `render_look` 调用。
    //    不认这一条,用户点完「先不出图」会立刻又看到一个确认框——那比没有确认框更像 bug。
    expect(callsOf(after.session, TOOL_NAMES.renderLook)).toBe(1);
    // 脚本接住了话头(把话题引回妆面),而不是沉默。
    expect(lastAssistantText(after.session)).not.toBe('');
  });

  it('★ 被拒之后再聊一句也**不会**又弹确认框:宁可说"演完了",也不重复提议', async () => {
    const { h, sessionId } = await upToPending();
    await h.sendMessage.execute(sessionId, USER, '这次先不出图,我们再调调妆面');

    // ★ 正是最容易食言的一刻:脚本那句是「你觉得刚才那套哪里想改?」——
    //   用户真的答了一句,若这一步又提议出图,就等于请人说话再无视他说了什么,
    //   而且他会立刻看到第二个确认框(点完拒绝再来一个,比没有确认框更像 bug)。
    const again = await h.sendMessage.execute(sessionId, USER, '那嘴唇再淡一点');

    expect(callsOf(again.session, TOOL_NAMES.renderLook)).toBe(1);
    expect(danglingToolUses(again.session.messages)).toEqual([]);
    expect(
      'pendingRender' in toSessionView(again.session),
    ).toBe(false);
    expect(h.engine.inputs).toHaveLength(0);
    // 也不能沉默或现编一句"我改好了"——**如实说脚本演完了**。
    expect(lastAssistantText(again.session)).toContain('演示脚本');
  });
});

// ── ③ 钉住那几个标记:演示驱动靠它们判断"出成了 / 被拒了 / 照片到手了" ──────

describe('observation 标记', () => {
  it('★ 两个前缀必须**正好是**工具实际那句话的开头(改了措辞这里会红)', async () => {
    const h = setup();
    const sessionId = 'pinsession01';
    const faceRef = await h.artifacts.putFace(sessionId, upload());
    const session = setFaceRef(
      // ★ 第三个实参是**方案**,这里给 `undefined` = "这套妆面没有配方":
      //   这一组验的是出图那两个前缀,与方案无关,而 `setLookSpec` 刻意不给缺省
      //   (理由见那个函数的注释)。
      setLookSpec(createSession(sessionId, USER), interviewLook(), undefined),
      faceRef,
    );

    const declined = await h.renderTool.run({}, { session, confirmation: 'declined' });
    expect(declined.content.startsWith(RENDER_DECLINED_PREFIX)).toBe(true);

    const done = await h.renderTool.run({}, { session, confirmation: 'approved' });
    expect(done.content.startsWith(RENDER_DONE_PREFIX)).toBe(true);
  });

  it('★ 两个前缀必须能分开「出成了」与「被拒了」,而且不含 markdown 强调号', () => {
    // 空串会让 `readState` 对任何一句都判成命中。
    expect(RENDER_DONE_PREFIX).not.toBe('');
    expect(RENDER_DECLINED_PREFIX).not.toBe('');
    // 一个是另一个的前缀 ⇒ 判断顺序一变结论就翻。
    expect(RENDER_DONE_PREFIX.startsWith(RENDER_DECLINED_PREFIX)).toBe(false);
    expect(RENDER_DECLINED_PREFIX.startsWith(RENDER_DONE_PREFIX)).toBe(false);
    // ★ 那两句 observation 里有 `**`(所以当初只导出前缀,不导出整句)——
    //   前缀一旦把强调号吃进来,`includes` 那条比对就会因为 markdown 而失配。
    expect(RENDER_DONE_PREFIX).not.toContain('*');
    expect(RENDER_DECLINED_PREFIX).not.toContain('*');
  });

  it('★ 照片那句话就是 `AttachPhoto` 写进历史那一句(演示据它判断该不该提议出图)', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER);

    const withFace = await h.attachPhoto.execute(session.id, USER, upload());

    // 视图**不透出**这条消息,所以前端得自己往气泡里补同一句话——两边靠这个常量对齐。
    const last = withFace.messages.at(-1);
    expect(last && textOf(last)).toBe(PHOTO_ATTACHED_NOTE);
    expect(withFace.faceRef).toBeDefined();
    // ★ 照片字节不进消息历史(几 MB 的 base64 进去,会话就没法落盘、每轮都要带着它)。
    expect(JSON.stringify(withFace.messages)).not.toContain('face-bytes');
  });
});

// ── ④ ★ 表单那条路:需求一次填完,脚本要照着 `brief` 演 ──────────────────────

/**
 * **最后一次** `propose_look` 的入参。
 *
 * ★ 必须从这里取,不能从 `session.lookSpec` 取:`styleId` **不属于妆面单**
 *   (它是工具自己那一格,`lookSpecSchema` 是 `.strict()` 的),落不到 `lookSpec` 上。
 *   要验的恰恰是"脚本挑的配料是哪一个",那就只有这一处看得到。
 *
 * ⚠️ **取最后一次而不是第一次**:换风格那一轮之后历史里有两条,而当前那份方案
 *   来自**后**提的那一条(会话那次是"重跑一遍",不是"再记一份")。
 */
function proposeInputOf(session: Session): Record<string, unknown> {
  const calls = session.messages
    .flatMap((m) => m.content)
    .filter((b) => b.type === 'tool_use' && b.name === TOOL_NAMES.proposeLook);
  const call = calls[calls.length - 1];
  if (!call || call.type !== 'tool_use') throw new Error('这一轮没有调用 propose_look');
  if (typeof call.input !== 'object' || call.input === null) {
    throw new Error('propose_look 的入参不是对象');
  }
  return call.input as Record<string, unknown>;
}

/**
 * `/result` 那条切换条发给 agent 的原话 —— **逐字照抄** `vue/src/stores/design.js` 的 `setStyle`。
 * ★ 别自己写一句"换成 X":演示脚本认的就是括号里那个 id,句子一改它就认不出来。
 */
function switchTextOf(styleId: string): string {
  const style = styleById(styleId);
  if (!style) throw new Error(`测试里写了一个不存在的风格 id:${styleId}`);
  return `换成「${style.name}」(${style.id}) 这个风格，重新给我一套。`;
}

/**
 * 用户**没填风格**时脚本会挑的那一条(`demo-llm.ts` 的 `styleFor`:认不出就取全表第一条)。
 * ★ 写成一个具名常量而不是到处抄字面量:这条规则一改,下面几组测试的**前提**要一起改,
 *   而抄了五遍的 `'natural'` 改起来一定会漏一处 —— 那一处就是"看起来还绿着的假绿"。
 */
const DEFAULT_STYLE_ID = STYLE_LIBRARY[0]?.id ?? '';

/** 从入参里读一格妆面的色。入参是 `unknown`,所以这里逐层窄化。 */
function toneOfZone(input: Record<string, unknown>, zone: string): unknown {
  const zones = input.zones;
  if (typeof zones !== 'object' || zones === null) return undefined;
  const spec = (zones as Record<string, unknown>)[zone];
  if (typeof spec !== 'object' || spec === null) return undefined;
  return (spec as Record<string, unknown>).tone;
}

describe('★ 表单那条路:需求一次填完(demo 脚本照着 brief 演)', () => {
  it('★ 表单带下来的「用户原话」不会被那句开场白盖掉(brief 那一格以表单为准)', async () => {
    const h = setup();
    // 用户真正写的东西随 `brief` 一次填完,而第一句话是上面那句**固定句式**。
    const sceneText = '下个月闺蜜生日会,想亮一点但别太夸张;我脸偏圆,人多的时候要拍照。';
    const session = await h.startSession.execute(USER, { occasion: 'party', sceneText });

    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    // ★ `patch_brief` 的 `sceneText` 是**设为**不是追加,所以脚本在这里再记一次
    //   就会把用户写的那段整个换成"按我填的需求给我定一套妆"——方案照出、日志干净,
    //   只有"用户原话"那一格是废话(假开关家族)。纯对话那条路仍然要记第一句
    //   (见本文件 ① 那条断言),两条合起来才是完整的行为。
    expect(turn.session.brief.sceneText).toBe(sceneText);
    expect(turn.session.brief.sceneText).not.toContain('按我填的需求');
    // 这一条不是废话:它证明"记需求"那一步是**被跳过**的,而不是把同样的字又写了一遍。
    expect(callsOf(turn.session, TOOL_NAMES.patchBrief)).toBe(0);
    expect(turn.session.plan).toBeDefined();
  });

  it('★ 场合以用户填的为准(这句话单看文字只能落到 daily)', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER, { occasion: 'travel' });

    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    const input = proposeInputOf(turn.session);
    // ★ 这一格是**用户的原话**、不是被脚本归的类:表单填什么就说什么。
    //   ✏️ 此前这条比的是「styleId 落在 travel 那一档的候选池里」——池子删了
    //   (场合与风格自由组合),这句话不再有判据。换成直接钉 `lookSpec.occasion`:
    //   它才是"brief 说了算"最直接的那一处,而此前它只能间接着这一条。
    expect(turn.session.lookSpec?.occasion).toBe('travel');
    expect(input.occasion).toBe('travel');
    expect(hasToolError(turn.session)).toBe(false);
  });

  it('★ 预设表外的场合原样带到妆面单上(不收进最近的一档)', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER, { occasion: '朋友的婚礼' });

    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    // ★★ 这条是本次松绑的现场证据:此前这句会被 422 打回,**整份 brief 一起丢**
    //   (用户别的几格全对也没用),而现在它必须一路走到妆面单上。
    //   若有人把"归成最近的一档"加回来,这里会变成「聚会」而红。
    expect(turn.session.lookSpec?.occasion).toBe('朋友的婚礼');
    expect(hasToolError(turn.session)).toBe(false);
  });

  it('★ 深肤色档:脚本挑的色落在该档的色域里(写死的那三个色在这档是非法的)', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER, {
      occasion: 'party',
      skinTone: 'deep_brown',
    });

    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    const allowed = realPalette().toneKeysFor('deep_brown');
    expect(allowed).toBeDefined();
    // ★ 前提:旧脚本写死的 rose / coral / nude 在这一档里**确实不在色域里**。
    //   少了这条,即使脚本一点没收窄,下面的断言也会全绿 —— 那就成了假开关。
    for (const tone of ['rose', 'coral', 'nude']) expect(allowed).not.toContain(tone);

    const input = proposeInputOf(turn.session);
    const picked = ['lip', 'cheek', 'eyeshadow'].map((zone) => toneOfZone(input, zone));
    for (const tone of picked) expect(allowed).toContain(tone);
    // 色收窄了而妆面单照旧定下来 ⇒ `validateLookSpec` 真的用这个色域放行了。
    expect(turn.session.lookSpec).toBeDefined();
    expect(hasToolError(turn.session)).toBe(false);
  });

  it('★ brief 里没有肤色档 → 不收窄(还是那三个色):「不知道」与「不能用」是两回事', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER, { occasion: 'party' });

    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    const input = proposeInputOf(turn.session);
    expect(toneOfZone(input, 'lip')).toBe('rose');
    expect(toneOfZone(input, 'cheek')).toBe('coral');
    expect(toneOfZone(input, 'eyeshadow')).toBe('nude');
  });

  it('★ 浅档不会因为"收窄"把色换掉(warm_ivory 那三个色本来就在色域里)', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER, {
      occasion: 'party',
      skinTone: 'warm_ivory',
    });

    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    // ★ 前提:`warm_ivory` 的色域里**本来就有** rose / coral / nude ——
    //   所以这条验的是"收窄在允许时不改动配色",与上面那条(不允许时换掉)配成一对。
    const allowed = realPalette().toneKeysFor('warm_ivory');
    for (const tone of ['rose', 'coral', 'nude']) expect(allowed).toContain(tone);

    const input = proposeInputOf(turn.session);
    expect(toneOfZone(input, 'lip')).toBe('rose');
    expect(toneOfZone(input, 'cheek')).toBe('coral');
    expect(toneOfZone(input, 'eyeshadow')).toBe('nude');
  });
});

// ── ⑤ ★ 换风格:`/result` 那条切换条点下去,脚本要真的重配一套 ──────────────────

/**
 * 表单那条路走到"确认框已经弹出来"。
 * ★ 用**表单**那条路(而不是 ① 那组的关键词路)是为了让 `brief` 一次填好 ——
 *   换风格认的是系统提示里那一行**可选风格清单**,而那行与场合无关(2026-09-30 起),
 *   所以这里用哪条路其实都行;保留表单路是因为它同时覆盖了"表单填的场合"
 *   与"结果页那条切换条"的衔接。
 */
async function upToPendingWith(occasion: string) {
  const h = setup();
  const session = await h.startSession.execute(USER, { occasion });
  const first = await h.sendMessage.execute(session.id, USER, FORM_OPENING);
  await h.attachPhoto.execute(session.id, USER, upload());
  const pending = await h.sendMessage.execute(session.id, USER, '行,就按你说的');
  return { h, sessionId: session.id, first, pending };
}

describe('★ 换风格:照用户点的那一个重配一套', () => {
  it('★ 需求刚填完就换 → 新提的 `propose_look` 就是点的那一个,方案跟着换', async () => {
    const h = setup();
    const session = await h.startSession.execute(USER, { occasion: 'party' });
    const first = await h.sendMessage.execute(session.id, USER, FORM_OPENING);
    // 前提:脚本缺省挑的和下面点的那一条**不是同一条**(否则"换了"无从谈起)。
    expect(proposeInputOf(first.session).styleId).toBe(DEFAULT_STYLE_ID);
    expect(DEFAULT_STYLE_ID).not.toBe('wolf');

    await h.attachPhoto.execute(session.id, USER, upload());
    const turn = await h.sendMessage.execute(session.id, USER, switchTextOf('wolf'));

    // ★ 多出来的那一条 `propose_look` 就是证据:没有它,脚本会落到 ⑤,
    //   用户点的是「换成 X」,收到的却是一个出图确认框(而方案一格没变)。
    expect(callsOf(turn.session, TOOL_NAMES.proposeLook)).toBe(2);
    expect(proposeInputOf(turn.session).styleId).toBe('wolf');
    // 用户看得到的那一格也要跟着换 —— `/result` 整屏的方案都照它重建。
    expect(turn.session.plan?.styleId).toBe('wolf');
    expect(turn.session.plan?.styleName).toBe(styleById('wolf')?.name);
    expect(hasToolError(turn.session)).toBe(false);
  });

  it('★★ 桌面上正摆着确认框时换风格 → 先按"不出图"了结欠账,**照旧**重配一套', async () => {
    // 这一条才是真现场:用户看到的那个确认框在服务端是一条**欠着的** `render_look`,
    // 下一句话进来时会先按 `declined` 重放掉。而"刚被拒"那条分支(②)正好在这一刻成立
    // ——少了 ⓪ 的优先判断,用户点了风格却只收到一句「行,那这次先不出图」。
    const { h, sessionId } = await upToPendingWith('party');

    const turn = await h.sendMessage.execute(sessionId, USER, switchTextOf('princess'));

    expect(callsOf(turn.session, TOOL_NAMES.proposeLook)).toBe(2);
    expect(proposeInputOf(turn.session).styleId).toBe('princess');
    expect(turn.session.plan?.styleId).toBe('princess');
    expect(hasToolError(turn.session)).toBe(false);
    // ★ 旧那一条已经被"不出图"了结掉了(它拿到了结果,不再是悬挂状态)——
    //   下半句是重点:了结**不等于**这次的结局。重配完之后脚本照 ⑤ 重新问一次,
    //   所以最后悬挂的那条是**为新方案提的那条**,而不是旧那条留着不走。
    expect(danglingToolUses(turn.session.messages)).toHaveLength(1);
    expect(danglingToolUses(turn.session.messages)[0]?.name).toBe(TOOL_NAMES.renderLook);
    expect(turn.stopReason).toBe('awaiting_confirmation');
    // ★★ 话里不能再指"刚才那套":用户屏幕上已经是新那套了。
    //   (原来这里会收到「行,那这次先不出图。我们接着调——你觉得刚才那套哪里想改?」——
    //   `readState` 把"上一套妆被拒"当成"这一套的结局"了。)
    expect(lastAssistantText(turn.session)).not.toContain('刚才那套');
    expect(lastAssistantText(turn.session)).toContain('成片');
  });

  it('★ 点的还是**当前**这一个 → 不重配(判据是"与上次提的不同",不是"句子里有风格 id")', async () => {
    // ★ 这条防的是空转:若 ⓪ 只看"这句话里提到了池子里的 id",那么它在**同一轮的重跑里
    //   会反复命中**(重跑时最后一句用户话没变),一路空转到 `max_iterations` ——
    //   而 `max_iterations` 在界面上就是"转了很久最后什么都没变"。
    //   这里的期望是**没花样**:方案不动(还是那一条 `propose_look`),
    //   脚本照 ⑤ 摆出那个出图确认框(用户点了个已经选中的风格,问他要不要出图并不算错)。
    const h = setup();
    const session = await h.startSession.execute(USER, { occasion: 'party' });
    await h.sendMessage.execute(session.id, USER, FORM_OPENING);
    await h.attachPhoto.execute(session.id, USER, upload());

    const turn = await h.sendMessage.execute(session.id, USER, switchTextOf(DEFAULT_STYLE_ID));

    expect(callsOf(turn.session, TOOL_NAMES.proposeLook)).toBe(1);
    expect(proposeInputOf(turn.session).styleId).toBe(DEFAULT_STYLE_ID);
    expect(turn.session.plan?.styleId).toBe(DEFAULT_STYLE_ID);
    expect(turn.stopReason).toBe('awaiting_confirmation');
  });

  /**
   * ★ **用户在表单里说了要什么风格,脚本就配那一条。**
   *
   * `styleText` 这一格是 2026-09-30 新加的(此前风格只能由算法按场合给 4 条),
   * 而脚本认它的方式与上面那张场合关键词表同一条口径:**名字逐字出现**就用它 ——
   * 查表,不假装理解语义。
   *
   * ⚠️ 下面用的是 `pure`(纯欲妆):它**不在** `DEFAULT_STYLE_ID` 那个 family 里,
   *   所以这条断言不可能是"碰巧挑对了缺省那条"。
   */
  it('★ 表单里写了「想要的风格」→ 脚本按那一条配(不再由算法按场合派)', async () => {
    const h = setup();
    const wanted = styleById('pure');
    expect(wanted, "测试写了一条不存在的配方 id").toBeDefined();
    expect(wanted!.family).not.toBe(styleById(DEFAULT_STYLE_ID)!.family);

    const session = await h.startSession.execute(USER, {
      occasion: 'party',
      styleText: `想要${wanted!.name}`,
    });
    const turn = await h.sendMessage.execute(session.id, USER, FORM_OPENING);

    expect(proposeInputOf(turn.session).styleId).toBe('pure');
    expect(turn.session.plan?.styleId).toBe('pure');
    expect(hasToolError(turn.session)).toBe(false);
  });
});

/** 与 `demo-llm.ts` 里那份同形(场合换成面试,好认);只是给"钉标记"那组当输入。 */
function interviewLook(): LookSpec {
  return new LookSpec({
    occasion: 'interview',
    base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
    zones: {
      lip: new ZoneSpec({ tone: 'rose', finish: 'matte', intensity: 3 }),
      cheek: new ZoneSpec({ tone: 'coral', finish: 'satin', intensity: 2 }),
      eyeshadow: new ZoneSpec({ tone: 'nude', finish: 'satin', intensity: 2 }),
      brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
    },
  });
}
