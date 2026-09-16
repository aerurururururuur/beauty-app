/**
 * agent/domain/entities/session.ts —— 一次对话式上妆的会话状态。
 *
 * ★ **`messages[]` 是唯一状态**(§7.3 第 2 条):可持久化、可重放、可测试。
 * 不起平行状态机——那正是本仓库 2026-09-10 删掉 `understanding` 模块的错误形状。
 *
 * ★ **`system` 不进 `messages[]`,每轮重新拼。** 理由不是洁癖,是正确性:
 * 系统提示里要嵌**当前的** `brief` 与 `LookSpec`(§7.3 第 7 条:最该留住的是
 * 这两个的当前值,不是聊天原文)。把它们**存一份**在消息里,就会出现
 * 「历史里那份 system 说唇色是 rose,`lookSpec` 已经改成 berry」这种自相矛盾,
 * 而模型会同时看到两份、信错一份。**派生出来的东西不存第二遍。**
 */
import type { ImageRef, MakeupBrief } from '../../../shared/index.js';
import type { LookSpec } from '../../../makeup/index.js';
import type { Message } from './message.js';

/**
 * 出过的一张图。★ **它是历史,不是当前状态**——
 * `lookDescription` 记的是**出这张图时**那份妆面单的说法,而不是"现在这套"。
 * 用户后来改了妆,已经出出来的那张图仍然是当时那套妆的样子,
 * 界面上必须还能这么说;**让它跟着 `session.lookSpec` 变,就是伪造了历史。**
 */
export interface RenderRecord {
  /** 从 1 开始。**同时是取图 URL 里的序号**(`/renders/:seq`),因为一个会话可以出多张。 */
  seq: number;
  /** 落盘后的引用(经 `SessionArtifacts` 端口)。 */
  ref: ImageRef;
  /** 出这张图时 `describeLook(lookSpec)` 的人话。 */
  lookDescription: string;
  createdAt: string;
}

/**
 * 本次对话里**被查到过**的一条品牌产品(来自 `read_product`)。
 *
 * ★ **它是"清单"不是"历史"**——与上面 `RenderRecord` 的关键区别就在这:
 *   `RenderRecord` 要记 `createdAt`,因为"出这张图时那套妆"是一个**过去的状态**,
 *   必须能复述当时的样子;而这里记的是"这条资料在本次对话里进过模型的眼睛",
 *   它是个**集合**,重不重要、什么时候读的都不影响它该被标出来,所以**按 id 去重、不记时间**。
 *
 * ★ **它是红线 §13-6 在客户端的落点。** 光靠模型自由文本,「品牌参考」那个角标
 *   就取决于模型怎么措辞了;而角标必须由**我们**保证。
 *   记的是"读过"而不是"推荐过"——**故意取超集**:宁可多标一条没被推荐的,
 *   也不要漏标一条被推荐的。**漏标是虚假披露,多标只是啰嗦。**
 */
export interface ConsultedProduct {
  /** 产品 id(`read_product` 的入参)。★ 去重键。 */
  id: string;
  name: string;
  /** 中文类目名,给前端做「唇部彩妆」这类小字用。 */
  categoryLabel: string;
}

export interface Session {
  id: string;
  /**
   * 归属用户。★ **不做登录态 / token**(红线 §13-5 不变),由客户端显式传,
   * 与 `cabinet` 同一口径。
   */
  userId: string;
  /** 对话历史(**不含** system;见文件头)。user / assistant 交替。 */
  messages: Message[];
  /**
   * 从对话里收敛出的已知事实。
   * ★ 形状**就是** `shared` 的 `MakeupBrief`——§7.2 对 `patch_brief` 写死了
   * 「形状即现有 `MakeupBrief`」,不另造一个字段同构的孪生类型(那会漂)。
   */
  brief: MakeupBrief;
  /** 当前妆面单(`propose_look` 的产出)。还没提出过时为 `undefined`。 */
  lookSpec?: LookSpec;
  /**
   * ★ 用户上传的**本人照片**(阶段 3 起)。`render_look` 没有它出不了图。
   *
   * ⚠️ **这是本会话里唯一一件真实个人信息**,所以它连带两条硬约束:
   * ① 存服务端、**不进 `messages[]`**(几 MB 的 base64 会让会话没法读、没法落盘);
   * ② 会话 TTL 到期**必须真删**(§10 `[I8]`,见 `SessionArtifacts.removeAll`)。
   */
  faceRef?: ImageRef;
  /**
   * 已出的图(按 `seq` 递增)。**它同时是 `[I3]` 次数上限的计数依据**——
   * 不另存一个计数器,否则就会出现"计数器说 3 张、数组里只有 2 张"这种状态。
   */
  renders: RenderRecord[];
  /**
   * 本次对话里查过的品牌产品(按 id 去重)。**恒在的数组**,没查过就是空数组——
   * 与 `renders` 同一形状。装配时没配产品库、或模型一次都没调 `read_product`,
   * 它就一直是空的,前端据此**整块不渲染**。
   *
   * ⚠️ **别把它退化成"从 `messages[]` 反推"**:那要解析 `tool_result` 里的 JSON 文本,
   * 既脆弱又不稳(见本文件头「派生出来的东西不存第二遍」——那条约束的是
   * `pendingRender` 那种**瞬时**状态;读过的产品是一份**有结构的清单**,值得存,`renders` 同理)。
   */
  consultedProducts: ConsultedProduct[];
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 开一个新会话(初始为空,brief 为空对象)。 */
export function createSession(id: string, userId: string): Session {
  const at = nowIso();
  return {
    id,
    userId,
    messages: [],
    brief: {},
    renders: [],
    consultedProducts: [],
    createdAt: at,
    updatedAt: at,
  };
}

/** 追加若干条消息并刷新 `updatedAt`(纯函数:不改原对象)。 */
export function appendMessages(session: Session, messages: readonly Message[]): Session {
  return {
    ...session,
    messages: [...session.messages, ...messages],
    updatedAt: nowIso(),
  };
}

/** 合并一批 brief 增量(只为非 `undefined` 的键赋值,`undefined` 不覆盖已有值)。 */
export function patchBrief(session: Session, changes: MakeupBrief): Session {
  const next: MakeupBrief = { ...session.brief };
  for (const [key, value] of Object.entries(changes) as [keyof MakeupBrief, unknown][]) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return { ...session, brief: next, updatedAt: nowIso() };
}

/** 记下当前妆面单。 */
export function setLookSpec(session: Session, lookSpec: LookSpec): Session {
  return { ...session, lookSpec, updatedAt: nowIso() };
}

/** 记下用户上传的本人照片。 ★ 再传一张**覆盖**旧的(用户就是想换一张)。 */
export function setFaceRef(session: Session, faceRef: ImageRef): Session {
  return { ...session, faceRef, updatedAt: nowIso() };
}

/**
 * 记一张出好的图。`seq` 由本函数算(数组长度 + 1),**不由调用方传**——
 * 调用方算就会算错(它拿到的是旧会话),而错号的后果是两张图互相覆盖。
 */
export function addRender(
  session: Session,
  input: { ref: ImageRef; lookDescription: string },
): { session: Session; record: RenderRecord } {
  const record: RenderRecord = {
    seq: session.renders.length + 1,
    ref: input.ref,
    lookDescription: input.lookDescription,
    createdAt: nowIso(),
  };
  return { session: { ...session, renders: [...session.renders, record], updatedAt: nowIso() }, record };
}

/**
 * 记下一条查过的品牌产品(§13-6 那个「品牌参考」角标靠它)。
 *
 * ★ **按 id 去重,重复时返回的是同一个 `session` 对象**(不是等值的新对象)。
 *   这不是省一次拷贝的风格问题,是 `tool.ts` 约束 3 那个"可重入"**唯一实际的受力点**:
 *   用户确认出图后,那一轮会**整轮重跑**,`read_product` 会被再调一次。
 *   返回同一个引用,工具那边就能用 `next === context.session` 判断"这次真的没改",
 *   于是既不重复记一条,也不产生一次多余的会话写入。
 */
export function addConsultedProduct(session: Session, input: ConsultedProduct): Session {
  if (session.consultedProducts.some((p) => p.id === input.id)) return session;
  return {
    ...session,
    consultedProducts: [...session.consultedProducts, input],
    updatedAt: nowIso(),
  };
}

/** 还剩几次出图额度(§10 `[I3]`)。`maxRenders <= 0` 视作"不限制",由调用方决定要不要传 0。 */
export function rendersLeft(session: Session, maxRenders: number): number {
  return Math.max(0, maxRenders - session.renders.length);
}
