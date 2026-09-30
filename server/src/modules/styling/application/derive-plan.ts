/**
 * application/derive-plan.ts —— 把「风格 + 用户特征」展开成一份方案。
 *
 * ★ **纯函数、无 IO**：配方是静态内容，推导只是查表与拼装。
 *   所以「换风格」在后端这边同样是毫秒级的——⚠️ 但前端点一次要走**一个 agent 回合**
 *   （最长 90 秒），因为换风格要经 `propose_look` 重新定妆面单。这是有意的：
 *   方案与妆面单必须是**同一个决定**（见 `agent/domain/tools/definitions.ts` 的 `PROPOSE_LOOK`）。
 *
 * ★ **它产不出 hex**：配方里只有 `pid + code`，色值归前端 `kb/shades.js`。
 *   见 `domain/entities/style-recipes.ts` 的硬约定 2。
 *
 * ★ 行为契约（搬自前端 `vue/src/api/design.js`，**别"顺手优化"**）：
 *   · 步骤 id 是 `${style.id}-${两位下标}`；
 *   · `palette` **按 `code` 去重**（不是 `(pid, code)`）、最多 8 条、空项跳过；
 *   · `STEP_LOGIC` **首个命中的正则胜出**，顺序有意义。
 */
import { STYLE_LIBRARY, styleById } from '../domain/entities/style-recipes.js';
import type { StyleRecipe } from '../domain/entities/style-recipes.js';
import type {
  PlanPaletteEntry,
  PlanPersonalized,
  PlanStep,
  PlanStyleOption,
  PlanView,
} from './plan-view.js';

/**
 * `palette` 的条数上限。★ 与前端 `buildPalette` 的 `slice(0, 8)` 同值——
 * 这是一条**跨端契约**，改了这边不改那边，两端的色板块数就会不一样。
 */
const MAX_PALETTE = 8;

/**
 * 通用步骤逻辑 —— 来自《上妆步骤知识库》第十二章「补充说明」。
 * 按步骤名关键词匹配，命中后作为该步的注意事项展示。
 *
 * ★ **顺序有意义**：先命中的那条胜出。
 */
const STEP_LOGIC: readonly { readonly re: RegExp; readonly note: string }[] = [
  {
    re: /遮瑕/,
    note: '色彩性瑕疵（黑眼圈、泛红）在底妆前遮；结构性瑕疵（泪沟、法令纹）在底妆后遮，两个时机不可颠倒',
  },
  {
    re: /定妆/,
    note: '蜜粉负责控油定妆，喷雾负责保湿定妆与降低粉感，两者配合效果最好',
  },
  {
    re: /底妆/,
    note: '少量多次是核心，单侧脸用量不超过黄豆大小，避免成膜层叠加导致斑驳',
  },
  {
    re: /修容/,
    note: '修容不要超过眼尾，正面看才不会显脏；发际线与下颚线处的修容一定要晕染',
  },
  {
    re: /腮红/,
    note: '腮红可直接当眼影用，一套颜色做出 monochromatic look',
  },
  {
    re: /眼妆|眼影|睫毛|眉毛|眉眼|眼线|卧蚕/,
    note: '上完底妆先在眼皮上一层散粉，避免眼皮太黏没晕染开眼影',
  },
  {
    re: /唇妆|唇线|唇/,
    note: '涂唇膏前先用面纸轻按掉多余护唇膏油脂，否则会影响成膜与持色',
  },
  {
    re: /高光/,
    note: '微笑，用刷子在颧骨双起部位涂至太阳穴；鼻梁上修饰鼻型，唇弓处轻点放大唇部体积',
  },
  {
    re: /防晒|妆前/,
    note: '妆前乳若已带 SPF50，可不再单独叠加防晒；否则防晒要在妆前乳之后、底妆之前',
  },
];

function logicFor(name: string): string[] {
  const hit = STEP_LOGIC.find((l) => l.re.test(name));
  return hit ? [hit.note] : [];
}

/** 把配方展开成步骤。**顺序即配方的顺序，一步都不许在推导里补。** */
function buildSteps(style: StyleRecipe): PlanStep[] {
  return style.steps.map((t, i) => ({
    id: `${style.id}-${String(i + 1).padStart(2, '0')}`,
    name: t.name,
    desc: t.action,
    tips: logicFor(t.name),
    products: t.products.map((p) => ({ name: p.name, code: p.code, pid: p.pid })),
  }));
}

/**
 * 顶部色板由「本方案真的用到的色号」推导，保证色板与步骤永远一致（**不由配方手写**）。
 *
 * ⚠️ 跳过的是 `!pid || !code`；前端跳的是 `!hex || !code`。两者等价**当且仅当**
 *   配方里每一对非空的 `(pid, code)` 都能在 `shades.js` 里查到色值——
 *   `test/styling-plan.test.ts` 把这条当断言钉着。它一红就说明后端会多推一块
 *   **没有颜色的**色卡，而界面上没人看得出来（假开关）。
 */
function buildPalette(steps: readonly PlanStep[]): PlanPaletteEntry[] {
  const seen = new Set<string>();
  const out: PlanPaletteEntry[] = [];
  for (const step of steps) {
    for (const p of step.products) {
      if (!p.pid || !p.code) continue;
      if (seen.has(p.code)) continue;
      seen.add(p.code);
      // code 是色号，name 是出自哪个产品。
      out.push({ code: p.code, name: p.name });
    }
  }
  return out.slice(0, MAX_PALETTE);
}

function styleOptionOf(style: StyleRecipe): PlanStyleOption {
  return {
    id: style.id,
    name: style.name,
    family: style.family,
    summary: style.summary,
    stepCount: style.steps.length,
  };
}

/**
 * 展开一份方案。
 *
 * ★ `styleId` 必须是**认得的一条配方**——不认得就返回 `undefined`，
 *   由调用方翻成给模型的错误（列出全部可选，见 `propose_look`）。
 *   刻意**不回落**到第一条：那会让模型给错 id 时静默出一套它没选的妆，
 *   而用户是按模型说的那套去确认出图的。
 *
 * ✏️ **2026-09-30：入参里原来的 `occasion` 删了。** 它此前只做两件事——查候选池
 *   成员、取候选池——而候选池已经不按场合分了（见 `style-recipes.ts` 的 `styleById`）。
 *   留在签名里会变成一个**没人读的参数**，下一个改动的人会以为它在起作用。
 *
 * ★ `personalized` 由调用方**按顺序解析好**再传进来（未知 id 已剔掉）——
 *   本模块不认得 `face-catalog`，那是另一份内容目录的事（§7.1）。
 */
export function derivePlan(input: {
  styleId: string;
  personalized?: readonly PlanPersonalized[];
}): PlanView | undefined {
  const style = styleById(input.styleId);
  if (!style) return undefined;

  const steps = buildSteps(style);
  // ★ 「换一版」的候选池 = **同 `family` 的兄弟**（含自身），顺序即 `STYLE_LIBRARY` 的顺序。
  //   不再按场合取 4 条：风格与场合是**两张各自独立的预设表**，自由组合。
  const styleOptions = STYLE_LIBRARY.filter((s) => s.family === style.family).map(styleOptionOf);

  return {
    styleId: style.id,
    styleName: style.name,
    family: style.family,
    summary: style.summary,
    keywords: [...style.keywords],
    palette: buildPalette(steps),
    meta: { stepCount: steps.length, minutes: style.minutes, level: style.level },
    steps,
    personalized: [...(input.personalized ?? [])],
    styleOptions,
  };
}
