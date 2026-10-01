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
 * ★ **前置条件在"提议"阶段就查一遍**,不是在用户点确认之后才查:
 *   点完确认再告诉他"不行",是**最坏的一种交互**——用户已经做了决定,
 *   系统却在他决定之后才说自己没准备好。所以缺照片 / 缺妆面都在提议时挡回,
 *   前端因此也拿不到一个点下去必然失败的确认框。
 *
 * ✏️ **2026-09-16 起,出图还有第二条入口**(`ConfirmRender` 的入口 B,见那个文件头):
 *   用户点的是**界面按状态自己摆的那条消息**,服务端**合成**一条提议后直接按批准执行。
 *   那一支**没有"提议阶段"**——它一进来就是 `'approved'`。
 *   ★ 这不违背上面那条规矩:用户点下去的前提是**界面已经确认过 `readiness`**
 *   (视图的 `renderOffer` 只在齐备时才摆出来),所以"点了才说不行"那种形状不会出现。
 *   **两处判据同源**(`renderReadiness`)。
 *
 * ✏️ **2026-09-29:单会话出图配额整条删掉**(原 `AGENT_MAX_RENDERS`,即 §10 `[I3]`)。
 *   出图这道闸门此后只剩**每次都要人点一遍确认**,没有次数上限。
 */
import { AppError } from '../../../shared/index.js';
import { describeLook, validateEngineResult } from '../../../makeup/index.js';
import type { Engine, EngineInput } from '../../../makeup/index.js';
import { addRender, renderReadiness } from '../../domain/entities/session.js';
import type { Session } from '../../domain/entities/session.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import { RENDER_LOOK } from '../../domain/tools/definitions.js';
import { renderCountOf, renderPlanOf } from '../step-zones.js';
import type { PlannedRender } from '../step-zones.js';
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
 * 三个分支各写一遍拼接,早晚还会有第四个分支漏掉——
 * 所以做成函数,**加分支时想不缀都难**。
 */
function failure(content: string): ToolOutcome {
  return { content: `${content}${NO_CONFIRMATION_NOTICE}`, isError: true };
}

export interface RenderLookDeps {
  /** 上妆引擎(makeup 的端口)。★ 依赖方向 agent → makeup,引擎不 import 本模块。 */
  engine: Engine;
  artifacts: SessionArtifacts;
}

/**
 * 单张图的典型耗时(秒)。★ 只用来算"大约还要多久"这类**人话**——
 * **不要拿它做超时判断**,超时预算是 `confirm-render.ts` 那一份(它更大)。
 */
export const SECONDS_PER_IMAGE = 7;

/**
 * ★ **确认框上那句话的唯一来源**——工具与对外视图都用它,
 *   免得"前端弹的话"和"后端以为用户看到的话"是两句。
 *
 * ⚠️ **刻意不报一个具体的金额**:§15.3 明确记着本项目**未核任何模型的价格**。
 *   编一个"约 0.3 元"出来,是拿一个没人验证过的数字去替用户做花钱的决定。
 *   说"按次计费"是准确的;说多少钱现在说不准。
 *
 * @param imageCount ✏️ 2026-10-01:一次确认现在会出**多张**(每个上妆步一张),
 *   所以张数与总时长必须写出来 —— 此前只报"一张、约 7 秒",而实际是 3~7 张、
 *   每张都计费。**这不是"还剩 N 张"那种额度**,是这一次要花的次数。
 */
export function renderConfirmationSummary(imageCount: number): string {
  if (imageCount <= 1) {
    return `要现在生成成片吗?这一步会真的出一张图,大约需要 ${SECONDS_PER_IMAGE} 秒,并按次计费。`;
  }
  return (
    `要现在生成成片吗?这套妆有 ${imageCount} 个上妆步骤,会依次出 ${imageCount} 张图` +
    `(每个上妆步一张),每张都按次计费,总共大约 ${imageCount * SECONDS_PER_IMAGE} 秒。`
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

    // ★ **缺什么才算不能出图,由 `renderReadiness` 判一次**——同一份判据还要被
    //   `ConfirmRender`(决定让不让这次出图)与视图(决定摆不摆那条出图消息)读,
    //   三处各写一遍 `lookSpec ? … : faceRef ? …` 迟早只改一处。
    //   下面两支只负责**说给谁听**:这里读它的是模型。
    const readiness = renderReadiness(session);
    if (readiness === 'no_look') {
      return failure(
        '现在还没有妆面可以出图。请先用 propose_look 提出一套妆面,和用户确认之后再调用本工具。',
      );
    }
    if (readiness === 'no_face') {
      // ★ 就是这一支漏了末尾那句,模型于是说了「确认之后我就开始出图」(2026-09-16)。
      return failure(
        '还没有拿到用户的照片,出不了图。请先请用户上传一张本人的正面照片(正面、光线均匀、不戴墨镜)。',
      );
    }

    // ★ 上面两关过了 ⇒ 妆面与照片都在。**这个非空断言跟着那份判断走**:
    //   判据的唯一出处就是 `renderReadiness`,所以它不会和它漂开(同 `render()` 里那句 `faceRef!`)。
    const spec = session.lookSpec!;

    // ── 三态 ──
    if (context.confirmation === undefined) {
      const pending: PendingConfirmation = {
        kind: 'render_look',
        summary: renderConfirmationSummary(renderCountOf(session.plan)),
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

  /**
   * ✏️ 2026-10-01:**从"一次引擎调用"改成"一次循环"**——每个上妆步出一张,
   *   累积的是**提示词里列出的区**(`appliedZones` 逐步变长)。
   * ⚠️ 每一张都拿**本人原始照片**当输入、各画各的(不是把上一张的产物再喂进去)——
   *   所以第 N 张不是"第 N-1 张再加工",两者是**并列**的;这条也是 mock 下几张
   *   逐字节相同的原因。
   *
   * 四条顺序不能动:
   * ① **逐张先落盘再记会话**(理由同旧版:记完却写失败 = 会话里有一张取不到的图);
   * ② `appliedZones` 只增不减,★ 最后一张的集合 = 妆面单里填的全部区 ⇒
   *    它的提示词与"一次画完整套"逐字相同(见 `prompt-builder` 的 `coversEveryZone`);
   * ③ **中途失败留住已经出的那几张**:旧实现 catch 里把整个会话丢掉,
   *    第 5 张挂掉 = 前 4 张的钱白花、图也取不到;
   * ④ 中途失败的那条 observation **不许缀 `NO_CONFIRMATION_NOTICE`** ——
   *    那句话断言"没有弹出过确认框",而这里已经出了图,它是假的。
   */
  private async render(
    session: Session,
    spec: NonNullable<Session['lookSpec']>,
  ): Promise<ToolOutcome> {
    const faceRef = session.faceRef!;
    const shots = renderPlanOf(session.plan);

    let faceFilePath: string;
    try {
      faceFilePath = await this.deps.artifacts.resolveFace(session.id, faceRef);
    } catch (err) {
      // 一张都还没出,所以这一支照旧可以用统一出口(它带着那句"没有确认框"的提醒)。
      return failure(
        `这次没能出图:${reasonOf(err)}。` +
          '请如实告诉用户这张图没出来(不要假装已经出好),并说明可以稍后再试一次。',
      );
    }

    let current = session;
    const seqs: number[] = [];
    for (const shot of shots) {
      try {
        const engineInput: EngineInput = {
          face: { filePath: faceFilePath, mimeType: faceRef.mimeType },
          brief: session.brief,
          lookSpec: spec,
          // ★ 只画到这一步为止。整个键缺席 = 一次画完整套(没有方案时那一张)。
          ...(shot.appliedZones ? { appliedZones: shot.appliedZones } : {}),
        };
        // ⚠️ `references`(风格参考图)**已决定不传**:那张图只做文本化分析
        //    (`styleReadNote` 进 `messages[]`),不进引擎。见 `makeup/README.md` 待办。
        const result = validateEngineResult(await this.deps.engine.generate(engineInput));

        const seq = current.renders.length + 1;
        const ref = await this.deps.artifacts.putRender(
          current.id,
          seq,
          result.image.filePath,
          result.image.mimeType,
        );
        current = addRender(current, {
          ref,
          stepIds: shot.stepIds,
          // ★ 记的是**此刻这份** spec 的说法 + 此刻画到哪儿了:用户之后改妆,
          //   这张图仍然是当时那套、当时那一步的样子。
          lookDescription: describeLook(spec, shot.appliedZones),
        }).session;
        seqs.push(seq);
      } catch (err) {
        // ★ 生图超时 / key 失效 / 审核拦截都走这里(§7.3 第 4 条:不抛穿循环)。
        return this.partial(current, seqs, shot, err);
      }
    }

    const last = shots.at(-1);
    return {
      content:
        `${RENDER_DONE_PREFIX}(第 ${seqs.at(-1)} 张,共 ${seqs.length} 张)。` +
        `这套妆是:${describeLook(spec, last?.appliedZones)}。` +
        '请用一两句话把它讲给用户听,并问他这张行不行。',
      session: current,
    };
  }

  /**
   * 出到一半失败。★ **已经出的图照旧留在会话里**——它们的钱已经花掉了,
   * 把会话丢掉等于让用户既看不到图、也没有任何记录。
   *
   * ⚠️ **第一张就挂掉时走 `failure()`**(那时确实一个新东西都没有),
   *   后面几张挂掉**不缀 `NO_CONFIRMATION_NOTICE`**:确认框是真的弹过、
   *   用户是真的点过的,那句话会变成假话(见 `render` 的第 ④ 条)。
   */
  private partial(
    session: Session,
    seqs: readonly number[],
    shot: PlannedRender,
    err: unknown,
  ): ToolOutcome {
    const detail = reasonOf(err);
    console.warn(
      `[agent] render_look 失败(第 ${seqs.length + 1} 张,步骤「${shot.stepName}」):${detail}`,
    );
    if (seqs.length === 0) {
      return failure(
        `这次没能出图:${detail}。` +
          '请如实告诉用户这张图没出来(不要假装已经出好),并说明可以稍后再试一次。',
      );
    }
    return {
      content:
        `${RENDER_DONE_PREFIX} ${seqs.length} 张,但**后面还有一步没出成**:` +
        `第 ${seqs.length + 1} 张(步骤「${shot.stepName}」)失败——${detail}。` +
        '请如实告诉用户已经出了哪几张、卡在哪一步,不要讲成整套都出好了;' +
        '已经出的那些图还在,用户稍后可以再点一次确认把剩下的补齐。',
      isError: true,
      session,
    };
  }
}

/** 引擎/存储抛出来的东西 → 一句能回填给模型的话。 */
function reasonOf(err: unknown): string {
  return err instanceof AppError ? err.message : '引擎返回了未预期的结果';
}
