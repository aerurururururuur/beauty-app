/**
 * infrastructure/llm/demo-llm.ts —— ★ 离线演示驱动:`AGENT_LLM=mock` 时服务端回的就是它。
 *
 * ── 它为什么存在 ─────────────────────────────────────────────────────────────
 *
 * `MockLlm` 是**按脚本顺序**回话的,而 `compose.ts` 给它的是**空脚本**:脚本一用完就回一句
 * 「当前是演示模式」。这个设计对单测是对的,但它带来一个后果——**离线时永远走不到
 * `awaiting_confirmation`**(模型的回复里没有 `tool_use`,循环根本不会提议出图),
 * 于是"确认出图"这条全项目唯一花钱的链路,在安全的缺省配置下**一次都跑不起来**。
 *
 * 本文件填的就是这个坑:它不按顺序取脚本,而是**读请求里的状态**决定下一步,
 * 于是每一次开新会话都能从头演一遍,不用重启进程。
 *
 * ── ★ 为什么不写成"一份 FIFO 脚本"(`new MockLlm(DEMO_SCRIPT)`)────────────────
 *
 * 因为确认出图**那条路会消费一次 LLM 调用、却不增加 assistant 消息条数**:
 * 用户点确认后,`agent-loop.ts` 先把欠着的那一轮重放掉(这一步只追加一条 user 消息),
 * 然后才回头调模型。**任何按位置取脚本的写法,都会恰好在用户点下"确认"那一刻错位**——
 * 而那正是这个演示唯一必须对的地方。按状态求值的决策表**没有位置可以对错**。
 *
 * ── 它是什么、不是什么 ───────────────────────────────────────────────────────
 *
 * ★ **它是一段脚本,不是模型。** 它理解不了用户的话:除了下面那张**明写在代码里的场合关键词表**
 *   (那也只是把用户自己的词对到一个封闭枚举上),它不解析任何语义。
 *   所以**不能拿它判断妆面质量**,也不能拿它当"LLM 会怎么回话"的证据——
 *   那件事只有 `AGENT_LLM=real` 才能给出。
 *   同 `MockEngine`(缺省引擎,不调任何外部接口、把输入照片原样当成品返回)的地位:能跑通形状、
 *   不产生账单、文档里写明它不是真的。
 *
 * ⚠️ **它一条硬规则都不违反**:出图仍然走**工具 + 服务端确认回合**那道闸门,
 *   它只是"提议"出图,点不点是用户的事(见 `agent-loop.ts` 文件头 ⑦)。
 *   这也是它可以放心当缺省的原因——**它没有多花一分钱的能力**。
 */
import type { Occasion, SkinTone } from '../../../shared/index.js';
import { BrowSpec, LookSpec, LookSpecBase, ZoneSpec } from '../../../makeup/index.js';
import type { SkinTonePalette, ToneKey } from '../../../makeup/index.js';
import { stylePoolFor } from '../../../styling/index.js';
// ★ §4.2 后这上限属**业务规则**,值在 `shared` 的 validator,不在本模块的 schemas 里。
import { MAX_SCENE_TEXT, OCCASIONS, SKIN_TONES } from '../../../shared/index.js';
import { TOOL_NAMES } from '../../domain/tools/definitions.js';
import { PHOTO_ATTACHED_NOTE } from '../../domain/tools/observations.js';
import {
  RENDER_DECLINED_PREFIX,
  RENDER_DONE_PREFIX,
} from '../../domain/tools/observations.js';
import type { Message, ToolResultBlock } from '../../domain/entities/message.js';
import { ToolUseBlock, textOf, toolUsesOf } from '../../domain/entities/message.js';
import type { Llm, LlmRequest, LlmResponse } from '../../domain/ports/llm.js';
import { mockText, mockTextAndToolCalls } from './mock-llm.js';

/**
 * 场合关键词表。★ **这是这个文件里唯一"读用户的话"的地方**,而且它只是查表——
 * 命中的是用户自己说过的词,没命中就退回 `'daily'`。**不要让它长大**:真去理解语义是模型的事,
 * 一段关键词表越长越像"一个假装自己是模型的规则引擎",而那正是本仓库最反对的形状。
 *
 * ⚠️ **只填 `occasion`。肤色与肤质一个字都不填**:`patch_brief` 的描述里写着"不要替用户猜肤色",
 *   而猜错肤色会让 `validateLookSpec` 按错色域收窄(§6 规矩 4),把整套配色带偏。
 *   演示脚本宁可薄,也不替用户说没说过的话。
 */
const OCCASION_HINTS: readonly { readonly words: readonly string[]; readonly occasion: Occasion }[] = [
  { words: ['面试', '求职', '复试', '笔试'], occasion: 'interview' },
  { words: ['约会', '相亲', '纪念日'], occasion: 'date' },
  { words: ['上台', '演出', '演讲', '主持', '舞台', '年会'], occasion: 'stage' },
  { words: ['家长', '长辈', '父母', '婚礼', '拜年'], occasion: 'family' },
  { words: ['聚会', '派对', '闺蜜局', '生日会'], occasion: 'party' },
  { words: ['旅行', '旅游', '出游', '度假'], occasion: 'travel' },
  { words: ['奇想', '赛博', '水墨', '主题妆'], occasion: 'fantasy' },
];

/**
 * 把系统提示里「已知需求:…」那一行读回成一个表。
 *
 * ★ **为什么是读文本**:`DemoLlm` 手里只有 `messages` 与 `system`(见 `domain/ports/llm.ts`),
 *   而它要演的那两件事——用户填的**场合**、人设带上来的**肤色深浅**——都落在
 *   `session.brief` 上,每一轮由 `buildSystemPrompt` 印进那一行。
 *   ⚠️ **不给端口加一格会话状态**:真模型(`DashScopeLlm`)用不上它,
 *   为了一个假后端去改那道缝,是把成本记在业务层账上。
 *
 * ⚠️ **版式归 `brief-description.ts` 的 `FIELD_LABELS` 所有**(`键=值;键=值`),
 *   改那边就要一起改这里。读不到某一格是**正常情况**(那一格还没填),
 *   表里就是没有它——与"没填过"在这里本来就是同一件事。
 */
function readBriefLine(system: string | undefined): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  const line = /^已知需求:(.*)$/m.exec(system ?? '')?.[1];
  if (line === undefined) return fields;
  for (const part of line.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) fields.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return fields;
}

/** 「已知需求」里那个场合。没填过就是 `undefined`——纯对话那条路本来就没人填。 */
function occasionFrom(brief: ReadonlyMap<string, string>): Occasion | undefined {
  const raw = brief.get('场合');
  return OCCASIONS.find((o) => o === raw);
}

/** 「已知需求」里那个肤色。同上:没填过就是 `undefined`。 */
function skinToneFrom(brief: ReadonlyMap<string, string>): SkinTone | undefined {
  const raw = brief.get('肤色深浅');
  return SKIN_TONES.find((s) => s === raw);
}

/**
 * 这个场合的**首选**风格:池子里的第一个(顺序即优先级,见 `SCENE_STYLES`)。
 *
 * ★ 脚本**只演一遍**:它不读工具结果(见 `readState` 的 `answered`),也就没有
 *   "被拒了再改一次"的机会,所以 `styleId` 必须一次给对。
 * ⚠️ 池子非空这件事 `Record<Occasion, readonly string[]>` 的类型保证不了;
 *   真出现空池是**内容坏了**,该把话说明白,别拿空串去调工具(那会读成"id 不存在")。
 */
function firstStyleOf(occasion: Occasion): string {
  const first = stylePoolFor(occasion)[0];
  if (first === undefined) throw new Error(`演示脚本:场合「${occasion}」的风格池是空的。`);
  return first;
}

/**
 * 从这一档可用的色里挑一个:首选色能用就用它,不能用就取该档的第 `offset` 个。
 * ★ `offset` 只是让三个区**不至于都撞成同一个色**——挑色的标准是**合法**,不是好看。
 * ⚠️ `allowed === undefined` 表达的是**还不知道肤色**(不是"没有色可用"),
 *   那时原样返回首选色:校验器在肤色未知时本来就不收窄(`validateLookSpec` ③)。
 */
function toneFor(preferred: ToneKey, allowed: readonly ToneKey[] | undefined, offset: number): ToneKey {
  if (allowed === undefined || allowed.includes(preferred)) return preferred;
  return allowed[offset % allowed.length] ?? preferred;
}

// ── 它要说的话 ───────────────────────────────────────────────────────────────
//
// ★ **这些文案刻意一句都不描述那套妆长什么样**:妆面的人话只有一份,是 `describeLook`
//   (它作为 `lookDescription` 原样透给前端)。这里再描述一遍,就会出现两套说法
//   —— 而用户是拿那段文字决定要不要花钱出图的。

const INTRO_TEXT = '好,我按你说的先配一套。';
const ASK_PHOTO_TEXT =
  '出图之前我需要一张你的正面照——正面、光线均匀、不戴墨镜。传上来我就能按你的脸来配。';
/**
 * ★ **这句里不许再出现"确认之后我就开始出图"那类话**(2026-09-16,`v7`)。
 *
 * 它从前确实带着这半句,而这一支**在脚本里是"安全"的**:④ 保证照片已在,⑤ 又和
 * `render_look` 的调用在同一条回复里,框一定会弹。但**规则不这么看**——`v7` 之后
 * 模型一律不许转述那个框(理由见 `system-prompt.ts` 的 `v7` 沿革:框是界面自己弹、
 * 自己解释的,而模型看不到它,**给它句式它就会用句式**)。
 *
 * 于是这段脚本成了仓库里**唯一还在演示那句禁话**的地方,两处坏处:
 * 演示给人看时演的是一个我们已经否掉的行为;而它就在 `render_look.ts` 旁边,
 * 下一个人"照抄一句合适的话"时最容易抄到它。**假后端说的话也是产品说的话。**
 */
const PROPOSE_RENDER_TEXT = '妆面定下来了。要我出一张成片看看吗?';
const AFTER_RENDER_TEXT = '图出来了,你看这张行不行?有想调的地方告诉我。';
const AFTER_DECLINE_TEXT = '行,那这次先不出图。我们接着调——你觉得刚才那套哪里想改?';
/**
 * 换风格那一支的话。★ 同样**不描述那套妆长什么样**(见上面那一段),
 * 也不提确认框:那个框由界面自己摆,`v7` 起模型一律不许转述。
 */
const SWITCH_TEXT = '行,照这个风格重新配了一套。';

/**
 * 脚本演完之后的话。★ **它明说自己是脚本**——继续演下去就得现编,
 * 而一个会瞎编的假后端比一个承认自己演完了的假后端糟得多(同 `MockLlm` 的口径)。
 */
const SCRIPT_END_TEXT =
  '(这段演示脚本到这里就演完了:它只演一遍「需求 → 妆面 → 照片 → 确认出图」。' +
  '接上真实模型之后,我可以接着按你说的一点点调。)';

export class DemoLlm implements Llm {
  /**
   * ★ `name` 是给日志看的:`server/src/index.ts` 起服务时会打出实际用的哪个实现,
   * 免得现场分不清对面是真模型还是这段脚本。
   */
  readonly name = 'demo';

  /**
   * ★ `palette` 是**词表端口**,与 `ProposeLookTool` 拿的是同一个实例(组装根注入)。
   *
   * **它为什么必须有**:表单那条路会把人设上的肤色带进 `brief`,而 `propose_look`
   * 会**按肤色收窄色域**(§6 规矩 4)。写死一套色的脚本对 `warm_tan` / `wheat` /
   * `deep_brown` 三档是**整套被拒**的(`rose` / `nude` 不在那三档的色域里),
   * 缺省配置(`AGENT_LLM=mock`)下那就成了"配好了却出不了方案"——假开关的那张脸。
   * 所以三个区的色要从这一档可用的色里挑。
   * ⚠️ **必填、不给缺省**:缺省就退回到"写死一套色",而那正是这里要防的。
   */
  constructor(private readonly palette: SkinTonePalette) {}

  /** 调用 id 的自增计数。★ 全局唯一,不按会话重来——重了会让结果回填对错块。 */
  private calls = 0;

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const state = readState(request.messages);
    const brief = readBriefLine(request.system);

    // ⓪ ★ 用户在换风格(结果页那条切换条把 id 写在括号里)→ 照他点的那个人重配一套。
    //   没有这一支,换风格会落到 ② :用户点的是「换成 X」,脚本答的却是
    //   「行,那这次先不出图」——而结果页那条切换条**在缺省配置下就是个死按钮**
    //   (方案确实换了才行,见 `/result` 那一屏)。
    //   ⚠️ 判据是"点的那个人与**上次提的**不同"(不是"这句话里提到过风格"):
    //      后者会在同一轮的重跑里反复命中,一路空转到 `max_iterations`。
    const switched = styleInPool(state.lastUserText, stylePoolOf(request.system));
    if (switched !== undefined && switched.id !== state.lastStyleId) {
      const look = this.demoLook(switched.occasion, skinToneFrom(brief));
      return mockTextAndToolCalls(SWITCH_TEXT, [
        this.call(TOOL_NAMES.proposeLook, { ...look, styleId: switched.id }),
      ]);
    }

    // ① 刚刚出完图 → 讲一句、问行不行。★ 不再提议第二次(脚本只演一遍,见 ⑥)。
    if (state.justRanTools && state.lastRender === 'done') return mockText(AFTER_RENDER_TEXT);

    // ② ★ 刚刚被拒(用户说了句别的,那轮按 `declined` 重放了)→ 接住话头,
    //    **不再提议出图**。这条是这套规则里最要紧的一条:不认它,用户点完「先不出图」
    //    会立刻又看到一个确认框,那比没有确认框更像 bug。
    if (state.justRanTools && state.lastRender === 'declined') return mockText(AFTER_DECLINE_TEXT);

    // ③ 还没定下妆面 → 记需求 + 提妆面。两件事**同一条回复**里做完(它们同一轮,免费)。
    if (!state.hasProposedLook) {
      const calls: ToolUseBlock[] = [];
      // 用户第一句话就是传照片时没有"需求原文"可言,那就只提妆面、不硬塞一句空的需求。
      // ★ 表单那条路上第一句话是**开场白**(「按我填的需求给我定一套妆。」),
      //   而用户真正写的东西已经拼进 `brief` 了。这里再记一次会**把那份原文整个盖掉**
      //   (`patch_brief` 这一格是"设为",不是"追加"),所以简报里已经有
      //   「用户原话」时就不动它——那一格以表单收上来的为准。
      if (state.firstUserText && !brief.has('用户原话')) {
        calls.push(this.call(TOOL_NAMES.patchBrief, { sceneText: state.firstUserText }));
      }
      // ★ 场合以**用户填的**为准,读不到才退回关键词表 —— 与 `propose_look` 那条
      //   `brief.occasion ?? spec.occasion` 是同一个先后,两处不一致会让 `styleId`
      //   落在**别的场合**的池子里,而工具会当场拒掉它(脚本没有第二次机会)。
      const occasion = occasionFrom(brief) ?? occasionOf(state.firstUserText);
      const look = this.demoLook(occasion, skinToneFrom(brief));
      calls.push(
        this.call(TOOL_NAMES.proposeLook, { ...look, styleId: firstStyleOf(occasion) }),
      );
      return mockTextAndToolCalls(INTRO_TEXT, calls);
    }

    // ④ 还没有照片 → 要照片。没有它 `render_look` 会在提议阶段就被挡回(缺 faceRef)。
    if (!state.hasPhoto) return mockText(ASK_PHOTO_TEXT);

    // ⑤ **一次都没提议过**出图 → 提议。
    //    ⚠️ 判据是"从没提议过",**不是**"有 spec 有照片就提议"。三个反例都会空转:
    //       · 已拒(`declined`):② 刚说完「这次先不出图」,下一句又弹确认框 ——
    //         那段话还邀请用户"你觉得哪里想改",用户答了却换来一张确认框,等于脚本自己食言;
    //       · 已出成(`done`):图都出来了还提议第二次;
    //       · 失败(`other`,超额 / 引擎报错):既没出成也没被拒,无脑再提议会一路空转到 `max_iterations`。
    if (state.lastRender === null) {
      return mockTextAndToolCalls(PROPOSE_RENDER_TEXT, [this.call(TOOL_NAMES.renderLook, {})]);
    }

    // ⑥ 兜底:链路已经演过一遍了(出成 / 被拒 / 失败都落在这里)。**如实说,不现编。**
    return mockText(SCRIPT_END_TEXT);
  }

  /**
   * 演示用的那套妆面。
   * ★ 取值**照抄 `test/agent-render.test.ts` 里那份 `SAMPLE_LOOK`**——那是仓库里唯一一份
   *   已知合法的样例。新编一个没验过的 spec,第一次 `propose_look` 就会被校验器打回,
   *   而那时看起来像"演示脚本坏了",不像"这个 spec 是编的"。
   *   (`test/demo-llm.test.ts` 跑通整条链路,就是这份 spec 能过校验的证据。)
   *
   * ★★ **三个区的色不能写死**(理由见构造参数 `palette` 那一段):先试首选色,
   *   不在这一档的色域里就顺次取该档的第 `i` 个。肤色不知道时**照旧用首选色**
   *   ——`validateLookSpec` 那时本来就不收窄。
   */
  private demoLook(occasion: Occasion, skinTone: SkinTone | undefined): LookSpec {
    const allowed = skinTone === undefined ? undefined : this.palette.toneKeysFor(skinTone);
    return new LookSpec({
      occasion,
      base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
      zones: {
        lip: new ZoneSpec({ tone: toneFor('rose', allowed, 0), finish: 'matte', intensity: 3 }),
        cheek: new ZoneSpec({ tone: toneFor('coral', allowed, 1), finish: 'satin', intensity: 2 }),
        eyeshadow: new ZoneSpec({ tone: toneFor('nude', allowed, 2), finish: 'satin', intensity: 2 }),
        brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
      },
    });
  }

  private call(name: string, input: unknown): ToolUseBlock {
    this.calls += 1;
    return new ToolUseBlock({ type: 'tool_use', id: `demo-${this.calls}`, name, input });
  }
}

/** 出图那件事最后一次的结局。`null` = 还没提议过。 */
type RenderOutcome = 'done' | 'declined' | 'other';

/**
 * `calls` 里最后一个叫 `name` 的下标;一次都没有就是 `-1`。
 * ★ 要的是**先后**(谁更晚),所以给下标而不是给那个块本身。
 */
function lastIndexOfCall(calls: readonly ToolUseBlock[], name: string): number {
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    if (calls[i]?.name === name) return i;
  }
  return -1;
}

interface DemoState {
  /** 最后一条消息是"工具刚跑完"的续跑(而不是用户在说话)。 */
  justRanTools: boolean;
  hasProposedLook: boolean;
  hasPhoto: boolean;
  lastRender: RenderOutcome | null;
  /** 用户说的第一句话(原样,已按 schema 上限截断)。 */
  firstUserText: string;
  /** 用户说的最后一句话(同上)。★ 换风格那一支认的是它,不是第一句。 */
  lastUserText: string;
  /** 最后一次 `propose_look` 提的那个配方 id(提过才有)。 */
  lastStyleId: string | undefined;
}

/**
 * 从请求里读出决策表要的那几个事实。
 *
 * ★ **判据尽量用结构而不是文本**:`propose_look` 这一步看的是"有没有那个 `tool_use` 且它被答过",
 *   不是去正文里找词。只有"出成了还是被拒"没有结构可看(两者都不是 `isError`),
 *   才退回去比那两个前缀——而那两个前缀是从 `domain/tools/observations.ts` import 的,
 *   **不是抄的第二份**。
 */
function readState(messages: readonly Message[]): DemoState {
  const answered = new Set<string>();
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool_result') answered.add(block.toolUseId);
    }
  }

  const calls: ToolUseBlock[] = messages.flatMap((m) => toolUsesOf(m));
  const resultOf = new Map<string, ToolResultBlock>();
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool_result') resultOf.set(block.toolUseId, block);
    }
  }

  // ★ "答过了"就够,**不看 `isError`**。若要求"答成功",一个永远失败的 `propose_look`
  //   会让 ③ 无限重试到 `max_iterations`;而"答过了就往下走"最坏只是多走一步。
  const hasProposedLook = calls.some(
    (c) => c.name === TOOL_NAMES.proposeLook && answered.has(c.id),
  );

  const proposeAt = lastIndexOfCall(calls, TOOL_NAMES.proposeLook);
  const lastPropose = calls[proposeAt];

  /**
   * ★★ **出图那件事的结局只对"它当时提的那一套妆"有效。**
   *   换风格会在历史里留下一条**更新**的 `propose_look`,于是那条
   *   「被拒了」/「出成了」讲的是**上一套**妆的事——用户屏幕上已经不是那一套了。
   *   不看这个先后,换完风格会收到「行,那这次先不出图。我们接着调——你觉得**刚才那套**
   *   哪里想改?」:话里指的是已经不在屏幕上的那一套,而旁边正摆着一个出图按钮。
   *   ⚠️ 判据是**下标先后**(`calls` 是按消息顺序铺平的),不是时间戳。
   */
  const renderAt = lastIndexOfCall(calls, TOOL_NAMES.renderLook);
  const renderCall = renderAt > proposeAt ? calls[renderAt] : undefined;
  let lastRender: RenderOutcome | null = null;
  if (renderCall) {
    const result = resultOf.get(renderCall.id);
    if (!result) lastRender = null; // 还欠着结果 ⇒ 模型此刻不会被调用,理论上到不了这里
    else if (result.content.includes(RENDER_DONE_PREFIX)) lastRender = 'done';
    else if (result.content.includes(RENDER_DECLINED_PREFIX)) lastRender = 'declined';
    else lastRender = 'other';
  }

  const texts = messages.map((m) => textOf(m));
  const userTexts = messages
    .filter((m) => m.role === 'user' && textOf(m).trim() !== '')
    .map((m) => textOf(m).trim());
  const firstText = userTexts[0] ?? '';
  const hasPhoto = texts.some((t) => t.includes(PHOTO_ATTACHED_NOTE));

  const last = messages[messages.length - 1];
  const justRanTools =
    last !== undefined &&
    last.role === 'user' &&
    last.content.some((b) => b.type === 'tool_result');

  return {
    justRanTools,
    hasProposedLook,
    hasPhoto,
    lastRender,
    // 第一句话就是那张照片时没有需求原文可言(见 ③)。
    firstUserText:
      firstText === PHOTO_ATTACHED_NOTE || firstText === ''
        ? ''
        : firstText.slice(0, MAX_SCENE_TEXT),
    // ★ 不排除那张照片的提示语:它认不出任何风格 id,对 ⓪ 是无害的,
    //   而它**只可能**出现在第一句上(见上面的注释),最后一句轮不到它。
    lastUserText: (userTexts[userTexts.length - 1] ?? '').slice(0, MAX_SCENE_TEXT),
    lastStyleId: lastPropose === undefined ? undefined : styleIdOf(lastPropose),
  };
}

/**
 * 从「当前状态」那几行**风格池**里读回 `风格 id → 场合`。
 *
 * ★ **为什么是读提示词**:候选池随场合变,而这个脚本手上只有 `messages` 与 `system`
 *   (同 `readBriefLine` 的理由)。而这几行**本来就是印给模型看的那份清单**
 *   (`style-pool-description.ts` 是它唯一的出处),照它读不会多出一个真相。
 *
 * ★ 场合还没定时,那一行是**每档一节**的多行形状;定了场合就只有一行。
 *   两种形状的场合名都落在**该行第一个括号**里(`风格池(聚会 party):…` 与
 *   `- 聚会(party):…`),所以这里只有一条判据,不必分两种版式。
 */
function stylePoolOf(system: string | undefined): ReadonlyMap<string, Occasion> {
  const byId = new Map<string, Occasion>();
  for (const line of (system ?? '').split('\n')) {
    const head = /\(([^)]*)\)/.exec(line)?.[1];
    if (head === undefined) continue;
    const occasion = OCCASIONS.find((o) => head.split(/[\s,]+/).includes(o));
    if (occasion === undefined) continue;
    for (const [, id] of line.matchAll(/([a-z0-9-]+)\([^()]*\)/g)) {
      if (id !== undefined) byId.set(id, occasion);
    }
  }
  return byId;
}

/**
 * 用户这句话里点名了池子里的哪个风格。
 *
 * ★ 认的是 `/result` 那条切换条的原话(`换成「名字」(id) 这个风格…`),
 *   而 id 就写在括号里——**不去理解语义**,同本文件开头那段:它是一段脚本。
 */
function styleInPool(
  text: string,
  pool: ReadonlyMap<string, Occasion>,
): { id: string; occasion: Occasion } | undefined {
  for (const [id, occasion] of pool) {
    if (text.includes(`(${id})`)) return { id, occasion };
  }
  return undefined;
}

/** 一次 `propose_look` 调用里提的那个配方 id。`input` 是 `unknown`(见 message schema)。 */
function styleIdOf(call: ToolUseBlock): string | undefined {
  const input: unknown = call.input;
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)['styleId'];
  return typeof value === 'string' ? value : undefined;
}

/** 用户那句话里能认出来的场合;认不出来就是日常。 */
function occasionOf(text: string): Occasion {
  for (const hint of OCCASION_HINTS) {
    if (hint.words.some((word) => text.includes(word))) return hint.occasion;
  }
  return 'daily';
}
