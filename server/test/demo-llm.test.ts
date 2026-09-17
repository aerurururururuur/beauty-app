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
import { MockEngine } from '../src/modules/makeup/index.js';
import type { EngineInput, EngineResult, LookSpec } from '../src/modules/makeup/index.js';
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
  const maxRenders = 3;
  const sessions = new InMemorySessionStore();
  // ★ `DemoLlm` 是**装配里那一个**,不是测试自己的替身(见文件头)。
  const llm = new DemoLlm();
  const loop = new AgentLoop({
    llm,
    tools: createToolRegistry({ cosmetics, engine, artifacts, maxRenders }),
  });
  const renderTool = new RenderLookTool({ engine, artifacts, maxRenders });

  return {
    dataDir,
    artifacts,
    engine,
    maxRenders,
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
    const view = toSessionView(pending.session, { maxRenders: h.maxRenders });
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

  it('★ 点「确认出图」→ 整轮重放、真出图,会话里记下第 1 张', async () => {
    const { h, sessionId, pending } = await upToPending();

    const done = await h.confirmRender.execute(sessionId, USER);

    expect(done.stopReason).toBe('end_turn');
    // ★ 引擎真的被调了一次,拿到的是**那份妆面**与**那张照片**(不是空的)。
    expect(h.engine.inputs).toHaveLength(1);
    expect(h.engine.inputs[0]?.lookSpec).toEqual(pending.session.lookSpec);
    expect(h.engine.inputs[0]?.face.filePath).toBeTruthy();

    const view = toSessionView(done.session, { maxRenders: h.maxRenders });
    expect(view.renders).toHaveLength(1);
    expect(view.renders[0]?.seq).toBe(1);
    expect(view.renders[0]?.url).toBe(`/agent/sessions/${sessionId}/renders/1`);
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

    const view = toSessionView(after.session, { maxRenders: h.maxRenders });
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
      'pendingRender' in toSessionView(again.session, { maxRenders: h.maxRenders }),
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
      setLookSpec(createSession(sessionId, USER), interviewLook()),
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

/** 与 `demo-llm.ts` 里那份同形(场合换成面试,好认);只是给"钉标记"那组当输入。 */
function interviewLook(): LookSpec {
  return {
    occasion: 'interview',
    base: { coverage: 3, finish: 'satin', warmth: 0 },
    zones: {
      lip: { tone: 'rose', finish: 'matte', intensity: 3 },
      cheek: { tone: 'coral', finish: 'satin', intensity: 2 },
      eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 },
      brow: { shape: 'natural', intensity: 2 },
    },
  };
}
