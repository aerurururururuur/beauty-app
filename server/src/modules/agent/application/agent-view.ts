/**
 * application/agent-view.ts —— 会话 → 对外视图。
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
import { describeLook } from '../../makeup/index.js';
import type { AnalyzeCase, LookSpec, StyleRead } from '../../makeup/index.js';
import type { MakeupBrief } from '../../shared/index.js';
import {
  analysisWouldOverwrite,
  hasSourceImage,
  renderReadiness,
} from '../domain/entities/session.js';
import type { Session } from '../domain/entities/session.js';
import { danglingToolUses } from '../domain/entities/message.js';
import { ANALYZE_CASES } from '../domain/schemas/index.js';
import { TOOL_NAMES } from '../domain/tools/definitions.js';
import type { AgentEvent, AgentStopReason } from './agent-loop.js';
import type { AnalyzeOutcome, AnalyzeStatus } from './usecases/analyze-image.js';
import { renderConfirmationSummary } from './tools/render-look.js';

/**
 * 出过的一张图,给前端用。★ `url` 由**本模块**生成
 * (`/agent/sessions/:id/renders/:seq`)——取图地址归表现层,存储层不给 URL。
 */
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
   * 最后一次出图那**就是**当前这套妆面 ⇒ 按钮该改口叫「再生成一张」。
   *
   * ★ 为什么要有它:这条消息**不会**在出完图之后消失(见上),所以按钮会停在那里。
   *   出完还写着「确认生成」,读起来像"刚才那件事还没做完",诱着用户再点一次——
   *   而这一次是真的要花钱的。改口是**防误连点的三道防线之一**(另两道:
   *   出图期间按钮禁用、服务端按会话的 in-flight 锁,见 `confirm-render.ts`)。
   */
  alreadyRendered: boolean;
}

/**
 * ★ **界面自己摆的分析入口**(与 `RenderOfferView` 同一个用意)。
 *
 * 它只报**事实**——有哪几种、那张图在不在、用户是不是已经填过了。
 * 入口长什么样、摆在哪里是前端的事(本轮不做前端设计),这里不替它决定。
 *
 * ⚠️ **`off` 时这个键整个不出现**(两条路由根本没注册),所以它不是"恒在"的:
 *   它表达的是"这个部署有没有读图能力"这件事在不在,与 `renderOffer` 同类。
 */
export interface AnalysisOfferView {
  /** 三种 case 各自的现状。★ 全给,前端按需取。 */
  cases: {
    kind: AnalyzeCase;
    /** 要读的那张图在不在。不在的话点下去必然失败,不该摆按钮。 */
    hasImage: boolean;
    /** 用户自己填过了 ⇒ 点了也**不会覆盖**、而且**不花钱**。 */
    wouldOverwrite: boolean;
  }[];
}

export interface AgentSessionView {
  sessionId: string;
  userId: string;
  brief: MakeupBrief;
  lookSpec?: LookSpec;
  /** ★ `describeLook` 的渲染结果——给用户看的那段人话。 */
  lookDescription?: string;
  /** `style` 分析的产物(闭集读数)。★ 空则无键——它表达"读出来了没有"。 */
  styleRead?: StyleRead;
  /** 收到本人照片了没有。★ **不透出路径、也不透出字节**——前端只需要知道能不能出图。 */
  hasFace: boolean;
  /** 收到风格参考图了没有(读图那一轮)。★ 同 `hasFace`:只说有没有,不给路径。 */
  hasStyleRef: boolean;
  /** 收到场景图了没有。 */
  hasSceneRef: boolean;
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
   */
  renderOffer?: RenderOfferView;
  /** ★ **这个部署有读图能力时才有值**——见 {@link AnalysisOfferView}。 */
  analysisOffer?: AnalysisOfferView;
  createdAt: string;
  updatedAt: string;
}

/**
 * ★ **一次分析调用的结果**(`POST …/analyses` 的响应,✏️ 读图那一轮)。
 *
 * 它不是 `AgentTurnView`:**分析不跑对话轮**,不产生 `events[]`、没有 `stopReason`。
 * 把两者合成一个形状会让前端以为那里也有事件流可读。
 */
export interface AnalysisResultView {
  session: AgentSessionView;
  kind: AnalyzeCase;
  /** `would_overwrite` = 用户填过了,**没读、也没花钱**(见 `analyze-image.ts`)。 */
  status: AnalyzeStatus;
  /** 没真读成的话,为什么。★ 空则无键(同 `pendingRender`)。 */
  notice?: string;
}

export interface AgentTurnView extends AgentSessionView {
  /** 本轮为什么结束。前端据 `max_iterations` / `llm_unavailable` 做不同的提示。 */
  stopReason: AgentStopReason;
  /** 本轮事件流(阶段 2 一次性返回;阶段 3 换成 SSE 逐条推)。 */
  events: AgentEvent[];
}

/**
 * 视图选项。
 *
 * ★ **`hasAnalysis` 缺席 ≡ 这个部署没有读图能力** —— 于是 `analysisOffer` 整个不出现,
 *   与"那两条路由没注册"是同一件事的两种表述。
 *   ⚠️ 别给它一个缺省值:那会让"没配"变成"配了"。
 * ★ 它是**能力开关**,不是额度:分析次数没有上限(2026-09-29 起)。
 */
export interface SessionViewOptions {
  hasAnalysis?: boolean;
}

/**
 * 会话快照(不含本轮事件)。
 *
 * ★ `options` 可以整个省掉,等价于 `{}` = **这个部署没有读图能力**。
 *   缺省的方向是**安全的那个**(不摆一个点下去 404 的入口),见 `SessionViewOptions`。
 */
export function toSessionView(
  session: Session,
  options: SessionViewOptions = {},
): AgentSessionView {
  const pendingCall = danglingToolUses(session.messages).find(
    (call) => call.name === TOOL_NAMES.renderLook,
  );

  const look = session.lookSpec;
  const lookDescription = look ? describeLook(look) : undefined;

  // ★ 出图那条消息摆不摆,判据只有两条:**妆面照片齐**(与工具用的是同一个
  //   `renderReadiness`)且**没有一条提议正等着用户点头**。
  const renderOffer: RenderOfferView | undefined =
    pendingCall === undefined && renderReadiness(session) === 'ready'
      ? {
          summary: renderConfirmationSummary(),
          // 两个字符串都由 `describeLook` 产出 ⇒ 逐字可比(比的是**说法**,不是 spec 对象)。
          // ⚠️ 这一句**必须留在 `ready` 这一支里**:没有妆面时 `lookDescription` 是
          //    `undefined`,而那一边(`renders` 为空时)也是 `undefined` ——
          //    `undefined === undefined` 会把"什么都没出过"算成"已出过"。
          alreadyRendered:
            lookDescription !== undefined &&
            session.renders.at(-1)?.lookDescription === lookDescription,
        }
      : undefined;

  // ★ 读图那块**只有这个部署真有能力时**才出现(见 `SessionViewOptions.hasAnalysis`)。
  const analysisOffer: AnalysisOfferView | undefined = options.hasAnalysis
    ? {
        // 三种都给:前端要摆哪几个入口由它定(本轮不做前端设计),这里只报事实。
        // ⚠️ 判据一律走实体那两个具名守卫,不在这里重写一遍(§8)。
        cases: ANALYZE_CASES.map((kind) => ({
          kind,
          hasImage: hasSourceImage(session, kind),
          wouldOverwrite: analysisWouldOverwrite(session, kind),
        })),
      }
    : undefined;

  return {
    sessionId: session.id,
    userId: session.userId,
    brief: session.brief,
    ...(look ? { lookSpec: look } : {}),
    ...(lookDescription !== undefined ? { lookDescription } : {}),
    ...(session.styleRead ? { styleRead: session.styleRead } : {}),
    hasFace: session.faceRef !== undefined,
    hasStyleRef: session.styleRef !== undefined,
    hasSceneRef: session.sceneRef !== undefined,
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
            summary: renderConfirmationSummary(),
          },
        }
      : {}),
    ...(renderOffer ? { renderOffer } : {}),
    ...(analysisOffer ? { analysisOffer } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/** 一次分析的结果 → 对外视图。★ 不跑对话轮,所以**没有** `events[]` / `stopReason`。 */
export function toAnalysisResultView(
  outcome: AnalyzeOutcome,
  options: SessionViewOptions,
): AnalysisResultView {
  return {
    session: toSessionView(outcome.session, options),
    kind: outcome.kind,
    status: outcome.status,
    ...(outcome.notice !== undefined ? { notice: outcome.notice } : {}),
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
