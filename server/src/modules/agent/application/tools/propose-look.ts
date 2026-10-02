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
 * 妆面与方案在**同一次调用里**写进会话。★ **为什么不新开一个 `propose_plan`**:
 * 两次调用就有两个决定,"讲给用户的那套方案"与"真的要拿去出图的那套妆"可能不是一套——
 * 而用户是拿方案当成片的承诺的。**一次调用、一个决定、两样产出**,
 * 一致性由结构保证,不需要提示词去嘱咐。
 *
 * ✏️ 2026-10-01:改成「先展开方案、再校验妆面单」。`validateLookSpec` 多收了
 *   一个 `requiredZones`(本套该有哪些区),见 `../step-zones.ts`。
 *
 * ── ★★ 2026-10-02:步骤改由**模型自己写**(配方降为参考) ────────────────────────
 *
 * 入参从「一个 `styleId`」变成「`styleName` + `steps` + `products` + `palette`」。
 * `requiredZones` 的判据跟着换:`requiredZonesOf(plan)` 行为没变,但数据源
 * 从配方变成了**模型自己写的那几步**。
 *
 * ★ 三道闸,失败一律走 `noLookNotice` + `isError`,一条都不许静默放过:
 *   ① 步骤名认不出来(那一步没有图,却是一个干净的 200);
 *   ② 一个出图步都没有(会静默落进「整脸」兜底那一张);
 *   ③ ✏️ 2026-10-02 稍后加的:**模型自给的 `palette` 里 `hex` 不是色值 / 超过 8 条**
 *      (色板少一块界面上看不出来,而这是它自己写错的,一个回合就能改对)。
 *
 * ✏️ 2026-10-02 稍后:**推荐产品查不到色值不再打回,改成整条丢掉**。
 *   判据是用户拍的那句「色号可以自己推理,产品库里有的可以推荐,没有的就算了,不要硬推荐」。
 *   硬打回等于让一份**顺手给的建议**把整份方案(连妆面)一起作废,推荐产品没有那个权力。
 *   ⚠️ 但丢掉的那几条**要回填给模型**,否则它在正文里照旧推荐、而 `/result` 上是空的
 *      ——那就是"讲给用户的"与"界面上的"不是一套(同 `noLookNotice` 的理由)。
 *   ⚠️ 只在**配了产品库**时才判:没配的部署里一个色值都查不到,
 *     那是部署形态不是错误(同 `compose.ts` 里 `shades` 与 `products` 那段分辨)。
 */
import { AppError } from '../../../shared/index.js';
import { LookSpec as LookSpecEntity, describeLook, validateLookSpec } from '../../../makeup/index.js';
import type { LookSpec, SkinTonePalette } from '../../../makeup/index.js';
import { MAX_PALETTE, composePlan, decoratePlan, styleById } from '../../../styling/index.js';
import type {
  ComposePlanStep,
  PlanDraft,
  PlanPaletteEntryDraft,
  PlanPersonalized,
  PlanProductDraft,
  PlanView,
  ShadeLookup,
} from '../../../styling/index.js';
import { PROPOSE_LOOK, proposeLookWithTones } from '../../domain/tools/definitions.js';
import { planGuidance, productGuidance } from '../plan-guidance.js';
import { stepVocabularyHint } from '../step-vocabulary-description.js';
import { styleOptionsHint } from '../style-options-description.js';
import { MAX_RENDER_SHOTS, checkStepNames, renderCountOf, requiredZonesOf } from '../step-zones.js';
import type { ProductLibrary } from '../../domain/ports/product-library.js';
import type { ShadeCatalog } from '../../domain/ports/shade-catalog.js';
import type { LlmToolDefinition } from '../../domain/ports/llm.js';
import type { Tool, ToolContext, ToolOutcome } from '../../domain/tools/tool.js';
import type { FeatureStrategies } from '../../domain/ports/feature-strategies.js';
import type { Session } from '../../domain/entities/session.js';
import { setLookSpec } from '../../domain/entities/session.js';

/**
 * 本工具自己产出的那几格。⚠️ **必须按显式键名剥掉**:`lookSpecSchema` 是 `.strict()`,
 * 多一个键**整份**被打回,报的还是"多余的键"这种和妆面对不上的话。
 * 加一个自己的入参,就要在这张表里加一个名字。
 */
const OWN_KEYS = [
  'styleId',
  'styleName',
  'summary',
  'keywords',
  'steps',
  'products',
  'palette',
] as const;

/** 色值的形状。与产品库那份 `shadeSchema.hex` 同一条正则(六位十六进制)。 */
const HEX_RE = /^#[0-9a-f]{6}$/i;

/** 入参拆两半:上面那张表里的归本工具,剩下的那份才交给 `validateLookSpec`。 */
function splitInput(input: unknown): { own: Record<string, unknown>; look: unknown } {
  if (typeof input !== 'object' || input === null) return { own: {}, look: input };
  const rest: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  const own: Record<string, unknown> = {};
  for (const key of OWN_KEYS) {
    if (key in rest) {
      own[key] = rest[key];
      delete rest[key];
    }
  }
  return { own, look: rest };
}

/** 入参一律 `unknown`(注册表按名字分发,不保证形状),所以每一格都得自己挡。 */
function fieldOf(item: unknown, key: string): unknown {
  return typeof item === 'object' && item !== null ? (item as Record<string, unknown>)[key] : undefined;
}

/** 非空字符串才算给了。空串 / 空白 = 没给(模型常把"没有"写成 `""`)。 */
function textOf(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
}

function textsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(textOf).filter((s): s is string => s !== undefined);
}

/** 模型写的步骤。★ 读不成形状返回 `undefined`,由调用方翻成一条能改对的消息。 */
function stepsOf(raw: unknown): ComposePlanStep[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ComposePlanStep[] = [];
  for (const item of raw) {
    const name = textOf(fieldOf(item, 'name'));
    const desc = textOf(fieldOf(item, 'desc'));
    if (name === undefined || desc === undefined) return undefined;
    out.push({ name, desc });
  }
  return out;
}

/** 推荐产品。不给 / 给空数组都是 `[]`;写不成形状返回 `undefined`。 */
function productsOf(raw: unknown): PlanProductDraft[] | undefined {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return undefined;
  const out: PlanProductDraft[] = [];
  for (const item of raw) {
    const name = textOf(fieldOf(item, 'name'));
    const pid = textOf(fieldOf(item, 'pid'));
    if (name === undefined || pid === undefined) return undefined;
    // ★ `code` 空 = **整件推荐**(这件产品没有色号),是合法值,不是漏填。
    out.push({ name, pid, code: textOf(fieldOf(item, 'code')) ?? '' });
  }
  return out;
}

/** 模型直接给的色板。不给 / 给空数组都是 `[]`;写不成形状返回 `undefined`。 */
function paletteOf(raw: unknown): PlanPaletteEntryDraft[] | undefined {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return undefined;
  const out: PlanPaletteEntryDraft[] = [];
  for (const item of raw) {
    const name = textOf(fieldOf(item, 'name'));
    const hex = textOf(fieldOf(item, 'hex'));
    if (name === undefined || hex === undefined) return undefined;
    // ★ `code` 空 = 这个颜色没有对应色号,是合法值(模型自己推的颜色多半没有)。
    out.push({ code: textOf(fieldOf(item, 'code')) ?? '', name, hex });
  }
  return out;
}

export class ProposeLookTool implements Tool {
  readonly definition = PROPOSE_LOOK;

  /**
   * `palette` / `features` / `shades` 三个必填端口,理由同前(缺了都是一次静默降级)。
   *
   * ★ `library` 与 `shadeCatalog` **成对**:同一份产品库的两个视图,组装根一处给出。
   * ⚠️ 两个都可选,因为"这个部署没有产品库"是合法形态;那时推荐产品的
   * `(pid, code)` **无从校验**——那是部署形态,不是模型写错了(见文件头)。
   *
   * ✏️ 2026-10-02 稍后:`shadeCatalog` 在本工具里**只当"配没配产品库"的那把尺子**
   *   (查色值仍走 `shades.hexOf`)。没有它,`hexOf` 在没配库的部署里一律回空串,
   *   于是**每一条推荐都会被当成查不到而丢掉**——那正是这个守卫要防的。
   */
  constructor(
    private readonly palette: SkinTonePalette,
    private readonly features: FeatureStrategies,
    private readonly shades: ShadeLookup,
    private readonly library?: ProductLibrary,
    private readonly shadeCatalog?: ShadeCatalog,
  ) {}

  /**
   * ★ 把 `tone` 的白名单收成**这一档肤色可用的色汇**(§6 规矩 4 的后半句:
   *   「合法取值空间本身按 skinTone 收窄」)。色域不再是"生成完再检查",
   *   模型在 schema 里根本选不到出界的那个色,这类打回就不存在了。
   * ⚠️ 肤色未知、或档位不在词表里(`toneKeysFor` 返回 `undefined`)⇒ 返回 `definition`
   *   原样(全量色相)。理由同 `run` 里那条:那是"还不知道",不是"不合法"。
   */
  definitionFor(session: Session): LlmToolDefinition {
    const skinTone = session.brief.skinTone;
    return proposeLookWithTones(skinTone ? this.palette.toneKeysFor(skinTone) : undefined);
  }

  async run(input: unknown, context: ToolContext): Promise<ToolOutcome> {
    const brief = context.session.brief;
    const { own, look } = splitInput(input);

    /**
     * 特征 id → 策略卡。**未知 id 直接剔掉**(同前端 `featureById` 返回 `null` 的行为):
     * 用户人设里存的 id 可能比后端词表旧,那是正常情况,不该让整份方案失败。
     * ⚠️ 顺序即 `brief.features` 的顺序——用户勾选的次序就是她想先看到的那几条。
     */
    const personalized: PlanPersonalized[] = (brief.features ?? [])
      .map((id) => this.features.byId(id))
      .filter((card): card is PlanPersonalized => card !== undefined);

    // ★ 一次性把能查的都查出来再一起打回:模型改一轮要花一个回合,
    //   分三次打回就是三个回合(同 `read_style_recipe` 那两条失败合成一条的理由)。
    const problems: string[] = [];

    const styleName = textOf(own['styleName']);
    if (styleName === undefined) {
      problems.push('缺少 `styleName`:这套妆叫什么(4–8 字,照用户的具体情况起一个)');
    }

    const styleId = textOf(own['styleId']);
    if (styleId !== undefined && !styleById(styleId)) {
      problems.push(
        `\`styleId\` 填了「${styleId}」,但没有这条配方。不参考配方就删掉这一格;` +
          `要参考就从这里面原样挑一个:${styleOptionsHint()}`,
      );
    }

    const steps = stepsOf(own['steps']);
    if (steps === undefined) {
      problems.push('`steps` 没给或写不成形状:它要是**至少一项**的数组,每一项都有非空的 `name` 与 `desc`');
    } else {
      const unknown = checkStepNames(steps.map((s) => s.name));
      if (unknown.length > 0) {
        problems.push(
          `这几步的名字认不出来:${unknown.join('、')}。认不出来的步骤**不会出图**;` +
            `步骤名要用这上面的词或它的变体(如「烟熏眼妆」):${stepVocabularyHint()}`,
        );
      }
    }

    const products = productsOf(own['products']);
    if (products === undefined) {
      problems.push('`products` 写不成形状:要么不给,要么是数组,每一项都有非空的 `name` 与 `pid`');
    }

    // ★ 模型直接给的颜色。⚠️ 这里**打回**、不是丢掉:色板少一块界面上看不出来,
    //   而这是它自己写错的,一个回合就能改对(同步骤名那条)。
    const palette = paletteOf(own['palette']);
    if (palette === undefined) {
      problems.push('`palette` 写不成形状:要么不给,要么是数组,每一项都有非空的 `name` 与 `hex`');
    } else {
      if (palette.length > MAX_PALETTE) {
        problems.push(
          `\`palette\` 给了 ${palette.length} 条,超过上限 ${MAX_PALETTE} 条 —— ` +
            '只留这套妆真用得上的那几个颜色。',
        );
      }
      const badHex = palette.filter((e) => !HEX_RE.test(e.hex ?? '')).map((e) => `${e.name}(${e.hex})`);
      if (badHex.length > 0) {
        problems.push(
          `\`palette\` 里这几条的 \`hex\` 不是色值:${badHex.join('、')}。` +
            '要形如 `#b03a3a` 的六位十六进制。',
        );
      }
    }

    if (
      problems.length > 0 ||
      styleName === undefined ||
      steps === undefined ||
      products === undefined ||
      palette === undefined
    ) {
      return reject(...problems);
    }

    // ★ 库里查不到的推荐**整条丢掉**(不是打回)。⚠️ 但丢掉的要回填给模型,见 `resolvableProducts`。
    const { kept: recommended, dropped: droppedProducts } = this.resolvableProducts(products);

    const summary = textOf(own['summary']);
    const draft: PlanDraft = composePlan({
      ...(styleId !== undefined ? { styleId } : {}),
      styleName,
      ...(summary !== undefined ? { summary } : {}),
      keywords: textsOf(own['keywords']),
      steps,
      products: recommended,
      // ★ 不给就由推荐产品推 —— 两者不混(见 `compose-plan.ts` 文件头)。
      ...(palette.length > 0 ? { palette } : {}),
      personalized,
    });

    // ★ 一个出图步都没有 ⇒ 打回。放它过去,`renderPlanOf` 会回落到「整脸」兜底那一张,
    //   而妆面单里那四个必填区与 `steps` 完全对不上:用户看到的是"讲了一套妆,出的图里没有"。
    if (requiredZonesOf(draft).length === 0) {
      return reject(
        '这套步骤里没有一步落在妆面区上(唇妆 / 腮红 / 眼影 / 遮瑕 / 修容 / 高光 / 卧蚕 / 眼线 / 睫毛)。' +
          '至少要写一步上妆步骤——只有护肤 / 妆前 / 防晒 / 定妆 / 底妆的话出不了图。',
      );
    }

    // ★ 成本闸:出图**按张计费**。⚠️ 今天算不出超过它的情况(每个区一张 + 底妆一张),
    //   留着是防静默涨价——谁给 `ZONE_ROLES` 加了区、或改了 `renderPlanOf` 的折法,这里先拦下来。
    const shots = renderCountOf(draft);
    if (shots > MAX_RENDER_SHOTS) {
      return reject(
        `这套步骤要出 ${shots} 张图,超过一次确认的上限 ${MAX_RENDER_SHOTS} 张。` +
          '把同一个区分成几步的写法并成一步,再调一次。',
      );
    }

    // ★ 两步:先纯推导出一份 `PlanDraft`,再补色值成 `PlanView`。
    //   **写进会话的是补完色值的那一份** —— 它是唯一会对外的形状(见 `plan-view.ts` 文件头)。
    const plan: PlanView = decoratePlan(draft, this.shades);

    let spec: LookSpec;
    try {
      // ★ **先有方案、再校验妆面单**:`requiredZonesOf(plan)` 就是「这套步骤该有哪些区」,
      //   妆面单必须与它**集合相等**(见 look-spec.validator.ts 的 ②c)。
      //   少了 ⇒ 某一步没有图;多了 ⇒ 提示词画出一套方案里没有的妆。
      spec = validateLookSpec(look, {
        skinTone: brief.skinTone,
        palette: this.palette,
        requiredZones: requiredZonesOf(plan),
      });
    } catch (err) {
      // 校验失败的 message 已经写成"带合法取值清单"的形状(见 look-spec.validator.ts),
      // 可以**原样**回填给模型——这就是把错误消息当 prompt 写的好处,这里不需要再加工。
      return reject(messageOf(err));
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

    // 妆面单上的场合要跟用户说的那个一致(理由见上面 `occasion` 那一段)。
    const consistent =
      spec.occasion === occasion ? spec : new LookSpecEntity({ ...spec, occasion });

    const session = setLookSpec(context.session, consistent, plan);
    return {
      content: [
        '已记下这套妆面:',
        describeLook(consistent),
        '',
        `并记下它的方案:「${plan.styleName}」,共 ${plan.meta.stepCount} 步。`,
        ...(plan.summary !== '' ? [plan.summary] : []),
        '',
        // ★ 这一块与 `read_style_recipe` 是**同一个渲染器**(见 `plan-guidance.ts` 文件头)。
        //   ⚠️ 不是"它自己刚写的所以不用印":这一份是**从会话里读回来的**,
        //   印出来才看得见 `(区)` 与色值这两样由服务端补上的东西。
        '你记下的步骤:',
        ...planGuidance(plan),
        ...(plan.products.length > 0
          ? ['', '你记下的推荐产品与色号(色板就是由它们拼出来的):', ...productGuidance(plan)]
          : []),
        // ★ 丢掉的那几条**必须说**:不说的话模型会在正文里照旧推荐它们,而 `/result` 上是空的。
        ...(droppedProducts.length > 0
          ? [
              '',
              `⚠️ 这几件产品库里没有,已从方案里略去,**不要向用户推荐它们**:${droppedProducts.join('、')}`,
            ]
          : []),
        '',
        '请把这段描述**讲给用户听**(用你自己的话,但内容要与之一致),并问她要不要调整。',
        '注意:这段描述就是用户在出图前唯一能看到的东西,不要添加它没说的效果承诺。',
      ].join('\n'),
      session,
    };
  }

  /**
   * 推荐产品里**库里查不到**的条目 —— **整条丢掉,不打回**。
   *
   * ★ 判据(用户 2026-10-02 拍的):**色号可以自己推理,库里有的才推荐,没有的就算了**。
   *   硬打回 = 一份顺手给的建议把整份方案连妆面一起作废,推荐产品没有那个权力。
   *   ⚠️ 丢掉不是"静默":`dropped` 会原样回填给模型(见 `run` 的回执),否则它会照旧在正文里推荐。
   *
   * ★ 没有产品库的部署(两个端口都没配)整条跳过:无从查,那是部署形态不是模型写错。
   * ★ `code` 为空的那几条只查 pid —— 那是"整件推荐",合法。
   */
  private resolvableProducts(products: readonly PlanProductDraft[]): {
    kept: PlanProductDraft[];
    dropped: string[];
  } {
    if (!this.library || !this.shadeCatalog) return { kept: [...products], dropped: [] };

    const kept: PlanProductDraft[] = [];
    const dropped: string[] = [];
    for (const p of products) {
      if (this.library.find(p.pid) === undefined) {
        dropped.push(`${p.name}(${p.pid})`);
        continue;
      }
      // ★ 色号对不上的**整条**丢,不回退成"只推荐这件产品":用户拿到的是一个买不到的色号,
      //   那比"没有推荐"更糟(§8-4 那类假承诺)。
      if (p.code !== '' && this.shades.hexOf(p.pid, p.code) === '') {
        dropped.push(`${p.name}(${p.pid})的色号「${p.code}」`);
        continue;
      }
      kept.push(p);
    }
    return { kept, dropped };
  }
}

function messageOf(err: unknown): string {
  return err instanceof AppError ? err.message : '妆面单不合法,但原因未知';
}

/** 打回。★ 每条失败都走这里,别的错误形状一律不许出现,理由见 `noLookNotice`。 */
function reject(...problems: readonly string[]): ToolOutcome {
  return { content: noLookNotice(...problems), isError: true };
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
 *   ★ 理由是**复数**:一次可以同时错几处,分条列出来模型才改得完。
 */
function noLookNotice(...problems: readonly string[]): string {
  return (
    '★ 这次**没有记下任何妆面**,也没有记下方案——你刚才那套不存在于会话里,' +
    '用户在界面上也看不到它。' +
    problems.map((p) => `\n  · ${p}`).join('') +
    '\n请按上面每一条修正后**再调用一次本工具**;' +
    '在它返回成功之前,不要用正文把一套妆面讲成已经定下来的。'
  );
}
