/**
 * application/step-zones.ts —— ★ **唯一**一张「配方步骤名 ↔ 妆面单区名」的对照表。
 *
 * 它住在 `agent`,因为只有本模块同时认识两侧:`styling` 认识步骤名但不许认识妆面单词汇,
 * `makeup` 不许依赖业务模块(§7.1)。
 *
 * 纯函数、无 IO。三件事都由它一处负责:步骤 → 区(`targetOfStepName`)、
 * 本套配方该有哪些区(`requiredZonesOf`)、这次确认要出几张图(`renderPlanOf`)。
 *
 * ⚠️ **配方里出现一个新步骤名时**:返回 `undefined` ⇒ 那一步**不出图**,页面不摆空块。
 *   所以 `test/step-zones.test.ts` 把全部配方跑一遍钉着这件事——名字漏了那里会红。
 */
import { ZONE_ROLES } from '../../makeup/index.js';
import type { RequiredZone, ZoneRole } from '../../makeup/index.js';
import type { PlanDraft } from '../../styling/index.js';

/**
 * 一个配方步骤落到的位置。
 * 后三个**不在** `ZONE_ROLES` 里,各有各的理由:
 *   · `base` 不是「区」:它只在**还没有任何区**时推进一张新图(`appliedZones` 还是空的
 *     那一张),跟在某个区后面时与上一张同款 ⇒ 折进上一张(见 `renderPlanOf`);
 *   · `brow` 只有浓度没有色相(`BrowSpec` 没有 `tone`),画不出自己的一张;
 *   · `none` = 护肤 / 妆前 / 防晒 / 定妆,这四步**不出图**(已拍板的口径)。
 */
export type StepTarget = ZoneRole | 'base' | 'brow' | 'none';

/**
 * 每个区认哪些步骤名。`Record<ZoneRole, …>` 保证加一个区就编译不过——
 * 漏一个区的后果是那一步**静默没有图**(本仓最恨的形状),所以不能用普通对象。
 */
const ZONE_PATTERNS: Record<ZoneRole, RegExp> = {
  lip: /唇/,
  cheek: /腮红/,
  eyeshadow: /眼妆|眼影/,
  concealer: /遮瑕/,
  contour: /修容/,
  highlight: /高光|提亮/,
  aegyoSal: /卧蚕/,
  liner: /眼线/,
  lash: /睫毛/,
};

/**
 * 首个命中的规则胜出(写法与 `styling/derive-plan.ts` 的 `STEP_LOGIC` 一致)。
 * 区那一批由 `ZONE_ROLES` 展开,不手抄——手抄就会有一天漏一个区。
 */
const STEP_TARGETS: readonly { readonly re: RegExp; readonly target: StepTarget }[] = [
  { re: /底妆/, target: 'base' },
  ...ZONE_ROLES.map((role) => ({ re: ZONE_PATTERNS[role], target: role as StepTarget })),
  // 眉必须排在区之后:「眉眼」这类名字同时也归眉,先让它落进哪个区都不对。
  { re: /眉/, target: 'brow' },
  { re: /护肤|妆前|防晒|定妆/, target: 'none' },
];

/** 步骤名 → 位置。不认得的名字返回 `undefined`(= 这一步不出图)。 */
export function targetOfStepName(name: string): StepTarget | undefined {
  return STEP_TARGETS.find((rule) => rule.re.test(name))?.target;
}

/**
 * 给模型看的**规范步骤名**,每个位置一个。★ 与 `ZONE_PATTERNS` 逐条对应,
 * 改了那边这里要跟着改(`test/step-zones.test.ts` 把每一条都过一遍 `targetOfStepName`)。
 * ⚠️ 这是**建议不是白名单**:`彩色睫毛` / `烟熏眼妆` 这类变体照旧通过(判据是正则)。
 */
export const STEP_VOCABULARY: readonly string[] = [
  '底妆', '遮瑕', '腮红', '眼影', '眼线', '睫毛', '唇妆', '修容', '高光', '卧蚕', '眉',
  '护肤', '妆前', '防晒', '定妆',
];

/** 不认识的那些步骤名。★ 空数组 = 全部认得。 */
export function checkStepNames(names: readonly string[]): string[] {
  return names.filter((name) => targetOfStepName(name) === undefined);
}

/**
 * 一次确认最多出几张图。★ **`base` 那一张要算进去**:配方以底妆开头时,
 *   它会和后面每个区各出一张 —— 上限是「每个区一张 + 底妆一张」。
 */
export const MAX_RENDER_SHOTS = ZONE_ROLES.length + 1;

/**
 * 一次确认要出的**一张图**。
 * ★ 不是「一个步骤一张」:同一个区在一套配方里出现两次时(两次遮瑕 / 两次眼妆),
 *   第二次**复用**上一张——措辞层只有色 / 质地 / 浓度,没有位置维度,
 *   再出一张会是一张一模一样的付费图。
 */
export interface PlannedRender {
  /** 触发这一张的那一步(形如 `natural-04`)。 */
  readonly stepId: string;
  /** 给日志与失败文案用。 */
  readonly stepName: string;
  /** 这一张**同时代表**哪几步(被折进来的那些,含触发那一步本身)。 */
  readonly stepIds: readonly string[];
  /**
   * 画到这一步为止画过哪些区。★ 与 `EngineInput.appliedZones` 是同一个集合。
   * ⚠️ **整个键缺席 = 一次画完整套**(没有方案时的「整脸」那一张);
   *   空数组不是这个意思——那是「除了底妆什么都不画」。
   */
  readonly appliedZones?: readonly ZoneRole[];
}

/** 没有可用配方时的兜底:**一张整脸**(方案不在,但照片与妆面都在)。 */
const WHOLE_LOOK: PlannedRender = {
  stepId: '',
  stepName: '整脸',
  stepIds: [],
  appliedZones: undefined,
};

/**
 * 这次要出的每一张图,顺序即配方顺序(第一张不一定是底妆——`bunny` / `commute`
 * 的第一个上妆步是遮瑕)。
 *
 * ★ 护肤 / 妆前 / 防晒 / 定妆**不出现在返回值里**,于是它们也不会出现在
 *   `stepRenders` 那张表里——前端因此不会给它们摆一个点下去没有结果的入口。
 * ★ `plan` 缺失、或一套配方一个上妆步都没有时,给 **1 张整脸**而不是 0 张:
 *   返回空数组会让「确认出图」变成一次静默的空操作。
 */
export function renderPlanOf(plan: PlanDraft | undefined): PlannedRender[] {
  if (!plan) return [WHOLE_LOOK];

  const out: { stepId: string; stepName: string; stepIds: string[]; appliedZones: ZoneRole[] }[] = [];
  let applied: ZoneRole[] = [];

  for (const step of plan.steps) {
    const target = targetOfStepName(step.name);
    if (target === undefined || target === 'none') continue;

    const zone: ZoneRole | undefined = target === 'base' || target === 'brow' ? undefined : target;
    // ★ 折进上一张的判据是**「画到哪儿了没变」**,不是「这一步重复了」:
    //   底妆与眉不带自己的区,一个区第二次出现也不推进集合 —— 这三种情况下
    //   提示词与上一张**逐字相同**(累积集合一样 ⇒ 条款一样),再出一张
    //   就是为同一张图付第二次钱。实测出来的:`bunny`/`wolf`/`smokey`/`commute`
    //   的第 2 张(底妆)此前正与第 1 张(遮瑕)完全同款。
    // ⚠️ 上一张不存在时(配方以底妆/眉/重复区开头)照旧自己出一张,不静默丢一步。
    const last = out.at(-1);
    if (last && (zone === undefined || applied.includes(zone))) {
      last.stepIds.push(step.id);
      continue;
    }

    if (zone !== undefined && !applied.includes(zone)) applied = [...applied, zone];
    out.push({ stepId: step.id, stepName: step.name, stepIds: [step.id], appliedZones: applied });
  }

  return out.length > 0 ? out : [WHOLE_LOOK];
}

/**
 * 本套配方该有哪些区(交给 `validateLookSpec` 判「妆面单与配方对不对得上」)。
 * 同一个区出现两次时**只报一次**,`stepName` 取第一次出现的那一步。
 */
export function requiredZonesOf(plan: PlanDraft): RequiredZone[] {
  const out = new Map<ZoneRole, string>();
  for (const step of plan.steps) {
    const target = targetOfStepName(step.name);
    if (target === undefined || target === 'base' || target === 'brow' || target === 'none') {
      continue;
    }
    if (!out.has(target)) out.set(target, step.name);
  }
  return [...out].map(([role, stepName]) => ({ role, stepName }));
}

/** 这一次确认会出几张图。★ 与 `renderPlanOf` 同源,别在别处再数一遍。 */
export function renderCountOf(plan: PlanDraft | undefined): number {
  return renderPlanOf(plan).length;
}
