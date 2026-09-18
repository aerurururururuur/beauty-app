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
import type { Occasion } from '../../../shared/index.js';
import type { LookSpec } from '../../../makeup/index.js';
import { MAX_SCENE_TEXT } from '../../domain/schemas/brief-patch.js';
import { TOOL_NAMES } from '../../domain/tools/definitions.js';
import { PHOTO_ATTACHED_NOTE } from '../../domain/tools/observations.js';
import {
  RENDER_DECLINED_PREFIX,
  RENDER_DONE_PREFIX,
} from '../../domain/tools/observations.js';
import type { Message, ToolResultBlock, ToolUseBlock } from '../../domain/entities/message.js';
import { textOf, toolUsesOf } from '../../domain/entities/message.js';
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
];

/**
 * 演示用的那套妆面。
 * ★ 取值**照抄 `test/agent-render.test.ts` 里那份 `SAMPLE_LOOK`**——那是仓库里唯一一份
 *   已知合法的样例。新编一个没验过的 spec,第一次 `propose_look` 就会被校验器打回,
 *   而那时看起来像"演示脚本坏了",不像"这个 spec 是编的"。
 *   (`test/demo-llm.test.ts` 跑通整条链路,就是这份 spec 能过校验的证据。)
 */
function demoLook(occasion: Occasion): LookSpec {
  return {
    occasion,
    base: { coverage: 3, finish: 'satin', warmth: 0 },
    zones: {
      lip: { tone: 'rose', finish: 'matte', intensity: 3 },
      cheek: { tone: 'coral', finish: 'satin', intensity: 2 },
      eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 },
      brow: { shape: 'natural', intensity: 2 },
    },
  };
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

  /** 调用 id 的自增计数。★ 全局唯一,不按会话重来——重了会让结果回填对错块。 */
  private calls = 0;

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const state = readState(request.messages);

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
      if (state.firstUserText) {
        calls.push(this.call(TOOL_NAMES.patchBrief, { sceneText: state.firstUserText }));
      }
      calls.push(this.call(TOOL_NAMES.proposeLook, demoLook(occasionOf(state.firstUserText))));
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

  private call(name: string, input: unknown): ToolUseBlock {
    this.calls += 1;
    return { type: 'tool_use', id: `demo-${this.calls}`, name, input };
  }
}

/** 出图那件事最后一次的结局。`null` = 还没提议过。 */
type RenderOutcome = 'done' | 'declined' | 'other';

interface DemoState {
  /** 最后一条消息是"工具刚跑完"的续跑(而不是用户在说话)。 */
  justRanTools: boolean;
  hasProposedLook: boolean;
  hasPhoto: boolean;
  lastRender: RenderOutcome | null;
  /** 用户说的第一句话(原样,已按 schema 上限截断)。 */
  firstUserText: string;
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

  const renderCall = calls.filter((c) => c.name === TOOL_NAMES.renderLook).pop();
  let lastRender: RenderOutcome | null = null;
  if (renderCall) {
    const result = resultOf.get(renderCall.id);
    if (!result) lastRender = null; // 还欠着结果 ⇒ 模型此刻不会被调用,理论上到不了这里
    else if (result.content.includes(RENDER_DONE_PREFIX)) lastRender = 'done';
    else if (result.content.includes(RENDER_DECLINED_PREFIX)) lastRender = 'declined';
    else lastRender = 'other';
  }

  const texts = messages.map((m) => textOf(m));
  const firstUserMessage = messages.find((m) => m.role === 'user' && textOf(m).trim() !== '');
  const firstText = (firstUserMessage ? textOf(firstUserMessage) : '').trim();
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
  };
}

/** 用户那句话里能认出来的场合;认不出来就是日常。 */
function occasionOf(text: string): Occasion {
  for (const hint of OCCASION_HINTS) {
    if (hint.words.some((word) => text.includes(word))) return hint.occasion;
  }
  return 'daily';
}
