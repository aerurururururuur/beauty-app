/**
 * application/tools/propose-look.ts —— `propose_look` 的实现(免费、无 IO)。
 *
 * ★ 它是 §4 那条核心约束的**执行点**:模型给的是**结构化字段**,
 * 之后由 `describeLook` 渲染成人话——**模型从头到尾没有经手过一句提示词**。
 * §10 `[I1]`「LLM 产出的任何字段都不直接进入 prompt 文本」在这里被兑现:
 * 本工具连 prompt 都看不见。
 *
 * ★ 校验用 `validateLookSpec`,**带上会话里已知的 `skinTone`**——
 * 这就是 §6 规矩 4「合法取值空间按肤色收窄,而不是生成完再检查」的落点。
 * 肤色还没问出来时(`skinTone === undefined`)不收窄:那是"还不知道",
 * 该让对话继续问,而不是把一份合法妆面打回。
 *
 * ── ★★ 2026-09-30:本工具**同时产出一份「方案」** ──────────────────────────────
 *
 * `styleId` 是新增的必填入参,它**不属于 `LookSpec`**(那是一份妆面),
 * 所以摘出来单独校验,再由 `styling` 的 `derivePlan` + `decoratePlan` 展开成
 * 「步骤 / 色板 / 产品 / 个性化调整」(色值已补齐),和妆面单**在同一次调用里**写进会话。
 *
 * ★ **为什么不新开一个 `propose_plan`**:两次调用就有两个决定,
 *   "讲给用户的那套方案"与"真的要拿去出图的那套妆"可能不是一套——
 *   而用户是拿方案当成片的承诺的(见 `look-description.ts` 文件头,
 *   它正是为这条判了 CSS 预览的死刑)。**一次调用、一个决定、两样产出**,
 *   一致性由结构保证,不需要提示词去嘱咐。
 */
import { AppError } from '../../../shared/index.js';
import { LookSpec as LookSpecEntity, describeLook, validateLookSpec } from '../../../makeup/index.js';
import type { LookSpec, SkinTonePalette } from '../../../makeup/index.js';
import { decoratePlan, derivePlan } from '../../../styling/index.js';
import type { PlanDraft, PlanPersonalized, PlanView, ShadeLookup } from '../../../styling/index.js';
import { PROPOSE_LOOK } from '../../domain/tools/definitions.js';
import { styleOptionsHint } from '../style-options-description.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import type { FeatureStrategies } from '../../domain/ports/feature-strategies.js';
import { setLookSpec } from '../../domain/entities/session.js';

/**
 * 把工具入参拆成两半:`styleId`(本工具自己的)与**剩下的那份妆面**。
 *
 * ⚠️ **必须拆。** `lookSpecSchema` 是 `.strict()` 的,多一个键就**整份**被打回
 * (报的还是"多余的键"这种和妆面对不上的话)——而 `styleId` 在工具 schema 里
 * 就是和 `occasion` / `base` / `zones` 平级的必填项。
 *
 * 入参是 `unknown`(可能整个不是对象),所以这里有一次窄化读;读不到就当没给,
 * 由调用方翻成"列出整池"的错误。
 */
function splitInput(input: unknown): { styleId: string | undefined; look: unknown } {
  if (typeof input !== 'object' || input === null) return { styleId: undefined, look: input };
  const { styleId, ...look } = input as Record<string, unknown>;
  return {
    styleId: typeof styleId === 'string' ? styleId.trim() || undefined : undefined,
    look,
  };
}

export class ProposeLookTool implements Tool {
  readonly definition = PROPOSE_LOOK;

  /**
   * `palette` 是**词表端口**,由组装根注入(cabinet / products 那条先例)。
   * ★ 它必填而不是可选:少传它就等于「按肤色收窄」静默关闭(妆面照过、色域不再受限),
   *   而那正是本仓库的头号 bug 类型。见 `makeup/domain/ports/skin-tone-palette.ts`。
   *
   * `features` 同一条理由:少传它方案里的「针对本人」那一块**永远为空**,
   * 而界面上没人看得出来(用户会以为"我填的那些特征没什么可调的")。
   * 见 `agent/domain/ports/feature-strategies.ts`。
   *
   * `shades` 还是同一条理由:少传它,`decoratePlan` 拿不到色值 ⇒ 方案里**每一块
   * 色卡都没有颜色**,而步骤与色板的条数一格不少 —— 界面上是一排空白格子,
   * 没人知道那里本该有颜色。见 `styling/domain/ports/shade-lookup.ts`。
   */
  constructor(
    private readonly palette: SkinTonePalette,
    private readonly features: FeatureStrategies,
    private readonly shades: ShadeLookup,
  ) {}

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    const brief = context.session.brief;
    const { styleId, look } = splitInput(input);

    let spec: LookSpec;
    try {
      spec = validateLookSpec(look, {
        skinTone: brief.skinTone,
        palette: this.palette,
      });
    } catch (err) {
      // 校验失败的 message 已经写成"带合法取值清单"的形状(见 look-spec.validator.ts),
      // 可以**原样**回填给模型——这就是把错误消息当 prompt 写的好处,这里不需要再加工。
      return { content: noLookNotice(messageOf(err)), isError: true };
    }

    /**
     * ★ **这个场合说了算的,是用户填的那个**(表单那条路一次填完,用户按的就是它),
     *   模型自己的 `occasion` 只是它推出来的。两者不一致时以 `brief` 为准,
     *   并把妆面单上的 `occasion` **改过来**——否则会出现"用户说的是朋友的婚礼、
     *   妆面单说聚会"这种两份都对不上的状态,而 `lookDescription` 是照妆面单渲染的、
     *   给用户看的那一份。
     *
     * ★ 两边都是**自由文本**(2026-09-30):用户能说预设表外的场合,所以这里只比字符串,
     *   **不做任何"收进最近的一档"**——那正是本仓头号 bug 的形状。
     * 用户没填过时(纯对话那条路)才轮到模型的判断。
     */
    const occasion: string = brief.occasion ?? spec.occasion;

    /**
     * 特征 id → 策略卡。**未知 id 直接剔掉**(同前端 `featureById` 返回 `null` 的行为):
     * 用户人设里存的 id 可能比后端词表旧,那是正常情况,不该让整份方案失败。
     * ⚠️ 顺序即 `brief.features` 的顺序——用户勾选的次序就是她想先看到的那几条。
     */
    const personalized: PlanPersonalized[] = (brief.features ?? [])
      .map((id) => this.features.byId(id))
      .filter((card): card is PlanPersonalized => card !== undefined);

    // ⚠️ **不再传 `occasion`**:候选风格已与场合无关(见 `derive-plan.ts` 的注释)。
    // ★ 两步:先纯推导出一份 `PlanDraft`,再补色值成 `PlanView`。
    //   **写进会话的是补完色值的那一份** —— 它是唯一会对外的形状(见 `plan-view.ts` 文件头)。
    const draft: PlanDraft | undefined = styleId
      ? derivePlan({ styleId, personalized })
      : undefined;
    const plan: PlanView | undefined = draft ? decoratePlan(draft, this.shades) : undefined;

    if (!plan) {
      // ★ 两条失败(`styleId` 没给 / 给了个不认得的)合成一条消息:**那份清单是唯一
      //   能让他改对的东西**,分两句说反而让它先回一句"我漏了参数"再走一轮。
      const chosen = styleId ? `styleId「${styleId}」不在` : '缺少 styleId,或它不在';
      return {
        content: noLookNotice(
          `${chosen}可选风格里。可选:${styleOptionsHint()}。` +
            '请从这些里选一个**与你要提的这套妆相配**的,再调用一次本工具。',
        ),
        isError: true,
      };
    }

    // 妆面单上的场合要跟用户说的那个一致(理由见上面 `occasion` 那一段)。
    const consistent =
      spec.occasion === occasion ? spec : new LookSpecEntity({ ...spec, occasion });

    const session = setLookSpec(context.session, consistent, plan);
    return {
      content: [
        '已记下这套妆面:',
        describeLook(consistent),
        '',
        `并记下它的方案:风格「${plan.styleName}」,共 ${plan.meta.stepCount} 步。`,
        '请把这段描述**讲给用户听**(用你自己的话,但内容要与之一致),并问她要不要调整。',
        '注意:这段描述就是用户在出图前唯一能看到的东西,不要添加它没说的效果承诺。',
      ].join('\n'),
      session,
    };
  }
}

function messageOf(err: unknown): string {
  return err instanceof AppError ? err.message : '妆面单不合法,但原因未知';
}

/**
 * ★★ **开头那句"这次没有记下任何妆面"是 2026-09-16 补的,别删。**
 *   实测(真实模型):报错之后模型**没有重试**,而是直接在正文里把一套
 *   (它自己以为改好了的)妆面讲给用户听,用户当然以为妆面已经定了——
 *   而会话里 `lookSpec` 一直是空的。后面用户说"出图吧",`render_look`
 *   只能回一句"还没有妆面可以出图",整条链路在那个点上塌掉。
 *   ⇒ 与 `render_look` 的失败分支同一个道理(见 `NO_CONFIRMATION_NOTICE`):
 *     **失败必须把"什么都没发生"这个事实说在最前面**,不能只说哪里不对。
 *
 *   ⚠️ 这条提醒里也要带上**方案**,不是只提妆面:两条失败分支都会让
 *   `plan` 一起落空,而"方案"是用户在 `/result` 上真正会看到的那一屏。
 */
function noLookNotice(reason: string): string {
  return (
    '★ 这次**没有记下任何妆面**,也没有记下方案——你刚才那套不存在于会话里,' +
    `用户在界面上也看不到它。${reason}。请修正后**再调用一次本工具**;` +
    '在它返回成功之前,不要用正文把一套妆面讲成已经定下来的。'
  );
}
