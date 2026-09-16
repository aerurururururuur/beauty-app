/**
 * application/tools/render-look.ts —— ★ **唯一花钱的工具,也是人在回路闸门**。
 *
 * ── 三态,由一个字段区分(`ToolContext.confirmation`)───────────────────────
 *   `undefined`(首次执行) → **不调用引擎**,返回 `pendingConfirmation`,循环当场停下等用户。
 *   `'approved'`          → 真出图(会花钱),记进 `session.renders`。
 *   `'declined'`          → 明确说"这次没出图、也没花钱",并**清掉闸门**。
 *
 * ★ **判断权不在模型手里。** 描述里写了"调用不等于出图"是给模型听的,
 *   但**真正的闸门是这里**——`confirmation` 只由「用户点了确认」那条 HTTP 路径
 *   (和它对应的 `declined` 兜底)设置。模型无论怎么措辞都改不了它,
 *   **它甚至连"用户已经同意了"这个谎都撒不出来**,因为那不经过它。
 *
 * ★ **额度与前置条件在"提议"阶段就查一遍**,不是在用户点确认之后才查:
 *   点完确认再告诉他"不行",是**最坏的一种交互**——用户已经做了决定,
 *   系统却在他决定之后才说自己没准备好。所以缺照片 / 缺妆面 / 超额都在提议时挡回,
 *   前端因此也拿不到一个点下去必然失败的确认框。
 *   ⚠️ 但 `'approved'` 分支**仍然再查一遍额度**:提议与确认之间隔着一次用户往返,
 *   期间他完全可能又出了一张。这第二遍不是冗余。
 */
import { AppError } from '../../../shared/index.js';
import { describeLook, validateEngineResult } from '../../../makeup/index.js';
import type { Engine, EngineInput } from '../../../makeup/index.js';
import { addRender, rendersLeft } from '../../domain/entities/session.js';
import type { Session } from '../../domain/entities/session.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import { RENDER_LOOK } from '../../domain/tools/definitions.js';
// ★ 这两段 observation 的开头搬去了 domain:离线演示驱动(`infrastructure/llm/demo-llm.ts`)
//   也要读它们,理由见那个文件。
import {
  NO_CONFIRMATION_NOTICE,
  RENDER_DECLINED_PREFIX,
  RENDER_DONE_PREFIX,
} from '../../domain/tools/observations.js';
import type { PendingConfirmation, Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';

/**
 * ★ **每一个失败分支的统一出口**,理由只有一条:**末尾那句必须一个不漏。**
 *
 * 2026-09-16 端到端实测:缺照片那一支**漏了**这句,模型于是回了
 * 「确认之后我就开始出图」而什么都没弹出来(见 `NO_CONFIRMATION_NOTICE`)。
 * 五个分支各写一遍拼接,早晚还会有第六个分支漏掉——
 * 所以做成函数,**加分支时想不缀都难**。
 */
function failure(content: string): ToolOutcome {
  return { content: `${content}${NO_CONFIRMATION_NOTICE}`, isError: true };
}

/**
 * §10 `[I3]` 的缺省上限。`<= 0` = 不限制。
 * ★ 与 `shared/infrastructure/config.ts` 的 `AGENT_MAX_RENDERS` 缺省值是同一个数,
 *   两处要一起改(同那几个 union 的规矩)。
 *
 * **为什么是 3**:一次对话里值得让用户点三次确认(初版 / 改一版 / 再改一版);
 * 到这个数还没满意,问题多半在妆面方向而不在次数上——
 * 而那件事该由**人**去说清楚,不是靠再多烧几张图碰运气。
 */
export const DEFAULT_MAX_RENDERS = 3;

export interface RenderLookDeps {
  /** 上妆引擎(makeup 的端口)。★ 依赖方向 agent → makeup,引擎不 import 本模块。 */
  engine: Engine;
  artifacts: SessionArtifacts;
  /** §10 `[I3]`:`<= 0` 表示不限制(默认值见 `config.ts`,可配)。 */
  maxRenders: number;
}

/**
 * ★ **确认框上那句话的唯一来源**——工具与对外视图都用它,
 *   免得"前端弹的话"和"后端以为用户看到的话"是两句。
 *
 * ⚠️ **刻意不报一个具体的金额**:§15.3 明确记着本项目**未核任何模型的价格**。
 *   编一个"约 0.3 元"出来,是拿一个没人验证过的数字去替用户做花钱的决定。
 *   说"按次计费"是准确的;说多少钱现在说不准。
 */
export function renderConfirmationSummary(session: Session, maxRenders: number): string {
  const left = rendersLeft(session, maxRenders);
  return (
    '要现在生成成片吗?这一步会真的出一张图,大约需要 7 秒,并按次计费。' +
    (maxRenders > 0 ? `这个会话还可以出 ${left} 张(上限 ${maxRenders} 张)。` : '')
  );
}

export class RenderLookTool implements Tool {
  readonly definition = RENDER_LOOK;

  constructor(private readonly deps: RenderLookDeps) {}

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    // 定义里是空 schema,但模型偶尔还是会塞点东西进来。**不报错、忽略**——
    // 为这个失败一次不值得烧一个来回(而 schema 已经把它挡在"契约"之外了)。
    void input;

    const { session } = context;
    const spec = session.lookSpec;
    if (!spec) {
      return failure(
        '现在还没有妆面可以出图。请先用 propose_look 提出一套妆面,和用户确认之后再调用本工具。',
      );
    }
    if (!session.faceRef) {
      // ★ 就是这一支漏了末尾那句,模型于是说了「确认之后我就开始出图」(2026-09-16)。
      return failure(
        '还没有拿到用户的照片,出不了图。请先请用户上传一张本人的正面照片(正面、光线均匀、不戴墨镜)。',
      );
    }

    // ── 三态 ──
    if (context.confirmation === undefined) {
      const left = rendersLeft(session, this.deps.maxRenders);
      if (this.deps.maxRenders > 0 && left <= 0) {
        return failure(
          `这个会话的出图次数已经用完了(上限 ${this.deps.maxRenders} 张)。` +
            '请如实告诉用户,并说明可以用「直接生成」那条路再拿图,或新开一个会话。',
        );
      }
      const pending: PendingConfirmation = {
        kind: 'render_look',
        summary: renderConfirmationSummary(session, this.deps.maxRenders),
      };
      return {
        // ⚠️ **这一段模型读不到,别指望改它来纠行为。** 有 `pendingConfirmation` 时
        //   那一轮的 `tool_result` 是**被丢掉的**(`agent-loop.ts` ⑦:发一半会 400),
        //   循环当场停下,模型没有再说话的机会。它唯一的读者是本文件的测试。
        //   ★ 所以"那句回执该不该说"的措辞必须写在**模型真的读得到的地方**:
        //     `definitions.ts` 的 `RENDER_LOOK` 描述、`system-prompt.ts` 第 6 条、
        //     以及**失败分支**的末尾(`NO_CONFIRMATION_NOTICE`)。
        content:
          '已把出图请求交给用户确认。**那个框由界面自己弹、自己解释**,不需要你转述,' +
          '也不要承诺出图、**不要说你已经出好了**、更不要催用户点确认——就此**停下等他**。',
        pendingConfirmation: pending,
      };
    }

    if (context.confirmation === 'declined') {
      return {
        content:
          `${RENDER_DECLINED_PREFIX},所以这次**没有生成任何图、也没有产生费用**。` +
          '请继续和他讨论妆面;他之后说想要成片时,可以再调用本工具。',
      };
    }

    // ── 'approved':真出图 ──
    return this.render(session, spec);
  }

  private async render(
    session: Session,
    spec: NonNullable<Session['lookSpec']>,
  ): Promise<ToolOutcome> {
    // 第二遍额度检查(见文件头:提议与确认之间隔着一次用户往返)。
    if (this.deps.maxRenders > 0 && rendersLeft(session, this.deps.maxRenders) <= 0) {
      return failure(`出图次数已经用完了(上限 ${this.deps.maxRenders} 张),这次没有生成。`);
    }

    const faceRef = session.faceRef!;
    try {
      const faceFilePath = await this.deps.artifacts.resolveFace(session.id, faceRef);
      const engineInput: EngineInput = {
        face: { filePath: faceFilePath, mimeType: faceRef.mimeType },
        // 风景与氛围参考图**不参与**妆容方向(§4.1),这里就是空的。
        scenes: [],
        brief: session.brief,
        lookSpec: spec,
      };
      const result = validateEngineResult(await this.deps.engine.generate(engineInput));

      // ★ 先落盘再记会话:反过来的话,记完却写失败,会话里就有一张取不到的图。
      const seq = session.renders.length + 1;
      const ref = await this.deps.artifacts.putRender(
        session.id,
        seq,
        result.resultFilePath,
        result.mimeType,
      );
      const { session: next } = addRender(session, {
        ref,
        // ★ 记的是**此刻这份** spec 的说法:用户之后改妆,这张图仍然是当时那套。
        lookDescription: describeLook(spec),
      });

      return {
        content:
          `${RENDER_DONE_PREFIX}(第 ${seq} 张)。这套妆是:${describeLook(spec)}。` +
          '请用一两句话把它讲给用户听,并问他这张行不行。',
        session: next,
      };
    } catch (err) {
      // ★ 生图超时 / key 失效 / 审核拦截都走这里(§7.3 第 4 条:不抛穿循环)。
      //   对用户要说得像人话,对模型要给一个可行动的下一步。
      const detail = err instanceof AppError ? err.message : '引擎返回了未预期的结果';
      console.warn(`[agent] render_look 失败:${detail}`);
      return failure(
        `这次没能出图:${detail}。` +
          '请如实告诉用户这张图没出来(不要假装已经出好),并说明可以稍后再试一次,' +
          '或者改用「直接生成」那条路。',
      );
    }
  }
}
