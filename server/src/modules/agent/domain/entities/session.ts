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
 * ── ★ 形状在 `../schemas/entities/session.ts`,本文件一个字段都不声明 ────────────
 * 四个类都只做 `Object.assign(this, row)` + 声明合并,口径与理由同 `message.ts`
 * (那份 `declare private readonly brand` 的写法已废,名义化改由 schema 的 `.brand<>()` 承担)。
 * 品牌在这里收拢的是:**会话的写入只能经本文件那几个具名函数**(§8「实体是只读快照 + 具名守卫」)。
 */
import type { ImageRef, MakeupBrief } from '../../../shared/index.js';
import type { AnalyzeCase, LookSpec, StyleRead } from '../../../makeup/index.js';
import type { PlanView } from '../../../styling/index.js';
import type {
  AnalysisRecordRow,
  ConsultedProductRow,
  RenderRecordRow,
  SessionRow,
  SessionShape,
} from '../schemas/index.js';
import type { Message } from './message.js';

/**
 * 出过的一张图。★ **它是历史,不是当前状态**——
 * `lookDescription` 记的是**出这张图时**那份妆面单的说法,而不是"现在这套"。
 * 用户后来改了妆,已经出出来的那张图仍然是当时那套妆的样子,
 * 界面上必须还能这么说;**让它跟着 `session.lookSpec` 变,就是伪造了历史。**
 */
export class RenderRecord {
  constructor(row: RenderRecordRow) {
    Object.assign(this, row);
  }
}
export interface RenderRecord extends RenderRecordRow {}

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
  constructor(row: AnalysisRecordRow) {
    Object.assign(this, row);
  }
}
export interface AnalysisRecord extends AnalysisRecordRow {}

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
  constructor(row: ConsultedProductRow) {
    Object.assign(this, row);
  }
}
export interface ConsultedProduct extends ConsultedProductRow {}

export class Session {
  /**
   * ★ 收**整份字段**而不是 14 个位置参数:上面每加一个字段,位置参数就得改所有调用点。
   * 参数类型是 schema 的**输出行**(未加品牌),所以不另造一个字段同构的孪生类型(§4.1)。
   * ★ 用 `Object.assign` 而不是逐项赋值:调用方**没给的键就不会出现在实例上**
   *   (`{ ...session, lookSpec }` 那种"没提过的仍然没有"),与改动前逐项相同。
   */
  constructor(row: SessionRow) {
    Object.assign(this, row);
  }
}
export interface Session extends SessionShape {}

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

/**
 * 记下当前妆面单**和它的方案**。
 *
 * ★★ **`plan` 是必填的第三个参数,这不是啰嗦。** 方案(步骤 / 色号 / 产品 / 个性化)
 *   与妆面单是**同一次 `propose_look`** 的两样产出,`/result` 那一屏两样都摆。
 *   让它可选、或者分成两个函数调,就会出现"方案还是 A、妆面已经换成 B"的中间态
 *   —— 而那个中间态会被原样渲染给用户,她会拿 A 的步骤去理解 B 的成片。
 *   所以这里**刻意不给缺省**:谁改妆面,谁就必须把方案一起交出来。
 *
 * `plan` 允许是 `undefined`,那表达的是**「这套妆面没有配方」**——不是一个可以
 * 省略的参数,而是一个必须明写的判断(目前唯一的写者是 `propose_look`,它永远给得出)。
 */
export function setLookSpec(
  session: Session,
  lookSpec: LookSpec,
  plan: PlanView | undefined,
): Session {
  // ★ 上一份 `plan` **先摘掉再装**(不是"没给就留着"):传 `undefined` 的意思是
  //   "这套妆面没有配方",而留着一份属于**旧妆面**的方案,正是上面那段要防的中间态。
  //   { ...session } 是复制不出"少一个键"的,所以这里显式解构掉它。
  const { plan: _previous, ...rest } = session;
  return new Session({
    ...rest,
    lookSpec,
    ...(plan !== undefined ? { plan } : {}),
    updatedAt: nowIso(),
  });
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
  const record = new RenderRecord({
    seq: session.renders.length + 1,
    ref: input.ref,
    lookDescription: input.lookDescription,
    createdAt: nowIso(),
  });
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
    analyses: [...session.analyses, new AnalysisRecord({ kind, at: nowIso() })],
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
