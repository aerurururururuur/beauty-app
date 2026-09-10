/**
 * domain/scene-rules.ts —— 场合语义的**单一源**,前后端共享。
 *
 * ★ 这是本项目**唯一**的跨端共享资产。前端经 vite alias `@scene-rules` 直接执行本文件
 *   (见 vue/vite.config.js 的 alias 与 server.fs.allow),所以两条硬规矩:
 *
 *   1. **禁止任何运行时 import / 顶层副作用**。只允许 `import type`——它会被编译期擦除,
 *      产物里什么都不剩。往这里加一句 `import fs from 'node:fs'`,前端构建会以很难懂的
 *      方式炸掉(而且 build 可能过得去、dev 才炸)。
 *   2. **改这里 = 同时改前后端行为**。浏览器 mock 模式与真实后端必须给出同一个答案,
 *      这正是本文件存在的理由(此前两边各抄了一份,会静默漂移)。
 *
 * 为什么放 `shared`:这些是**独立于上妆引擎**的场合语义,换任何引擎都成立;而
 * `shared/domain/entities/brief.ts` 本就是枚举单源的家。把 `OCCASIONS` 的每个取值连同
 * 它的中文名 / 方向 / 标签 / 关键词收在一处,加减场合时 `Record<Occasion, SceneStyle>`
 * 会把「漏配」变成**编译错误**。
 *
 * ★ 这里**不再有**一个 `understanding` 模块包着 `describeScene`(2026-09-10 删)。那个模块
 *   的全部内容是「一个 sleep + 一次转发 + 一个只能拨到 mock 的开关」,而它是全链路唯一
 *   假装在做模型推断的地方 —— 方向本来就是一个**纯查表**,索性让 `run-pipeline` 直接调。
 *   接视觉模型时再来建接缝(届时记得同时恢复一个 `off` 逃生门,那正是它当初唯一的用途)。
 */
import type { MakeupBrief, Occasion } from './entities/brief.js';

/** 一个场合的全部语义。 */
export interface SceneStyle {
  /** 中文名,如「面试」。文案里要给用户看,所以放这儿而不是各处再写一遍。 */
  cn: string;
  /** 妆容方向一句话,驱动结果页的「为什么这套」。 */
  direction: string;
  /** 场合自带的关键词标签,直接渲染成前端 chip。 */
  tags: string[];
  /** 自由文字里命中这些词 → 判为该场合。 */
  keywords: string[];
}

/**
 * 关键词命中时的**优先级**(tie-break):同一段文字命中多个场合时取靠前的。
 * 沿用最初手写关键词表的顺序 —— 它与 `OCCASIONS` 的枚举顺序**不同**,是刻意的:
 * 例如「上台约会」按此表判 `stage`,按枚举顺序会判 `date`。改这个数组等于改判定结果。
 */
export const SCENE_MATCH_ORDER: readonly Occasion[] = [
  'interview',
  'stage',
  'date',
  'family',
  'daily',
];

/** 场合语义表(单一源)。`Record<Occasion, …>` 保证漏配一个场合就编译不过。 */
export const SCENE_RULES: Record<Occasion, SceneStyle> = {
  interview: {
    cn: '面试',
    direction: '正式得体 · 哑光大地色,眉眼利落显精神',
    tags: ['正式', '哑光', '大地色', '利落'],
    keywords: ['面试', '终面', '求职', '复试'],
  },
  date: {
    cn: '约会',
    direction: '温柔提气色 · 粉调水光,亲和自然',
    tags: ['温柔', '粉调', '水光', '亲和'],
    keywords: ['约会', '相亲', '烛光'],
  },
  stage: {
    cn: '上台',
    direction: '上台醒目 · 哑光高显色,轮廓立体、镜头友好',
    tags: ['舞台', '高显色', '哑光', '立体'],
    keywords: ['上台', '演讲', '答辩', '路演', '主持', '汇报'],
  },
  family: {
    cn: '见家长',
    direction: '温婉得体 · 自然提气色,亲切耐看',
    tags: ['温婉', '自然', '提气色', '耐看'],
    keywords: ['见家长', '家长'],
  },
  daily: {
    cn: '日常',
    direction: '日常百搭 · 通透自然伪素颜',
    tags: ['日常', '通透', '伪素颜', '自然'],
    keywords: ['上班', '通勤', '日常', '开会', '客户'],
  },
};

/** 什么都没命中时的兜底:自然百搭,不把任意自定义文字硬塞进某类场合。 */
export const DEFAULT_OCCASION: Occasion = 'daily';

/**
 * 自由文字里的「修饰词」——在场合基准方向上再叠一层用户本人要的偏好。
 *
 * 这是修掉那个短路的关键:此前只要 `brief.occasion` 给了值,`sceneText` 就被整个丢掉,
 * 用户写满 2000 字对妆容方向零影响。现在两者**同时**生效:场合定基调,修饰词调一档。
 *
 * ★ 刻意**不收「显白」**:按真实肤色走、不默认浅肤色审美是红线 §13-3,
 *   「显白」正是那套话术。用户写它也不迎合 —— 不匹配就是设计行为,
 *   narration 里另有一句正面回应(「不为「显白」而牺牲素颜真实度」)。
 *   若将来有人想「顺手加上」,请先回去读红线。
 */
interface ModifierRule {
  keywords: string[];
  /** 追加到 `tags` 的标签。若场合基准的 tags 里已经有它,整条规则跳过(见下)。 */
  tag: string;
  /** 接在基准 `direction` 后面的半句(前面会自动补「按你的要求」)。 */
  suffix: string;
}

const MODIFIER_RULES: readonly ModifierRule[] = [
  {
    keywords: ['低调', '清淡', '清透', '淡一点', '裸妆', '素颜感', '不夸张'],
    tag: '低调',
    suffix: '再压低一档存在感',
  },
  {
    keywords: ['浓一点', '浓妆', '显色', '醒目', '气场', '夸张一点'],
    tag: '加浓',
    suffix: '把显色度提一档',
  },
  {
    keywords: ['专业', '干练', '利落', '稳重', '正式', '职场'],
    // 面试的基准 tags 本就有「利落」,命中时会因去重而不重复追加。
    tag: '利落',
    suffix: '更利落一些',
  },
  {
    keywords: ['温柔', '甜美', '亲和', '可爱', '柔和', '清新'],
    tag: '温柔',
    suffix: '再柔化一点',
  },
  {
    keywords: ['显气色', '气色', '元气', '精神', '有活力'],
    tag: '提气色',
    suffix: '把气色提上来',
  },
];

/**
 * 妆容方向 —— 全链路唯一的形状。
 *
 * 曾经有两份:这里的 `SceneDescriptor` 与 `understanding/domain/entities/scene.ts` 的
 * `SceneAnalysis`。后者存在的唯一理由是「shared 是地基,不能 import 业务模块的类型」;
 * 模块删掉后那个理由消失,两份并成一份。HTTP 里的 `JobView.scene` 就是这个形状。
 *
 * ★ 这里**曾经**还有一个 `source: string`(值恒为 `'mock'`,删模块前是 `'mock' | 'off'`)。
 *   和更早删掉的 `confidence` 同一个病:只有一个生产者、值恒定的字段,调用方读不出信息。
 *   它当初的用途是标记 `off`,而 `off` 保护的那个模型并不存在,一并删了。
 */
export interface SceneDescriptor {
  /** 判出来的场合。只有一个生产者了,所以是枚举而不是 string —— 这是实话。 */
  label: Occasion;
  direction: string;
  tags: string[];
}

/** 命中修饰词时 `direction` 的接法:基准方向 + 「;按你的要求…」。 */
function appendModifiers(base: string, suffixes: string[]): string {
  if (suffixes.length === 0) return base;
  return `${base};按你的要求${suffixes.join('、')}`;
}

/**
 * 把用户需求简报翻译成妆容方向 —— **纯函数**、无 IO、无计时。
 *
 * 后端由 `jobs/application/usecases/run-pipeline.ts` 直接调用(流水线的 `scene_understand`
 * 这一步就是它),前端浏览器 mock 模式直接调。所以这里的每一条判断,两侧行为完全一致。
 *
 * 判定顺序:显式 `occasion` → 自由文字命中关键词 → `daily` 兜底。
 * 之后**无论走哪条**都再叠一层修饰词。
 *
 * ★ 这里曾经返回过一个 `confidence: number`(2026-09-10 删)和一个恒定的 `source`。两者都是
 *   按分支硬写的常量、零消费者,拿它们做 UI 等于把常量包装成测量值。要接视觉模型时,
 *   分数才真的含有信息,那时再连同接缝一起加回来。
 */
export function describeScene(brief: MakeupBrief = {}): SceneDescriptor {
  const text = (brief.sceneText ?? '').toLowerCase();

  const label: Occasion =
    brief.occasion ??
    SCENE_MATCH_ORDER.find((o) => SCENE_RULES[o].keywords.some((k) => text.includes(k))) ??
    DEFAULT_OCCASION;

  const style = SCENE_RULES[label];
  const tags = [...style.tags];
  const suffixes: string[] = [];

  for (const rule of MODIFIER_RULES) {
    if (!rule.keywords.some((k) => text.includes(k))) continue;
    // 场合基准里已经有这个标签 → 用户要的这件事本来就已经做到了,不加标签也不加后缀。
    // 例:面试 + 「专业」不会再多一句「更利落一些」——面试妆本就以利落为基调。
    if (tags.includes(rule.tag)) continue;
    tags.push(rule.tag);
    suffixes.push(rule.suffix);
  }

  return {
    label,
    direction: appendModifiers(style.direction, suffixes),
    tags,
  };
}
