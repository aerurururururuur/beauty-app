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
 *
 * ── ★ 本文件四个都是类,不是 interface ────────────────────────────────────────
 * 名义化标记那个 `brand` 的由来见 `makeup/domain/entities/look-spec.ts`
 * 那段「为什么是类」——这里不抄第二遍。它在这里收拢的是:
 * **会话的写入只能经本文件那几个具名函数**(§8「实体是只读快照 + 具名守卫」)。
 * ★ 字段写法同 `message.ts`:`declare` + 逐项赋值,不产生多余的运行时字段、不改键序。
 */
import type { ImageRef, MakeupBrief } from '../../../shared/index.js';
import type { AnalyzeCase, LookSpec, StyleRead } from '../../../makeup/index.js';
import type { Message } from './message.js';

/**
 * 出过的一张图。★ **它是历史,不是当前状态**——
 * `lookDescription` 记的是**出这张图时**那份妆面单的说法,而不是"现在这套"。
 * 用户后来改了妆,已经出出来的那张图仍然是当时那套妆的样子,
 * 界面上必须还能这么说;**让它跟着 `session.lookSpec` 变,就是伪造了历史。**
 */
export class RenderRecord {
  /** 名义化标记:只声明、不初始化、**不许读**。见文件头那段。 */
  declare private readonly brand: void;

  /** 从 1 开始。**同时是取图 URL 里的序号**(`/renders/:seq`),因为一个会话可以出多张。 */
  declare readonly seq: number;
  /** 落盘后的引用(经 `SessionArtifacts` 端口)。 */
  declare readonly ref: ImageRef;
  /** 出这张图时 `describeLook(lookSpec)` 的人话。 */
  declare readonly lookDescription: string;
  declare readonly createdAt: string;

  constructor(seq: number, ref: ImageRef, lookDescription: string, createdAt: string) {
    this.seq = seq;
    this.ref = ref;
    this.lookDescription = lookDescription;
    this.createdAt = createdAt;
  }
}

/**
 * 分析用的参考图种类。
 *
 * ★ **刻意不含 `'face'`**:本人照片走 `faceRef` 那一条,它带着额外的隐私义务
 *   (`[I8]`,见 `faceRef` 的注释),不该和这两张混在一个入口里。
 */
export type RefImageKind = 'style' | 'scene';

/**
 * 做过的一次读图分析。
 *
 * ★ **它同时是"这个会话花过几次钱"的唯一依据**(不另存一个计数器——否则就会出现
 *   "计数器说 3 次、数组里只有 2 次"这种状态)。
 * ★ 记的是**尝试**不是**成功**:失败的调用同样已经花掉了钱(见 `analyze-image.ts`
 *   里"先记后调"那段),而只记成功等于给了一条"反复失败不计数"的免费通道。
 */
export class AnalysisRecord {
  /** 名义化标记:只声明、不初始化、**不许读**。见文件头那段。 */
  declare private readonly brand: void;

  declare readonly kind: AnalyzeCase;
  declare readonly at: string;

  constructor(kind: AnalyzeCase, at: string) {
    this.kind = kind;
    this.at = at;
  }
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
export class ConsultedProduct {
  /** 名义化标记:只声明、不初始化、**不许读**。见文件头那段。 */
  declare private readonly brand: void;

  /** 产品 id(`read_product` 的入参)。★ 去重键。 */
  declare readonly id: string;
  declare readonly name: string;
  /** 中文类目名,给前端做「唇部彩妆」这类小字用。 */
  declare readonly categoryLabel: string;

  constructor(id: string, name: string, categoryLabel: string) {
    this.id = id;
    this.name = name;
    this.categoryLabel = categoryLabel;
  }
}

export class Session {
  /** 名义化标记:只声明、不初始化、**不许读**。见文件头那段。 */
  declare private readonly brand: void;

  declare readonly id: string;
  /**
   * 归属用户。★ **不做登录态 / token**(红线 §13-5 不变),由客户端显式传,
   * 与 `cabinet` 同一口径。
   */
  declare readonly userId: string;
  /** 对话历史(**不含** system;见文件头)。user / assistant 交替。 */
  declare readonly messages: Message[];
  /**
   * 从对话里收敛出的已知事实。
   * ★ 形状**就是** `shared` 的 `MakeupBrief`——§7.2 对 `patch_brief` 写死了
   * 「形状即现有 `MakeupBrief`」,不另造一个字段同构的孪生类型(那会漂)。
   */
  declare readonly brief: MakeupBrief;
  /** 当前妆面单(`propose_look` 的产出)。还没提出过时为 `undefined`。 */
  declare readonly lookSpec?: LookSpec;
  /**
   * ★ 用户上传的**本人照片**(阶段 3 起)。`render_look` 没有它出不了图。
   *
   * ⚠️ **这是本会话里唯一一件真实个人信息**,所以它连带两条硬约束:
   * ① 存服务端、**不进 `messages[]`**(几 MB 的 base64 会让会话没法读、没法落盘);
   * ② 会话 TTL 到期**必须真删**(§10 `[I8]`,见 `SessionArtifacts.removeAll`)。
   */
  declare readonly faceRef?: ImageRef;
  /**
   * 用户上传的**风格参考图**(✏️ 读图那一轮)。
   *
   * ★ **不一定是妆容照**:人脸照、一幅画、插画、漫画分镜都算。
   *   它只被**文本化**成 `styleRead`,**不进引擎**(拍板决定,理由见 `makeup/README.md`)。
   */
  declare readonly styleRef?: ImageRef;
  /** 用户上传的**场景地点图**。只用来读 `occasion`,不进引擎。 */
  declare readonly sceneRef?: ImageRef;
  /**
   * `style` 分析的产物:一份**闭集**的妆面读数(不是一段描述,理由见 `StyleRead` 文件头)。
   *
   * ⚠️ **光存在这里等于假开关**——它必须进模型看得到的地方(`messages[]` 里那条说明,
   *   由 `analyze-image.ts` 追加),否则它只在界面上好看、对出图毫无影响。
   */
  declare readonly styleRead?: StyleRead;
  /**
   * 已出的图(按 `seq` 递增)。★ **它是"这个会话出过几张"的唯一依据**——
   * 不另存一个计数器(2026-09-29 前它还是出图配额的计数依据,配额已删)。
   */
  declare readonly renders: RenderRecord[];
  /**
   * 本次对话里查过的品牌产品(按 id 去重)。**恒在的数组**,没查过就是空数组——
   * 与 `renders` 同一形状。装配时没配产品库、或模型一次都没调 `read_product`,
   * 它就一直是空的,前端据此**整块不渲染**。
   *
   * ⚠️ **别把它退化成"从 `messages[]` 反推"**:那要解析 `tool_result` 里的 JSON 文本,
   * 既脆弱又不稳(见本文件头「派生出来的东西不存第二遍」——那条约束的是
   * `pendingRender` 那种**瞬时**状态;读过的产品是一份**有结构的清单**,值得存,`renders` 同理)。
   */
  declare readonly consultedProducts: ConsultedProduct[];
  /**
   * 做过的读图分析(按先后)。**恒在的数组**,没做过就是空数组(同 `renders`)。
   * ★ 见 `AnalysisRecord`(它是"这个会话为分析花过几次钱"的依据)。
   */
  declare readonly analyses: AnalysisRecord[];
  declare readonly createdAt: string;
  declare readonly updatedAt: string;

  /**
   * ★ 收**整份字段**而不是 14 个位置参数:上面每加一个字段,位置参数就得改所有调用点。
   * 参数类型**从本类自身取**(`Omit`),所以不另造一个字段同构的孪生类型(§4.1)。
   * ★ 用 `Object.assign` 而不是逐项赋值:调用方**没给的键就不会出现在实例上**
   *   (`{ ...session, lookSpec }` 那种"没提过的仍然没有"),与改动前逐项相同。
   */
  constructor(props: Omit<Session, 'brand'>) {
    Object.assign(this, props);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 开一个新会话。
 *
 * `brief` 可带一份**初始值**——表单那条路一次填完需求,不经过对话
 * (`POST /agent/sessions` 带 brief)。缺省为空对象,与本参数新增之前**逐字相同**。
 */
export function createSession(id: string, userId: string, brief: MakeupBrief = {}): Session {
  const at = nowIso();
  return new Session({
    id,
    userId,
    messages: [],
    brief: { ...brief },
    renders: [],
    consultedProducts: [],
    analyses: [],
    createdAt: at,
    updatedAt: at,
  });
}

/** 追加若干条消息并刷新 `updatedAt`(纯函数:不改原对象)。 */
export function appendMessages(session: Session, messages: readonly Message[]): Session {
  return new Session({
    ...session,
    messages: [...session.messages, ...messages],
    updatedAt: nowIso(),
  });
}

/** 合并一批 brief 增量(只为非 `undefined` 的键赋值,`undefined` 不覆盖已有值)。 */
export function patchBrief(session: Session, changes: MakeupBrief): Session {
  const next: MakeupBrief = { ...session.brief };
  for (const [key, value] of Object.entries(changes) as [keyof MakeupBrief, unknown][]) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return new Session({ ...session, brief: next, updatedAt: nowIso() });
}

/** 记下当前妆面单。 */
export function setLookSpec(session: Session, lookSpec: LookSpec): Session {
  return new Session({ ...session, lookSpec, updatedAt: nowIso() });
}

/** 记下用户上传的本人照片。 ★ 再传一张**覆盖**旧的(用户就是想换一张)。 */
export function setFaceRef(session: Session, faceRef: ImageRef): Session {
  return new Session({ ...session, faceRef, updatedAt: nowIso() });
}

/**
 * 记一张出好的图。`seq` 由本函数算(数组长度 + 1),**不由调用方传**——
 * 调用方算就会算错(它拿到的是旧会话),而错号的后果是两张图互相覆盖。
 */
export function addRender(
  session: Session,
  input: { ref: ImageRef; lookDescription: string },
): { session: Session; record: RenderRecord } {
  const record = new RenderRecord(
    session.renders.length + 1,
    input.ref,
    input.lookDescription,
    nowIso(),
  );
  return {
    session: new Session({ ...session, renders: [...session.renders, record], updatedAt: nowIso() }),
    record,
  };
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
  return new Session({
    ...session,
    consultedProducts: [...session.consultedProducts, input],
    updatedAt: nowIso(),
  });
}

/** 记下一张分析用的参考图。★ 再传一张同 kind 的**覆盖**旧的(同 `setFaceRef`)。 */
export function setImageRef(session: Session, kind: RefImageKind, ref: ImageRef): Session {
  const at = nowIso();
  return kind === 'style'
    ? new Session({ ...session, styleRef: ref, updatedAt: at })
    : new Session({ ...session, sceneRef: ref, updatedAt: at });
}

/** 记下 `style` 分析的读数。 */
export function setStyleRead(session: Session, styleRead: StyleRead): Session {
  return new Session({ ...session, styleRead, updatedAt: nowIso() });
}

/**
 * 记一次分析**尝试**。★ 在**调用模型之前**记(见 `analyze-image.ts`)——
 * 记的是"钱已经打算花了",不是"拿到结果了"。理由见 `AnalysisRecord`。
 */
export function addAnalysis(session: Session, kind: AnalyzeCase): Session {
  return new Session({
    ...session,
    analyses: [...session.analyses, new AnalysisRecord(kind, nowIso())],
    updatedAt: nowIso(),
  });
}

/**
 * ★★ **这次分析会不会盖掉用户自己填的东西**——「用户填的优先」的**唯一判据**。
 *
 * 它必须在**花钱之前**问。反过来写(先花钱、再看要不要用)的话,用户每点一次
 * 就白花一次钱,而那个结果**一定**会被丢掉——他不会看到任何变化,只会看到账单。
 *
 * `style` 恒为 `false`:它落的是 `styleRead`,一个用户**填不了**的字段
 * (表单里没有那一格)。★ 别为了让三个 case 看起来一致而给它编一个覆盖判断——
 * 那会是一条永远为假的死分支。
 */
export function analysisWouldOverwrite(session: Session, kind: AnalyzeCase): boolean {
  if (kind === 'face') return session.brief.skinTone !== undefined;
  if (kind === 'scene') return session.brief.occasion !== undefined;
  return false;
}

/**
 * ★ **要分析的那张图落在哪一格。** 三个 case 的取图表**只此一份**——
 * `hasSourceImage` 与 `analyze-image.ts`(它还要拿这个引用去解析路径)都从它取。
 * 两处各写一遍三个 `=== undefined` 的话,加第四个 case 只会改一处。
 */
export function sourceRefOf(session: Session, kind: AnalyzeCase): ImageRef | undefined {
  if (kind === 'face') return session.faceRef;
  if (kind === 'style') return session.styleRef;
  return session.sceneRef;
}

/**
 * ★ **要分析的那张图在不在。** 与 `renderReadiness` 同一条规矩:判据只此一份。
 * 缺图时**不调分析器**(白白花钱),由用例翻成人话。
 */
export function hasSourceImage(session: Session, kind: AnalyzeCase): boolean {
  return sourceRefOf(session, kind) !== undefined;
}

/** 出图**还缺什么**。`ready` = 妆面与照片都在。 */
export type RenderReadiness = 'ready' | 'no_look' | 'no_face';

/**
 * ★ **"缺什么才算不能出图"只此一份。**
 *
 * 三个读者各写各的文案,但**判据只能有这一个**:
 *   · `RenderLookTool` 的两个失败分支(`render-look.ts`)——说给**模型**听;
 *   · `ConfirmRender` 的入口判断(`confirm-render.ts`)——说给**用户**看;
 *   · 对外视图决定要不要摆那条出图消息(`turn-view.mapper.ts`)。
 * 三处各写一遍 `lookSpec ? … : faceRef ? …`,迟早只改一处——
 * 而漂开的后果是**界面上摆出一个点下去必然失败的动作**(最坏的一种交互)。
 *
 * ⚠️ **它不含额度。** 额度是"用完了"、不是"缺东西",而且它有一条**时机**要求:
 *   提议与确认之间隔着一次用户往返,所以必须在工具里查两遍(见 `render-look.ts` 文件头)。
 *   把它并进来的话,那个"查两遍"就变成"两个地方各查几遍"了。
 */
export function renderReadiness(session: Session): RenderReadiness {
  if (!session.lookSpec) return 'no_look';
  if (!session.faceRef) return 'no_face';
  return 'ready';
}
