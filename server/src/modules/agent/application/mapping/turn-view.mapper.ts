/**
 * application/mapping/turn-view.mapper.ts —— 会话 → 对外视图。
 *
 * ★ **不把 `messages[]` 透出去。** 理由有两条,第二条是硬的:
 *   ① 它是内部形状(带 `tool_use` / `tool_result` 块),前端拿到也没法直接渲染;
 *   ② **它会把系统提示里没有的东西漏出去**——`tool_result` 里就有衣橱清单全文、
 *      校验器的原始报错。前端要的是"这轮聊了什么",不是服务端的内部往来。
 *   要什么给什么,这也让将来改内部消息形状不至于变成一次破坏性 API 变更。
 *
 * ★ 顺带把 `describeLook` 的结果作为 `lookDescription` 给出去:
 * **那段文字就是"预览"的替代品**(§7.4.2),前端该原样展示它,
 * 而不是自己再拼一遍——两处拼就会有两套说法。
 *
 * ★ **出图那件事在视图里有两个字段,而且互斥**(见 `renderOffer`):
 *   `pendingRender` 是**模型**提的(状态是"欠着一条 `tool_use`"),
 *   `renderOffer` 是**界面按状态自己摆**的那一条。
 *   ✏️ 2026-09-16 之前只有前者——于是"用户想要成片"这件事**必须由模型转达**,
 *   而模型两次没转达(实测见本模块 README / 设计文档 §7.4.3)。后者是那次改动的落点。
 */
import { describeLook } from '../../../makeup/index.js';
import type { LookSpec } from '../../../makeup/index.js';
import type { MakeupBrief } from '../../../shared/index.js';
import { renderReadiness, rendersLeft } from '../../domain/entities/session.js';
import type { Session } from '../../domain/entities/session.js';
import { danglingToolUses } from '../../domain/entities/message.js';
import { TOOL_NAMES } from '../../domain/tools/definitions.js';
import type { AgentEvent, AgentStopReason } from '../agent-loop.js';
import { renderConfirmationSummary } from '../tools/render-look.js';

/** 出过的一张图,给前端用。★ `url` 是**本模块**的取图路由,不是 `jobs` 那条。 */
export interface RenderView {
  seq: number;
  url: string;
  /** 出这张图时那份妆面单的说法。★ 是**历史**,不随用户后来改妆而变。 */
  lookDescription: string;
  createdAt: string;
}

/**
 * 本次对话里查过的一条品牌产品,给前端挂「品牌参考」角标用。
 *
 * ★ **角标文案由前端写死,不由模型生成**——这是红线 §13-6「推广必须可辨认」
 *   能成立的前提。所以这里只给"是哪条",不给"该标什么"。
 */
export interface ConsultedProductView {
  id: string;
  name: string;
  categoryLabel: string;
}

/**
 * ★ **界面自己摆的那条出图消息**(✏️ 2026-09-16 新增,与 `pendingRender` 互斥)。
 *
 * 它回答的是"现在能不能出一张、点下去要花什么"。**它不是模型说的话**——
 * 前端要把它渲染成**明显不像助手气泡**的一块(理由见 `vue/AGENTS.md` §11):
 * 做成气泡就等于界面替模型发言了。
 *
 * ⚠️ **它是"能不能摆"的判据,不是"已经出了"的记录**:出了图之后它**照旧在**
 *   (妆面照片还在、额度也还有),只是 `alreadyRendered` 变成真、按钮改口叫"再生成一张"。
 */
export interface RenderOfferView {
  /** ★ 费用与时长那句话。与 `pendingRender.summary` **是同一个函数的产出**,不另写一份。 */
  summary: string;
  /**
   * 还能出几张。★ `max <= 0`(不限量)**时是 `null`**。
   *
   * ⚠️ 不能照 `rendersLeft()` 原样透出:配置不限量时它恒为 **0**,前端照字面读
   *   就会把"随便出"读成"用完了",然后**把一个能用的按钮藏起来**。
   */
  left: number | null;
  /** `[I3]` 的上限,`<= 0` = 不限量(与 `renderConfirmationSummary` 同一口径)。 */
  max: number;
  /**
   * 最后一次出图那**就是**当前这套妆面 ⇒ 按钮该改口叫「再生成一张」。
   *
   * ★ 为什么要有它:这条消息**不会**在出完图之后消失(见上),所以按钮会停在那里。
   *   出完还写着「确认生成」,读起来像"刚才那件事还没做完",诱着用户再点一次——
   *   而这一次是真的要花钱的。改口是**防误连点的三道防线之一**(另两道:
   *   出图期间按钮禁用、服务端按会话的 in-flight 锁,见 `confirm-render.ts`)。
   */
  alreadyRendered: boolean;
}

export interface AgentSessionView {
  sessionId: string;
  userId: string;
  brief: MakeupBrief;
  lookSpec?: LookSpec;
  /** ★ `describeLook` 的渲染结果——给用户看的那段人话。 */
  lookDescription?: string;
  /** 收到本人照片了没有。★ **不透出路径、也不透出字节**——前端只需要知道能不能出图。 */
  hasFace: boolean;
  /** 已出的图(按 `seq` 升序)。 */
  renders: RenderView[];
  /**
   * ★ 本次对话里查过的品牌产品(按 id 去重、按查到的先后)。
   *
   * **恒在的数组**(照 `renders`,不是 `pendingRender` 那种"空则无键"):
   * 前端只要 `length === 0` 就**整块不渲染**。用"空数组"而不是"省略键",
   * 是因为这里要表达的是**一个集合的状态**(空的),不是**一件事在不在**(没有)。
   * 混用两种省略语义,前端就得同时写两种判空——`renders` 那边已经踩过这个。
   *
   * ⚠️ **它是"读过"不是"推荐过"的超集**:模型可能读了却没用上。这是故意的,
   *   见 `entities/session.ts` 的 `ConsultedProduct`(漏标是虚假披露,多标只是啰嗦)。
   */
  consultedProducts: ConsultedProductView[];
  /**
   * ★ **有动作在等用户确认**时才有值。
   *
   * 为什么它在会话视图里、而不只在那一轮的 `events[]` 里:用户**刷新页面**之后
   * 确认框还得在(否则那个"欠着的 `tool_use`"会永远挂着,而用户看不到任何提示)。
   * `summary` 与 `tool_pending` 事件里那句**是同一句话**(同一个函数生成的)。
   */
  pendingRender?: { toolUseId: string; summary: string };
  /**
   * ★ **界面按状态自己摆的那条出图消息**(✏️ 2026-09-16 新增)——见 {@link RenderOfferView}。
   *
   * 省略语义同 `pendingRender`(不是就是没有这个键),而且**与它互斥**:
   * 有待确认的提议时这里一定是空的。**页面上只该有一个出图入口。**
   *
   * ⚠️ **额度用尽时它照旧在**(那一刻 `left === 0`)。为什么不干脆不摆:
   *   用户手上那套妆已经定了、照片也有了,他当然会想"那图呢"——
   *   一片空白什么都不说,比说一句"次数用完了"更像坏了。
   *   前端据 `left === 0` **不给按钮**、只给一行说明。
   */
  renderOffer?: RenderOfferView;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTurnView extends AgentSessionView {
  /** 本轮为什么结束。前端据 `max_iterations` / `llm_unavailable` 做不同的提示。 */
  stopReason: AgentStopReason;
  /** 本轮事件流(阶段 2 一次性返回;阶段 3 换成 SSE 逐条推)。 */
  events: AgentEvent[];
}

/**
 * 视图选项。★ `maxRenders` 是 `[I3]` 的额度,确认框那句话里要报"还剩几张",
 * 所以它得从配置走到这里——**不在映射层写死一个数**,那会和配置里的值漂开。
 */
export interface SessionViewOptions {
  maxRenders: number;
}

/** 会话快照(不含本轮事件)。 */
export function toSessionView(session: Session, options: SessionViewOptions): AgentSessionView {
  const pendingCall = danglingToolUses(session.messages).find(
    (call) => call.name === TOOL_NAMES.renderLook,
  );

  const look = session.lookSpec;
  const lookDescription = look ? describeLook(look) : undefined;

  // ★ 出图那条消息摆不摆,判据只有两条:**妆面照片齐**(与工具用的是同一个
  //   `renderReadiness`)且**没有一条提议正等着用户点头**。
  //   ⚠️ 额度**不在这两条里**——用完了也要摆(见 `renderOffer` 的注释)。
  const renderOffer: RenderOfferView | undefined =
    pendingCall === undefined && renderReadiness(session) === 'ready'
      ? {
          summary: renderConfirmationSummary(session, options.maxRenders),
          left: options.maxRenders > 0 ? rendersLeft(session, options.maxRenders) : null,
          max: options.maxRenders,
          // 两个字符串都由 `describeLook` 产出 ⇒ 逐字可比(比的是**说法**,不是 spec 对象)。
          // ⚠️ 这一句**必须留在 `ready` 这一支里**:没有妆面时 `lookDescription` 是
          //    `undefined`,而那一边(`renders` 为空时)也是 `undefined` ——
          //    `undefined === undefined` 会把"什么都没出过"算成"已出过"。
          alreadyRendered:
            lookDescription !== undefined &&
            session.renders.at(-1)?.lookDescription === lookDescription,
        }
      : undefined;

  return {
    sessionId: session.id,
    userId: session.userId,
    brief: session.brief,
    ...(look ? { lookSpec: look } : {}),
    ...(lookDescription !== undefined ? { lookDescription } : {}),
    hasFace: session.faceRef !== undefined,
    renders: session.renders.map((r) => ({
      seq: r.seq,
      url: `/agent/sessions/${session.id}/renders/${r.seq}`,
      lookDescription: r.lookDescription,
      createdAt: r.createdAt,
    })),
    consultedProducts: session.consultedProducts.map((p) => ({
      id: p.id,
      name: p.name,
      categoryLabel: p.categoryLabel,
    })),
    ...(pendingCall
      ? {
          pendingRender: {
            toolUseId: pendingCall.id,
            summary: renderConfirmationSummary(session, options.maxRenders),
          },
        }
      : {}),
    ...(renderOffer ? { renderOffer } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/** 一轮的完整视图。 */
export function toTurnView(
  session: Session,
  events: readonly AgentEvent[],
  stopReason: AgentStopReason,
  options: SessionViewOptions,
): AgentTurnView {
  return { ...toSessionView(session, options), stopReason, events: [...events] };
}
