/**
 * application/usecases/analyze-image.ts —— ★ **读图分析(这一条会花钱)。**
 *
 * 用户点了才跑:它不是工具,模型**碰不到**它(`definitions.ts` 里没有任何分析工具)。
 * 所以不需要 `render_look` 那套 `pendingConfirmation` 三态闸门——
 * **用户的这次 HTTP 点击本身就是 §7.4 要的那次人工动作。**
 *
 * ── 四步的顺序是有理由的,别重排 ──────────────────────────────────────────────
 *
 * 1. **归属**(会话不存在 / 不是他的 → `SESSION_NOT_FOUND`,不外泄存在性);
 * 2. **「用户填的优先」→ 不花钱直接回**。★ 必须在花钱**之前**判:反过来的话,
 *    用户每点一次就白花一次钱,而结果**一定**会被丢弃(见 `analysisWouldOverwrite`);
 * 3. **那张图在不在** → 缺图不调分析器,翻成人话;
 * 4. **解析路径**(本地读个文件,不花钱)→ **记账** → **花钱**。
 *
 * ★ 第 4 步里「记账在花钱之前」是刻意的:崩在中途时这次照样算数。
 *   只记成功等于给了一条「反复失败不计数」的免费通道。
 *
 * ✏️ **2026-09-29:单会话分析次数配额删掉了**(原 `AGENT_MAX_ANALYSES`)。
 *   记账(`addAnalysis`)留着——它记的是"这一次真的花了钱",不是"额度用掉一格"。
 *
 * ── 落点 ────────────────────────────────────────────────────────────────────
 * `face` → `brief.skinTone`;`scene` → `brief.sceneNote`;`style` → `session.styleRead`
 * **外加一条进 `messages[]` 的说明**。三者都由 `readAndApply` 一处收口,
 * 别在控制器里再摆一遍(落点表见本模块 README)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { AnalyzeCase, Analyzers } from '../../../makeup/index.js';
import { describeStyleRead } from '../../../makeup/index.js';
import {
  addAnalysis,
  analysisWouldOverwrite,
  appendMessages,
  patchBrief,
  setStyleRead,
  sourceRefOf,
} from '../../domain/entities/session.js';
import type { Session } from '../../domain/entities/session.js';
import { textMessage } from '../../domain/entities/message.js';
import { styleReadNote } from '../../domain/tools/observations.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import { analysisMessage } from '../analysis-messages.js';

/** 一次分析的结局。★ `would_overwrite` **没花一分钱**,这正是它值得单列的理由。 */
export type AnalyzeStatus = 'analyzed' | 'would_overwrite';

export interface AnalyzeOutcome {
  session: Session;
  kind: AnalyzeCase;
  status: AnalyzeStatus;
  /** 没真读成的话,**为什么**。★ 空则无键;这一支必须有话说,静默=看着像坏了。 */
  notice?: string;
}

/*
 * ★ **本文件里不写任何给用户看的话**——都住在 `../analysis-messages.ts`。
 *   别在这儿再拼一份(哪怕只是包一层)。
 */

export class AnalyzeImage {
  constructor(
    private readonly deps: {
      sessions: SessionStore;
      artifacts: SessionArtifacts;
      /** ★ 三个适配器齐了才装配得起来(见 `Analyzers` 那个 mapped type)。 */
      analyzers: Analyzers;
    },
  ) {}

  async execute(sessionId: string, userId: string, kind: AnalyzeCase): Promise<AnalyzeOutcome> {
    const session = await this.deps.sessions.find(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
    }

    // ② ★ 用户填的优先 —— **在花钱之前**判,而且这一支根本不动会话。
    if (analysisWouldOverwrite(session, kind)) {
      return { session, kind, status: 'would_overwrite', notice: analysisMessage(kind, 'would-overwrite') };
    }

    // ③ 图在不在。★ 取图表只此一份(`sourceRefOf`),这里不重写一遍三个 `=== undefined`。
    const ref = sourceRefOf(session, kind);
    if (!ref) throw new AppError(ErrorCode.VALIDATION_ERROR, analysisMessage(kind, 'missing-image'));

    // ④ 解析路径(本地、免费)→ 记账(钱已经打算花了)→ 花钱。
    const filePath = await this.deps.artifacts.resolveImage(session.id, ref);
    // ★ 先记账**再读图**:分析器抛错时这次照样算数。
    //   反过来的话,一个永远抛错的适配器可以无限次重试,而每次都真花钱。
    const counted = addAnalysis(session, kind);
    await this.deps.sessions.save(counted);

    const next = await this.readAndApply(counted, kind, { filePath, mimeType: ref.mimeType });
    await this.deps.sessions.save(next);
    return { session: next, kind, status: 'analyzed' };
  }

  /**
   * **读 + 落点**,三个 case 一次分派干净(控制器不再摆一遍)。
   *
   * ★ 为什么非要 `switch` 而不能写成 `analyzers[kind].read(...)`:
   *   那样拿到的是一个**三个签名并起来的联合**,TypeScript 认不出它可调用;
   *   而收窄到具体那一支之后,**返回值也各自正确**,不需要任何 `as`(§7.3)。
   * ★ 没有 `default`:少写一个 case 时这个函数**编译不过**(返回类型对不上)。
   */
  private async readAndApply(
    session: Session,
    kind: AnalyzeCase,
    image: { filePath: string; mimeType: string },
  ): Promise<Session> {
    switch (kind) {
      case 'face': {
        const { skinTone } = await this.deps.analyzers.face.read({ image });
        return patchBrief(session, { skinTone });
      }
      case 'scene': {
        const { sceneNote } = await this.deps.analyzers.scene.read({ image });
        return patchBrief(session, { sceneNote });
      }
      case 'style': {
        const read = await this.deps.analyzers.style.read({ image });
        // ★ 除了记进 `styleRead`,还必须**进模型看得见的地方**——见 `styleReadNote`。
        return appendMessages(setStyleRead(session, read), [
          textMessage('user', styleReadNote(describeStyleRead(read))),
        ]);
      }
    }
  }
}
