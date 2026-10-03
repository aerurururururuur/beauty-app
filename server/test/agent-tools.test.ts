/**
 * 工具层单测:三个工具的行为 + 工具契约与实体常量的**同源性** + 系统提示的几条硬规则。
 *
 * 两个重点:
 *
 * ① **`definitions.ts` 的 JSON Schema 是手写的,而 `LookSpec` 是 zod。**
 *    枚举与上下界从实体常量取(那份有测试兜),**结构只能靠样例双向校验**——
 *    下面 `assertSchemaCoversSample` 走一遍 JSON Schema,`validateLookSpec` 走一遍 zod,
 *    两边都拿同一份样例;任何一边加了字段而另一边没跟上,必有一条挂。
 *    (仓库没有 zod→JSON Schema 的依赖,为这一处引一个包不划算,所以是这个形状。)
 *
 * ② **工具不抛错**(`tool.ts` 文件头第 1 条)。唯一例外是 `list_cabinet` 的存储故障,
 *    那是**故意**留给 `agent-loop` 的统一兜底,这里用测试把它钉住。
 */
import { describe, expect, it } from 'vitest';
import {
  ADDED_ZONE_ROLES,
  BROW_SHAPES,
  BrowSpec,
  DEPTHS,
  SATURATIONS,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  LookSpec,
  LookSpecBase,
  TONE_KEYS,
  ZoneSpec,
  describeLook,
  validateLookSpec,
} from '../src/modules/makeup/index.js';
import type { AddedZoneRole, SkinTonePalette, ZoneRole } from '../src/modules/makeup/index.js';
import { MAX_PALETTE, derivePlan } from '../src/modules/styling/index.js';
// ★ 深一层 import:`step-zones` 是 agent 模块内部的实现(不是对外 API),
//   但它的对照表是这批测试要钉的对象之一(见 `zonesFor`)。
import { requiredZonesOf, targetOfStepName } from '../src/modules/agent/application/step-zones.js';
import { realFeatures, realPalette } from './helpers/face-catalog.js';
import { realHexOf, realShades } from './helpers/product-content.js';
import {
  MAX_OCCASION,
  MAX_SCENE_TEXT,
  MAX_STYLE_TEXT,
  SKIN_TONES,
  SKIN_TYPES,
} from '../src/modules/shared/index.js';
import type { SkinTone } from '../src/modules/shared/index.js';
import {
  LIST_PRODUCTS,
  ListCabinetTool,
  ListProductsTool,
  Message,
  PatchBriefTool,
  ProposeLookTool,
  PROPOSE_LOOK,
  READ_PRODUCT,
  READ_STYLE_RECIPE,
  RENDER_LOOK,
  ReadProductTool,
  ReadStyleRecipeTool,
  RenderRecord,
  Session,
  STYLE_OPTIONS_HEAD,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
  buildSystemPrompt,
  createSession,
  createToolRegistry,
  describeBrief,
  describeLookState,
  describeRenderState,
  describeStyleOptions,
  proposeLookWithTones,
  stepVocabularyHint,
} from '../src/modules/agent/index.js';
import type {
  CabinetItemSnapshot,
  CosmeticReader,
  LlmToolDefinition,
  ProductDetailSnapshot,
  ProductLibrary,
  ProductLibraryOverview,
  ShadeCatalog,
  ShadeOffer,
  ToolOutcome,
} from '../src/modules/agent/index.js';

/**
 * 组装根那道缝的测试版:`FaceVocabulary` → `SkinTonePalette`。
 * ★ **真词表**(`helpers/face-catalog.ts`),不是假表 —— 收窄是这条链路上唯一有
 *   "内容依据"的判断,拿假表测它,测到的只是假表自洽。词表本身的合规另有 `face-catalog.test.ts` 盯着。
 */
const palette: SkinTonePalette = realPalette();

// ── 样例与替身 ───────────────────────────────────────────────────────────────

/** 一份合法的妆面单,同时喂给 zod 与 JSON Schema 两边。 */
const SAMPLE_LOOK = new LookSpec({
  occasion: 'interview',
  base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
  zones: {
    lip: new ZoneSpec({ tone: 'rose', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
    cheek: new ZoneSpec({ tone: 'coral', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    eyeshadow: new ZoneSpec({ tone: 'nude', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
    brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
  },
});

/**
 * 六个可选区随便配的值。
 * ★ `Record<AddedZoneRole, …>` 是刻意的:加一个区就编译不过,而不是那份样例
 *   静默少一个区(于是"手写的那份形状漏了一个区"这条再也没人查)。
 */
const ADDED_ZONE_LOOK: Record<AddedZoneRole, ZoneSpec> = {
  concealer: new ZoneSpec({ tone: 'peach', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
  contour: new ZoneSpec({ tone: 'brick', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
  highlight: new ZoneSpec({ tone: 'nude', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
  aegyoSal: new ZoneSpec({ tone: 'peach', depth: 'medium', saturation: 'medium', finish: 'satin', intensity: 2 }),
  liner: new ZoneSpec({ tone: 'plum', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
  lash: new ZoneSpec({ tone: 'plum', depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 }),
};

/**
 * 某条配方该有的区 → 一份**合法**的 `zones`。
 *
 * ★ ✏️ 2026-10-01:`validateLookSpec` 起会拿妆面单与配方的区**比集合**,所以样例
 *   不能写死一套区了(`coolclean` 有睫毛那一步、`flowers` 连腮红那一步都没有)。
 *   这里照 `requiredZonesOf` **现算成员**,不手抄一张表 —— 手抄的表会在配方改动时
 *   静默过期,而那时看起来像"propose_look 坏了",不像"样例该更新了"。
 *   ⚠️ 色 / 质地 / 浓度是随便填的:它们不参与这条判据(那是 `describeLook` 的事)。
 */
function zonesFor(styleId: string): LookSpec['zones'] {
  const plan = derivePlan({ styleId });
  const needed = new Set<ZoneRole>(plan ? requiredZonesOf(plan).map((z) => z.role) : []);
  const optional: Partial<Record<AddedZoneRole, ZoneSpec>> = {};
  for (const role of ADDED_ZONE_ROLES) {
    if (needed.has(role)) optional[role] = ADDED_ZONE_LOOK[role];
  }
  return { ...SAMPLE_LOOK.zones, ...optional };
}

/** 一份妆面单(**不含 `styleId` / `steps` / `products`** —— `lookSpecSchema` 是 `.strict()`,多一格整份被打回)。 */
function lookFor(styleId: string): Record<string, unknown> {
  return { occasion: SAMPLE_LOOK.occasion, base: SAMPLE_LOOK.base, zones: zonesFor(styleId) };
}

/**
 * 调 `propose_look` 时发出去的那份入参:妆面单 + **模型自己写的步骤** + 参考的那条配方。
 *
 * ★ ✏️ 2026-10-02:`steps` 现在是**必填**,而它此前正是配方展开出来的东西 ——
 *   所以这里照 `derivePlan` 把配方的步骤抄一遍当"模型写的步骤"(`demo-llm.ts`
 *   的 `proposeInputOf` 同形)。⚠️ 它意味着一件事:**本文件里绝大多数用例
 *   用的仍是一条配方的步骤**,于是"步骤由模型自撰"这件事本身要看
 *   「记下的步骤是模型自己写的那几步」那一条。
 */
function lookInput(styleId: string): Record<string, unknown> {
  const plan = derivePlan({ styleId })!;
  return {
    ...lookFor(styleId),
    styleId,
    styleName: plan.styleName,
    summary: plan.summary,
    keywords: plan.keywords,
    steps: plan.steps.map((s) => ({ name: s.name, desc: s.desc })),
    products: plan.products.map((p) => ({ name: p.name, pid: p.pid, code: p.code })),
  };
}

/** 同一份,只把唇色换成另一个 —— 色域那几条用例就是靠它把一份合法妆面改坏的。 */
function withLip(tone: string): Record<string, unknown> {
  return {
    ...lookInput(PLAIN_STYLE),
    zones: {
      ...zonesFor(PLAIN_STYLE),
      lip: { tone, depth: 'medium', saturation: 'medium', finish: 'matte', intensity: 3 },
    },
  };
}

/**
 * 只含实测那三个区的妆面单对应的配方(`vital` / `early8` / `rococo` 都是这一档)。
 * ★ 多数用例用它,因为它们检查的是**别的**东西(色域、场合、自由文本),
 *   不需要六个新区来凑热闹。
 */
const PLAIN_STYLE = 'vital';

/**
 * 结构核对要走的配方清单。★ 挑的是"六个新区**一个不落**地各出现过至少一次"的那几条
 *   (`concealer`/`contour` 在 coolclean、`highlight` 在 natural、`aegyoSal` 在 rich、
 *   `liner` 在 festival、`lash` 在 butterfly),外加 `vital` 那一档做对照。
 */
const SAMPLED_STYLES = ['vital', 'coolclean', 'natural', 'rich', 'festival', 'butterfly'];

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: unknown[];
  /** 只在钉住"这句 description 该怎么写"时才断言(见 `tone` 那条)。 */
  description?: string;
}

/**
 * 样例 → JSON Schema 的结构核对(单向,见文件头 ①)。
 * 只走样例里**存在**的键:某一侧多出的**可选**字段拦不住,那要靠人看,
 * 但"多了个必填字段"和"字段改名/删字段"这两类必被抓到。
 */
function assertSchemaCoversSample(schema: JsonSchema, sample: unknown, path: string): void {
  if (schema.type === 'object') {
    const obj = sample as Record<string, unknown>;
    const props = schema.properties ?? {};
    const keys = Object.keys(obj);

    for (const key of keys) {
      expect(Object.keys(props), `${path} 的 JSON Schema 里没有字段「${key}」`).toContain(key);
    }
    for (const key of schema.required ?? []) {
      expect(keys, `${path} 的样例缺了必填字段「${key}」`).toContain(key);
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) assertSchemaCoversSample(sub, obj[key], `${path}.${key}`);
    }
    return;
  }
  if (schema.enum) {
    expect(schema.enum, `${path} 的取值「${String(sample)}」不在 enum 里`).toContain(sample);
  }
}

class FakeCosmeticReader implements CosmeticReader {
  readonly asked: string[] = [];
  constructor(private readonly items: readonly CabinetItemSnapshot[] = []) {}
  async listByUser(userId: string): Promise<CabinetItemSnapshot[]> {
    this.asked.push(userId);
    return [...this.items];
  }
}

class FailingCosmeticReader implements CosmeticReader {
  async listByUser(): Promise<CabinetItemSnapshot[]> {
    throw new Error('衣橱文件读坏了');
  }
}

/**
 * 假产品库。★ 按仓库惯例**就地定义在这个文件里**,不进 `test/helpers/fakes.ts`
 * (那个文件专门注释过为什么不复用通用假件:各模块的假件形状随端口变,
 * 收拢到一个文件只会让每加一个端口都得去动它)。
 *
 * 形状刻意做小:**只放断言用得上的那几条**,不照抄真实库。
 * 真库的形状由 `products` 模块自己的测试兜,这里要测的是**工具怎么用它**。
 */
class FakeProductLibrary implements ProductLibrary {
  readonly asked: string[] = [];
  readonly overviewCalls = { n: 0 };

  constructor(private readonly details: Record<string, ProductDetailSnapshot> = {}) {}

  overview(): ProductLibraryOverview {
    this.overviewCalls.n += 1;
    return {
      name: '测试库',
      brand: '测试牌',
      categories: [{ label: '唇部彩妆', count: 1, lookSpecSlots: ['zones.lip'] }],
      matchingGuide: {
        columns: ['天气/场景条件', '首选底妆', '避开品类'],
        rows: [{ condition: '高温高湿', cells: ['轻薄水感', '厚重膏状'] }],
      },
      notes: [{ label: '含酸提醒', text: '含酸产品建议夜间使用。' }],
      products: [
        {
          id: '42-rouge',
          name: '某细管口红',
          categoryLabel: '唇部彩妆',
          series: '细管系列',
          lookSpecSlots: ['zones.lip'],
          textureFirst: '哑光质地。',
          skinTypesFirst: '所有肤质。',
          occasionsFirst: '日常通勤。',
        },
      ],
    };
  }

  find(id: string): ProductDetailSnapshot | undefined {
    this.asked.push(id);
    return this.details[id];
  }
}

/** 一条正常详情(六维度里给两条就够断言,缺的不出现是刻意的)。 */
const SAMPLE_DETAIL: ProductDetailSnapshot = {
  id: '42-rouge',
  name: '某细管口红',
  categoryLabel: '唇部彩妆',
  series: '细管系列',
  lookSpecSlots: ['zones.lip'],
  facts: [
    { label: '质地/妆效', text: '哑光,显色度高。' },
    { label: '社交平台用户反馈摘要', text: '用户提到「显白不拔干」。' },
  ],
};

const fakeLibrary = (): FakeProductLibrary =>
  new FakeProductLibrary({ '42-rouge': SAMPLE_DETAIL });

/**
 * 与上面那个假库**配对**的色号词表(色号 → 色值那两半)。
 * ★ 两个必须**自洽**:`shadesOf` 说有的那个 code,`fakeHexOf` 就得查得出色值 ——
 *   漂开的话用例会以"工具报错"的形状红,看不出是假件自己不对。
 * ⚠️ 只用在**边界那几条**(查得到 / 查不到);别处的色值一律用仓库里那份真库
 *   (`realHexOf`),理由见 `realHexOf` 的文件头。
 */
const FAKE_SHADES: Record<string, ShadeOffer[]> = {
  '42-rouge': [{ code: '01', name: '正红', hex: '#b03a3a' }],
};
const fakeShadeCatalog = (): ShadeCatalog => ({ shadesOf: (pid) => FAKE_SHADES[pid] ?? [] });
const fakeHexOf = (pid: string, code: string): string =>
  FAKE_SHADES[pid]?.find((s) => s.code === code)?.hex ?? '';

const session = (over: Partial<Session> = {}): Session =>
  new Session({ ...createSession('s1', 'u1'), ...over });

async function run(tool: { run(i: unknown, c: { session: Session }): Promise<ToolOutcome> }, input: unknown, s: Session) {
  return tool.run(input, { session: s });
}

// ── ① 工具契约与实体同源 ─────────────────────────────────────────────────────

describe('工具契约', () => {
  it('★ 工具全集就这几个,名字与常量一致(加工具必挂——这正是它存在的意义)', () => {
    // 2026-09-16 从 4 变 6:接入产品库加了 list_products / read_product。
    // 2026-10-01 从 6 变 7:加了 read_style_recipe(`propose_look` 填 zones 前先读配方)。
    // 两次破例的边界都写在 `definitions.ts` 的文件头,别让它悄悄扩大。
    expect(TOOL_DEFINITIONS.map((d) => d.name)).toEqual([
      TOOL_NAMES.patchBrief,
      TOOL_NAMES.readStyleRecipe,
      TOOL_NAMES.proposeLook,
      TOOL_NAMES.listCabinet,
      TOOL_NAMES.listProducts,
      TOOL_NAMES.readProduct,
      TOOL_NAMES.renderLook,
    ]);
  });

  it('★ 注册表是白名单:没配产品库时那两个工具**不在名单里**(不是"在但返回空")', async () => {
    // "假开关"与"真没有"的区别就在这条断言上:模型看不到它们,所以连想都不会想。
    const base = {
      cosmetics: new FakeCosmeticReader(),
      engine: { generate: async () => ({}) } as never,
      artifacts: {} as never,
      palette,
      features: realFeatures(),
      // ★ 色值用仓库里那份真产品库(与组装根同一条缝),不是空串替身 ——
      //   拿空串凑的话,这里测到的是"没色块的方案",而生产跑的不是那个。
      shades: { hexOf: realHexOf },
    };
    const without = createToolRegistry(base);
    expect([...without.keys()]).toEqual([
      TOOL_NAMES.patchBrief,
      TOOL_NAMES.readStyleRecipe,
      TOOL_NAMES.proposeLook,
      TOOL_NAMES.listCabinet,
      TOOL_NAMES.renderLook,
    ]);

    const withProducts = createToolRegistry({
      ...base,
      products: fakeLibrary(),
      shadeCatalog: realShades(),
    });
    expect([...withProducts.keys()]).toContain(TOOL_NAMES.listProducts);
    expect([...withProducts.keys()]).toContain(TOOL_NAMES.readProduct);

    // ★ 2026-10-02:那两个是**一对**,只给一半不算配了产品库 ——
    //   半配的部署里"读得成产品、印不出色号"是没有意义的中间态(见 `registry.ts` 的判据)。
    const half = createToolRegistry({ ...base, products: fakeLibrary() });
    expect([...half.keys()]).toEqual([...without.keys()]);
  });

  it('枚举与上下界**没有一个手抄**,全部与实体常量同源', () => {
    const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;
    const props = propose.inputSchema as JsonSchema;
    const zones = props.properties?.zones?.properties ?? {};

    expect(zones.lip?.properties?.tone?.enum).toEqual([...TONE_KEYS]);
    expect(zones.lip?.properties?.depth?.enum).toEqual([...DEPTHS]);
    expect(zones.lip?.properties?.saturation?.enum).toEqual([...SATURATIONS]);
    expect(zones.lip?.properties?.finish?.enum).toEqual([...FINISHES]);
    expect(zones.lip?.properties?.intensity).toMatchObject({
      minimum: INTENSITY_MIN,
      maximum: INTENSITY_MAX,
    });

    const brief = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.patchBrief)!;
    const briefProps = brief.inputSchema as JsonSchema;
    expect((briefProps.properties?.skinTone as JsonSchema).enum).toEqual([...SKIN_TONES]);
    expect((briefProps.properties?.skinType as JsonSchema).enum).toEqual([...SKIN_TYPES]);
    // patch_brief 的面里**没有 weather**(§7.2:天气不是问出来的)。
    expect(Object.keys(briefProps.properties ?? {})).not.toContain('weather');
  });

  /**
   * ★★ `tone` 的合法集**按肤色变**(`proposeLookWithTones`),所以那句 `description`
   *   里**一个具体色名都不许出现** —— 举了 `peach`,橄榄皮那一档就是个
   *   "schema 报了一个校验器会拒的值"的假菜单(`v16` 记的正是这个坑,白花一个回合)。
   *   ★ 判据(挑饱和度最低的)可以说,能选哪些由 `enum` 自己说。
   */
  it('★ `tone` 的 description 里不许出现具体色名(合法集按肤色变)', () => {
    const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;
    const lip = (propose.inputSchema as JsonSchema).properties?.zones?.properties?.lip;
    const desc = lip?.properties?.tone?.description ?? '';

    for (const tone of TONE_KEYS) {
      expect(desc, `tone 的 description 里出现了色名「${tone}」`).not.toContain(tone);
    }
    // 反过来:`depth` / `saturation` 的合法集与肤色无关,提它们的取值是安全的、
    // 也是这两版真正要说的。
    expect(lip?.properties?.depth?.description).toContain('light');
    expect(lip?.properties?.saturation?.description).toContain('low');
  });

  it('★★ 两个 `occasion` 都不再是枚举 —— 这条钉的是"没人把它改回去"', () => {
    // ★ 2026-09-30 翻向:这一格此前**正是** `toEqual([...OCCASIONS])`(见补丁说明)。
    //   留在 schema 里的 `enum` 不只是多余的 —— 它**会**让模型把用户说的
    //   「朋友的婚礼」收敛回 8 档之一,而用户要的恰恰是原话一路走到底。
    const defOf = (name: string) => TOOL_DEFINITIONS.find((d) => d.name === name)!;
    const propOf = (name: string, key: string) =>
      (defOf(name).inputSchema as JsonSchema).properties?.[key] as JsonSchema;

    expect(propOf(TOOL_NAMES.proposeLook, 'occasion').enum).toBeUndefined();
    expect(propOf(TOOL_NAMES.patchBrief, 'occasion').enum).toBeUndefined();
    // ⚠️ `styleId` 不写 `enum` 是**另一条**理由(取值要带中文名,`enum` 只能列裸值,
    //   见 `definitions.ts` 那一格)—— 但同样是宽 string,一并钉住。
    expect(propOf(TOOL_NAMES.proposeLook, 'styleId').enum).toBeUndefined();
  });

  it('手写的 JSON Schema 结构与 zod 的 LookSpec 对得上(样例双向校验)', () => {
    const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;

    // 一侧:JSON Schema 认**工具入参**那份样例(它比妆面单多一格 `styleId`)。
    // ★ ✏️ 2026-10-01 **逐条配方各走一遍**:六个新区分散在不同配方里
    //   (`concealer`/`contour` 在 coolclean、`liner` 在 festival、`lash` 在 butterfly…),
    //   一份样例最多只带其中几个,而"手写的那份形状漏了某个区"正是这条要抓的。
    for (const styleId of SAMPLED_STYLES) {
      assertSchemaCoversSample(propose.inputSchema as JsonSchema, lookInput(styleId), '$');
    }

    // 另一侧:zod 认**妆面单**那份(不传 `skinTone` ⇒ 不收窄,只看形状)。
    // ⚠️ 两份样例在这里**故意不同**:`LookSpec` 里没有 `styleId`,而工具入参里它是必填。
    for (const styleId of SAMPLED_STYLES) {
      const plan = derivePlan({ styleId })!;
      expect(() =>
        validateLookSpec(lookFor(styleId), {
          palette,
          requiredZones: requiredZonesOf(plan),
        }),
      ).not.toThrow();
    }
  });
});

// ── A2:`propose_look` 的 `tone` 白名单按肤色收窄 ─────────────────────────────

/**
 * ★★ 起因是 v16 那次实测:提示词里印了「该肤色可用色」那一行**也不够**——
 *   同一档(橄榄皮)开场那一轮三次真调用,色相仍被打回 2 次,两次都是 `highlight`
 *   填了 `peach`。模型填参数时读的是**工具 schema 的 `enum`**(那里 7 个色一个不少),
 *   不是那段话。所以把 `enum` 本身按肤色收窄(§6 规矩 4 的后半句:
 *   「合法取值空间本身按 skinTone 收窄,而不是生成完再检查」)—— 选都选不了,就没得打回。
 */
describe('propose_look 的 tone 白名单按肤色收窄', () => {
  const p = realPalette();

  /** 一份契约里某个区的 `tone` 白名单。 */
  const tonesOf = (def: LlmToolDefinition, role: string): unknown =>
    (def.inputSchema as JsonSchema).properties?.zones?.properties?.[role]?.properties?.tone?.enum;

  /** 带 `tone` 那一格的区:`brow`(眉形 + 浓度)不在其中,六个可选区都在。 */
  const TONED_ROLES = [
    'lip',
    'cheek',
    'eyeshadow',
    'concealer',
    'contour',
    'highlight',
    'aegyoSal',
    'liner',
    'lash',
  ];

  it('已知肤色 → 每个区的 tone 白名单就是那一档的色汇', () => {
    const olive = p.toneKeysFor('olive')!;
    const def = proposeLookWithTones(olive);

    for (const role of TONED_ROLES) expect(tonesOf(def, role)).toEqual([...olive]);
    // 橄榄皮那档恰好不含 peach —— 实测里被打回两次的就是它。
    expect(tonesOf(def, 'highlight')).not.toContain('peach');
  });

  it('`brow` 没有 tone 那一格,不被波及', () => {
    const def = proposeLookWithTones(p.toneKeysFor('olive')!) as LlmToolDefinition;
    const brow = (def.inputSchema as JsonSchema).properties?.zones?.properties?.brow;
    expect(tonesOf(def, 'brow')).toBeUndefined();
    expect(brow?.properties?.shape?.enum).toEqual([...BROW_SHAPES]);
  });

  it('★ 只动 tone:同区的 depth / saturation / finish / intensity 与 `zones.required` 原样', () => {
    const def = proposeLookWithTones(p.toneKeysFor('olive')!) as LlmToolDefinition;
    const zones = (def.inputSchema as JsonSchema).properties?.zones;
    // ★ depth / saturation **都不按肤色收窄**(一个管明度、一个管饱和,都不是"肤色的合法性")
    //   —— 收窄时不许被连带改掉。
    expect(zones?.properties?.lip?.properties?.depth?.enum).toEqual([...DEPTHS]);
    expect(zones?.properties?.lip?.properties?.saturation?.enum).toEqual([...SATURATIONS]);
    expect(zones?.properties?.lip?.properties?.finish?.enum).toEqual([...FINISHES]);
    expect(zones?.properties?.lip?.properties?.intensity).toMatchObject({
      minimum: INTENSITY_MIN,
      maximum: INTENSITY_MAX,
    });
    expect(zones?.required).toEqual(['lip', 'cheek', 'eyeshadow', 'brow']);
  });

  /**
   * ★★ 这条防的是实现方式:那九个区是 `{ ...zoneSchema }` 的**浅拷贝**,
   *   它们的 `properties` 是**同一个对象**——就地改一处会连带改掉另外八个
   *   以及模块级的 `zoneSchema` 自己(于是收窄过一次之后,`patch_brief` 那类
   *   与肤色无关的工具、乃至下一个会话,看到的都是上一档的色汇)。
   */
  it('★★ 产出的是新的一份,原 `PROPOSE_LOOK` 一个字不变', () => {
    proposeLookWithTones(p.toneKeysFor('olive')!);

    expect(tonesOf(PROPOSE_LOOK, 'lip')).toEqual([...TONE_KEYS]);
    expect(tonesOf(PROPOSE_LOOK, 'highlight')).toEqual([...TONE_KEYS]);
    // 再收窄一次到**另一档**,前一份也不能被改到。
    const light = proposeLookWithTones(p.toneKeysFor('cool_porcelain')!) as LlmToolDefinition;
    proposeLookWithTones(p.toneKeysFor('deep_brown')!);
    expect(tonesOf(light, 'lip')).toEqual([...p.toneKeysFor('cool_porcelain')!]);
  });

  it('肤色未知 / 档位不在词表 → 原样全量色相("还不知道",不是"不合法")', () => {
    for (const tones of [undefined, [] as string[], p.toneKeysFor('没这一档')]) {
      expect(tonesOf(proposeLookWithTones(tones), 'lip')).toEqual([...TONE_KEYS]);
    }
  });

  // ★ 与 v16 那一行同一条判据:取的是**词表**那一份。两档必须收出不同的结果,
  //   否则"抄了一张写死的色表"也能让上面几条全绿。
  it('★★ `definitionFor` 读的是**会话里**这份肤色,且逐档不同', () => {
    const tool = new ProposeLookTool(p, realFeatures(), { hexOf: realHexOf });
    const of = (skinTone: SkinTone) =>
      tonesOf(tool.definitionFor(session({ brief: { skinTone } })), 'lip');

    expect(of('olive')).toEqual([...p.toneKeysFor('olive')!]);
    expect(of('cool_porcelain')).toEqual([...p.toneKeysFor('cool_porcelain')!]);
    expect(of('olive')).not.toEqual(of('cool_porcelain'));
    // 还没问出肤色 ⇒ 不收窄,还是全量色相(与 `run` 里那条判据同一个出口)。
    expect(tonesOf(tool.definitionFor(session()), 'lip')).toEqual([...TONE_KEYS]);
  });
});

// ── patch_brief ─────────────────────────────────────────────────────────────

describe('patch_brief', () => {
  const tool = new PatchBriefTool();

  it('记下并回显当前已知需求', async () => {
    const out = await run(tool, { occasion: 'interview', skinTone: 'deep_brown' }, session());

    expect(out.session?.brief).toEqual({ occasion: 'interview', skinTone: 'deep_brown' });
    expect(out.content).toContain('场合=interview');
    // ★ 写全 id,不写 `'肤色深浅=deep'` —— 那样写成前缀匹配,'deep_brown' / 'deep_xxx'
    //   都会被它放过去,断言会变成一条永远为真的装饰。
    expect(out.content).toContain('肤色深浅=deep_brown');
    expect(out.isError).toBeUndefined();
  });

  it('清洗:字符串 trim', async () => {
    const out = await run(tool, { dress: '  西装 · 藏青  ' }, session());
    expect(out.session?.brief.dress).toBe('西装 · 藏青');
  });

  it('★★ 空串视同没给,不覆盖旧值(部分更新不能静默清掉用户说过的话)', async () => {
    const before = session({ brief: { dress: '西装 · 藏青' } });
    const out = await run(tool, { dress: '   ' }, before);

    expect(out.session).toBeUndefined();
    expect(out.isError).toBe(true);
    expect(out.content).toContain('西装 · 藏青');
  });

  it('空调用标成 isError —— 否则模型以为记下了,而用户刚说的信息就丢了', async () => {
    const out = await run(tool, {}, session());
    expect(out.isError).toBe(true);
    expect(out.content).toContain('什么都没改');
  });

  it('不认识的字段 / 猜出来的字段一律打回', async () => {
    expect((await run(tool, { weather: { condition: '晴' } }, session())).isError).toBe(true);
    expect((await run(tool, { skinTone: 'very_deep' }, session())).isError).toBe(true);
  });

  it('★ 取值非法 / 超长一律打回,且**会话一个字没动**(§4.2 后规则在 validator)', async () => {
    // ★ 这两条此前是**裸奔**的。形状层的 `z.enum` / `.max()` 一按 §4.2 降成纯形状,
    //   `occasion` 与 `sceneText` 就再没有第二道网 —— 非法值会**静默写进会话 brief**,
    //   一路带到最后出图那一步才在**别的地方**炸掉。
    //   那正是 spec §14-08「某个校验规则只在一个入口生效」那一格。
    //   (`skinTone: 'very_deep'` 上面那条碰巧覆盖到了肤色,occasion 与长度没有。)
    // ✏️ 2026-09-30:这里原本还有一条 `{ occasion: 'snow' }`(表外的场合被拒)。
    //   场合松绑后它**整个反过来**了 —— 现在是超长才该被打回,见下一条。
    const cases: Array<[unknown, string]> = [
      // 报错就是 prompt:模型得知道"能填什么 / 上限是多少",否则只能换个词再猜一轮。
      [{ occasion: 'a'.repeat(MAX_OCCASION + 1) }, `最多 ${MAX_OCCASION} 字`],
      [{ styleText: 'a'.repeat(MAX_STYLE_TEXT + 1) }, `最多 ${MAX_STYLE_TEXT} 字`],
      [{ sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) }, `最多 ${MAX_SCENE_TEXT} 字`],
    ];
    for (const [bad, fragment] of cases) {
      const out = await run(tool, bad, session());
      expect(out.isError).toBe(true);
      // ★ 断言"没记下"才是这条测试的**要害**:isError 只说明报了错,
      //   而真正的损害是"报了错却又写进去了"。
      expect(out.session).toBeUndefined();
      expect(out.content).toContain(fragment);
    }
  });

  it('★★ 表外的场合**收下**(原话进会话,不收进最近的一档)', async () => {
    // 用户否掉的正是"把它收进 8 桶之一"这个做法:一收,用户的原话就到不了出图提示词。
    // ⚠️ 这条与上面那条是**一对**:那边测"超长要拦",这边测"合长度但表外要放行"——
    //   只留一边的话,松绑成"什么都不拦"或"照旧收窄"都能骗过测试。
    for (const occasion of ['朋友的婚礼', '毕业典礼', 'snow']) {
      const out = await run(tool, { occasion }, session());
      expect(out.isError, `「${occasion}」被打了回`).toBeUndefined();
      expect(out.session?.brief.occasion).toBe(occasion);
      expect(out.content).toContain(occasion);
    }
  });

  it('不动没提到的字段', async () => {
    const before = session({ brief: { occasion: 'daily', dress: '卫衣' } });
    const out = await run(tool, { skinType: 'dry' }, before);
    expect(out.session?.brief).toEqual({ occasion: 'daily', dress: '卫衣', skinType: 'dry' });
  });
});

// ── propose_look ────────────────────────────────────────────────────────────

describe('propose_look', () => {
  const tool = new ProposeLookTool(palette, realFeatures(), { hexOf: realHexOf });

  it('产出记进会话,并把 describeLook 的结果交回去(那段文字就是"预览")', async () => {
    const out = await run(tool, lookInput(PLAIN_STYLE), session());

    expect(out.session?.lookSpec).toEqual(SAMPLE_LOOK);
    expect(out.content).toContain(describeLook(SAMPLE_LOOK));
    // 必须提醒模型"这就是用户唯一能看到的东西",不能加戏。
    expect(out.content).toContain('唯一能看到');
  });

  /**
   * ★★ **本组最要紧的一条**:配方降级为参考,步骤是模型自己写的那几步。
   *
   * 起因是用户的诉求:「妆容不能定死啊,这个只能说作为参考,要给模型自己发挥的空间」。
   * 判据只有一条:**记进会话的那几步是入参里那几步**,而不是 `derivePlan` 展开的配方原文。
   * ⚠️ 这两者在 `lookInput` 里长得**一模一样**(它照配方抄了一份当"模型写的"),
   *   所以这里刻意**换掉每一步的 `desc`** —— 不换的话,即使实现退回"按 styleId 展开配方",
   *   这条测试也照样绿(那正是它要防的东西)。
   */
  it('★★ 记下的是模型自己写的那几步,不是配方原文(配方只是参考)', async () => {
    const input = lookInput(PLAIN_STYLE);
    const mine = (input['steps'] as { name: string; desc: string }[]).map((s, i) => ({
      name: s.name,
      desc: `我自己写的第 ${i + 1} 步:用刷子扫开`,
    }));

    const out = await run(tool, { ...input, steps: mine, styleName: '清透通勤妆' }, session());

    expect(out.isError).toBeUndefined();
    expect(out.session?.plan?.steps.map((s) => s.desc)).toEqual(mine.map((s) => s.desc));
    expect(out.session?.plan?.styleName).toBe('清透通勤妆');
    // ★ 反面:配方原文一个字都不该进来。少了这一条,"换掉 desc"也可能只是巧合对上。
    const recipe = derivePlan({ styleId: PLAIN_STYLE })!;
    for (const s of recipe.steps) expect(out.session?.plan?.steps.map((x) => x.desc)).not.toContain(s.desc);
    // 它仍然是"参考了哪条配方",只是不再决定步骤长什么样。
    expect(out.session?.plan?.styleId).toBe(PLAIN_STYLE);
  });

  /**
   * ★★ 步骤名是**硬校验**:认不出来的那一步不会出图,而那是一个干净的 200 ——
   *   用户看到的是"讲了一套妆,出的图里没有这一步"(本仓最恨的形状)。
   *   所以打回,并且**必须把词表带上**,否则模型只能换一个猜。
   */
  it('★★ 步骤名认不出来 ⇒ 打回,附词表,且会话一个字没写', async () => {
    const input = lookInput(PLAIN_STYLE);
    const steps = [...(input['steps'] as { name: string; desc: string }[]), { name: '打光', desc: '扫一层' }];

    const out = await run(tool, { ...input, steps }, session());

    expect(out.isError).toBe(true);
    expect(out.content).toContain('打光'); // 是哪一步不对
    expect(out.content).toContain(stepVocabularyHint()); // ★ 唯一能改对的东西
    expect(out.session).toBeUndefined();
    expect(out.content).toMatch(/^★ 这次\*\*没有记下任何妆面/);
  });

  /** 同一个道理:一个出图步都没有时,`renderPlanOf` 会静默回落到「整脸」兜底那一张。 */
  it('★★ 一个出图步都没有 ⇒ 打回(不许静默落进「整脸」兜底那张)', async () => {
    const steps = [
      { name: '护肤', desc: '先保湿' },
      { name: '定妆', desc: '压一层散粉定妆' },
    ];

    const out = await run(tool, { ...lookInput(PLAIN_STYLE), steps }, session());

    expect(out.isError).toBe(true);
    expect(out.content).toContain('出不了图');
    expect(out.session).toBeUndefined();
  });

  it('★ 缺 `styleName` / `steps` 写不成形状 ⇒ 打回,并说清那一格该长什么样', async () => {
    const input = lookInput(PLAIN_STYLE);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...input, styleName: '   ' }, 'styleName'],
      [{ ...input, steps: [] }, 'steps'],
      [{ ...input, steps: [{ name: '唇妆' }] }, 'steps'], // 少了 desc
    ];

    for (const [bad, field] of cases) {
      const out = await run(tool, bad, session());
      expect(out.isError, `${field} 那一格没被打回`).toBe(true);
      expect(out.content).toContain(field);
      expect(out.session).toBeUndefined();
    }
  });

  /**
   * ★★ 推荐产品的 `(pid, code)` 在库里查不到 ⇒ **整条丢掉,不打回**。
   *
   * ✏️ 2026-10-02(用户拍板):「色号可以自己推理,产品库里有的可以推荐,没有的就算了,
   *   不要硬推荐」。此前是打回整份,等于让一份**顺手给的建议**把妆面也一起作废。
   *   ⚠️ 但**丢掉不等于静默**:丢的那几条要回填进回执,否则模型会在正文里照旧推荐,
   *   而 `/result` 上一条都没有 —— "讲给用户的"与"界面上的"不是一套。
   *
   * ⚠️ 只在**配了产品库 + 色号词表**时才判:两个都没配的部署里一个色值都查不到,
   *   那是部署形态不是模型写错了(同 `compose.ts` 里 `shades` 与 `products` 那段分辨)。
   *   这一条下面还有一条反向用例钉着这件事 —— 少了它,"全都丢掉"会悄悄变成那个部署的常态。
   */
  describe('推荐产品的色号校验(只在配了产品库时)', () => {
    const withCatalog = new ProposeLookTool(
      palette,
      realFeatures(),
      { hexOf: fakeHexOf },
      fakeLibrary(),
      fakeShadeCatalog(),
    );

    it('★★ 色号对不上 ⇒ 丢掉那一条,方案照记,回执里说明白了', async () => {
      const input = lookInput(PLAIN_STYLE);
      const products = [
        { name: '某细管口红', pid: '42-rouge', code: '01' }, // 真有
        { name: '某细管口红', pid: '42-rouge', code: '99' }, // 色号编的
      ];

      const out = await run(withCatalog, { ...input, products }, session());

      // ★ 没打回:妆面与方案都记下了,这正是这次改动的全部意义。
      expect(out.isError).toBeUndefined();
      expect(out.session?.plan?.products.map((p) => p.code)).toEqual(['01']);
      // ★ 而且要说出来,不然它在正文里照样推荐 99。
      expect(out.content).toContain('99');
      expect(out.content).toMatch(/已从方案里略去/);
    });

    it('★★ 库里没有这个 pid ⇒ 丢掉(不是打回):编出来的产品进不了方案,但方案还在', async () => {
      const input = lookInput(PLAIN_STYLE);
      const products = [{ name: '编出来的口红', pid: 'no-such-product' }];

      const out = await run(withCatalog, { ...input, products }, session());

      expect(out.isError).toBeUndefined();
      expect(out.session?.plan?.products).toEqual([]);
      expect(out.session?.lookSpec).toBeDefined(); // ★ 妆面没被连坐
      expect(out.content).toContain('no-such-product');
    });

    it('★ 产品全被丢掉时不留一个空壳色板(色板由留下的产品推出来)', async () => {
      const input = lookInput(PLAIN_STYLE);
      const products = [{ name: '编出来的口红', pid: 'no-such-product' }];

      const out = await run(withCatalog, { ...input, products }, session());

      expect(out.session?.plan?.palette).toEqual([]);
    });

    it('查得到的那一对照旧通过,色值补进方案里', async () => {
      const input = lookInput(PLAIN_STYLE);
      const products = [{ name: '某细管口红', pid: '42-rouge', code: '01' }];

      const out = await run(withCatalog, { ...input, products }, session());

      expect(out.isError).toBeUndefined();
      expect(out.session?.plan?.products).toEqual([
        { name: '某细管口红', pid: '42-rouge', code: '01', hex: '#b03a3a' },
      ]);
      // ★ 色板由推荐产品推出来(`buildPalette`),不是模型另给的一份。
      expect(out.session?.plan?.palette).toEqual([{ code: '01', name: '某细管口红', hex: '#b03a3a' }]);
      // 回执里也要有:这一份是"我记下了什么"的收据。
      expect(out.content).toContain('#b03a3a');
    });

    /** 反向:没有产品库时**不判** —— 那是部署形态,不是模型写错。 */
    it('★ 没配产品库 ⇒ 同一份 `(pid, code)` 原样通过(无从查不等于写错了)', async () => {
      const input = lookInput(PLAIN_STYLE);
      const products = [{ name: '某细管口红', pid: '42-rouge', code: '99' }];

      const out = await run(tool, { ...input, products }, session());

      expect(out.isError).toBeUndefined();
      expect(out.session?.plan?.products.map((p) => p.code)).toEqual(['99']);
    });
  });

  /**
   * ★★ **模型可以直接给颜色**(`palette`)。起因是用户那句「色号可以自己推理……不要硬推荐」——
   *   一共 163 个色号不可能覆盖它想表达的颜色,于是色板不能只有"从产品库推"这一个出处。
   *
   * 口径是**两者填其一,不混**:给了 `palette` 就照它摆,没给才由 `products` 推
   *   (`compose-plan.ts` 文件头)。混起来的话"这份色板是谁定的"就说不清了。
   * ⚠️ 与推荐产品**刻意不同**:产品查不到是**丢掉**(那是建议,没有否决权),
   *   色板写错是**打回**(色板少一块界面上看不出来,而这是它自己写错的,一个回合能改对)。
   */
  describe('模型自给的色板(`palette`)', () => {
    it('★★ 给了就照它摆 —— 有推荐产品也不去推了(两者不混)', async () => {
      const input = lookInput(PLAIN_STYLE);
      const paletteInput = [
        { name: '复古红', hex: '#b03a3a', code: '01' },
        // ★ 没有色号的那条:模型自己推的颜色多半对不上任何一个 SKU,`code` 省掉。
        { name: '蜜桃色', hex: '#f0a58c' },
      ];

      const out = await run(tool, { ...input, palette: paletteInput }, session());

      expect(out.isError).toBeUndefined();
      // ★ 照模型给的摆:没有色号的那条 `code` 补成空串(形状与推出来那份共用一个类型)。
      expect(out.session?.plan?.palette).toEqual([
        { code: '01', name: '复古红', hex: '#b03a3a' },
        { code: '', name: '蜜桃色', hex: '#f0a58c' },
      ]);
      // 推荐产品照旧记着 —— 色板换了出处,产品清单不受影响。
      expect(out.session?.plan?.products.length).toBeGreaterThan(0);
    });

    /**
     * ★ 反过来说:**没给**才轮得到产品推。⚠️ 空数组与"没给"同义(模型把"没有"
     *   写成 `[]` 是常态),少了这一条,`paletteOf` 只要改回 `undefined` 就没人发现。
     */
    it('★ 不给 / 给空数组 ⇒ 照旧由推荐产品推', async () => {
      const input = lookInput(PLAIN_STYLE);
      const products = [{ name: '某细管口红', pid: '42-rouge', code: '01' }];
      const withCatalog = new ProposeLookTool(
        palette,
        realFeatures(),
        { hexOf: fakeHexOf },
        fakeLibrary(),
        fakeShadeCatalog(),
      );

      for (const paletteField of [undefined, []]) {
        const out = await run(
          withCatalog,
          { ...input, products, ...(paletteField === undefined ? {} : { palette: paletteField }) },
          session(),
        );
        expect(out.isError).toBeUndefined();
        expect(out.session?.plan?.palette).toEqual([{ code: '01', name: '某细管口红', hex: '#b03a3a' }]);
      }
    });

    /**
     * ★★ `hex` 不是色值 ⇒ **打回**。色板少一块界面上看不出来(色点直接 `background: #xx`),
     *   而写坏了是模型自己一个回合能改对的事 —— 与推荐产品那条"丢掉"是**两回事**。
     */
    it('★★ `hex` 写不成色值 ⇒ 打回,附合法形状,会话一个字没写', async () => {
      const input = lookInput(PLAIN_STYLE);
      const cases: Array<[unknown, string]> = [
        [{ name: '复古红', hex: 'b03a3a' }, 'b03a3a'], // 少 `#`
        [{ name: '复古红', hex: '#b03a3' }, '#b03a3'], // 五位
        [{ name: '复古红', hex: '红' }, '红'],
      ];

      for (const [bad, echo] of cases) {
        const out = await run(tool, { ...input, palette: [bad] }, session());
        expect(out.isError, `${JSON.stringify(bad)} 没被打回`).toBe(true);
        expect(out.content).toContain(echo);
        expect(out.content).toContain('六位十六进制'); // ★ 唯一能改对的东西
        expect(out.session).toBeUndefined();
      }
    });

    it('★ 超过 `MAX_PALETTE` 条 ⇒ 打回,并说清上限(不静默截断)', async () => {
      const input = lookInput(PLAIN_STYLE);
      const many = Array.from({ length: MAX_PALETTE + 1 }, (_, i) => ({
        name: `颜色${i}`,
        hex: '#b03a3a',
      }));

      const out = await run(tool, { ...input, palette: many }, session());

      expect(out.isError).toBe(true);
      expect(out.content).toContain(String(MAX_PALETTE));
      expect(out.session).toBeUndefined();
    });

    it('★ 写不成形状(`name` 空 / 不是数组 / 不是对象)⇒ 打回,并说清那一格该长什么样', async () => {
      const input = lookInput(PLAIN_STYLE);
      const cases: unknown[] = [
        [{ hex: '#b03a3a' }], // 少了 name
        [{ name: '  ', hex: '#b03a3a' }], // name 是空白
        [{ name: '复古红' }], // 少了 hex
        ['#b03a3a'], // 不是对象
        '#b03a3a', // 不是数组
      ];

      for (const bad of cases) {
        const out = await run(tool, { ...input, palette: bad }, session());
        expect(out.isError, `${JSON.stringify(bad)} 没被打回`).toBe(true);
        expect(out.content).toContain('palette');
        expect(out.session).toBeUndefined();
      }
    });
  });

  /**
   * ★★ 深浅要真的说到用户眼前 —— `describeLook` 那段文字**是"预览"的替代品**
   *   (见 `look-description.ts` 文件头),它少说一个"浅",用户就是对着一个更浓的
   *   颜色决定要不要花钱出图。★ 与 `prompt-builder` 那份是同一套口径,
   *   少了它就会出现"话里是浅玫瑰、图里是玫瑰"。
   */
  it('★ 深浅进得了那句人话(它就是用户的"预览")', () => {
    const light = new LookSpec({
      ...SAMPLE_LOOK,
      zones: {
        ...SAMPLE_LOOK.zones,
        lip: new ZoneSpec({ tone: 'rose', depth: 'light', saturation: 'medium', finish: 'satin', intensity: 2 }),
      },
    });

    expect(describeLook(light)).toContain('唇是浅玫瑰粉的');
    // 中档不加字 —— 加 `depth` 之前的说法逐字不变(这份样例的唇色正是中档)。
    expect(describeLook(SAMPLE_LOOK)).toContain('唇是玫瑰粉的');
  });

  /**
   * ★★ 同一条口径,补的那一格是**饱和**。它是「清冷 / 低饱和」这个诉求唯一说得出口的地方
   *   —— 深浅只给明度,给不了"灰"。少了它,用户读到的预览就是"玫瑰粉",
   *   而图里画的是"低饱和玫瑰粉"。
   */
  it('★ 饱和也进得了那句人话,顺序是「低饱和」在前', () => {
    const greyish = new LookSpec({
      ...SAMPLE_LOOK,
      zones: {
        ...SAMPLE_LOOK.zones,
        lip: new ZoneSpec({ tone: 'rose', depth: 'light', saturation: 'low', finish: 'satin', intensity: 2 }),
      },
    });

    expect(describeLook(greyish)).toContain('唇是低饱和浅玫瑰粉的');
  });

  /**
   * ★★ 起因是 2026-10-01 的一次实测投诉:用户要「淡颜清冷妆」,拿到的是
   *   **莓果红唇、缎光、明显浓度**。模型挑的配方其实是对的(`coolclean` 就叫淡颜清冷妆),
   *   但配方正文**从没进过它的上下文** —— 提示里只有 `coolclean(淡颜清冷妆)` 这一串,
   *   而那条配方自己写着「低饱和腮红」「大地色系」「避免任何高饱和点缀」。
   *   ⇒ 成功回执里把这些原句和色号补上。
   *
   * ⚠️ 断言从 `derivePlan` 现取,不手抄配方原文 —— 抄一遍就等于把内容存了第二份,
   *   配方改了这里会继续绿(而生产已经变了)。
   */
  it('★★ 成功回执把**记下的那几步与推荐产品**印回去(色号 + 色值)', async () => {
    const out = await run(tool, lookInput('coolclean'), session());
    const plan = derivePlan({ styleId: 'coolclean' })!;

    // ★ 这一份是**从会话里读回来的**(`planGuidance` 与 `read_style_recipe` 共用同一个渲染器):
    //   印出来才看得见 `(区)` 与色值这两样由服务端补上的东西。
    for (const s of plan.steps) expect(out.content, `「${s.name}」那一步没印回来`).toContain(s.desc);

    // 用户那一套翻车的原句与配方指定的唇色号 —— 这两样正是"光看配方名看不出来"的东西。
    expect(out.content).toContain('避免任何高饱和点缀');
    const withCode = plan.products.find((p) => p.code !== '')!;
    expect(out.content).toContain(`${withCode.pid}/${withCode.code}`);
    // ★ 色值也要带上:色号名看不出「淡」,`#c99a86` 看得出。
    expect(out.content).toContain(realHexOf(withCode.pid, withCode.code));
  });

  it('形状不对时把合法取值清单一起回给模型(报错就是 prompt)', async () => {
    const out = await run(tool, withLip('荧光粉'), session());

    expect(out.isError).toBe(true);
    expect(out.content).toContain('可用');
    expect(out.content).toContain('rose');
  });

  it('★ `styleId` 不在表里 → 打回,并把**整份清单**列给它', async () => {
    // ✏️ 2026-09-30:此前这里是「挑了一个**别的场合**的池子里的配方」(`banquet` 对 `interview`)。
    //   池子删了,现在唯一的失败原因就是"这个 id 根本查不到"。
    const out = await run(tool, { ...lookInput(PLAIN_STYLE), styleId: 'no-such-style' }, session());

    expect(out.isError).toBe(true);
    // 与形状错误同一条规矩(见下一条):开头就得说清"这次什么都没记下"。
    expect(out.content).toMatch(/^★ 这次\*\*没有记下任何妆面/);
    // ★ 清单是**唯一**能让它改对的东西 —— 少了它,模型只能换一个猜。
    //   ✏️ 2026-10-02:`styleId` 降为可选,这句错误自己把清单列全了(不再指向"那一行"),
    //   所以断言换成"清单真的在里面",而不是只报一句"没有这条"。
    expect(out.content).toContain('no-such-style');
    expect(out.content).toContain('commute');
    expect(out.content).toContain('natural');
    expect(out.session).toBeUndefined(); // 失败就是不写会话
  });

  it('★★ 任何场合下都能用任何一条配方 —— 场合与风格是两张**各自独立**的表', async () => {
    // ★ 这条钉的是「不再按场合派池子」。`banquet`(晚宴/派对)此前只活在 `party` 的池子里,
    //   配在 `interview` 的妆面单上会被打回。现在它就该原样通过。
    // ⚠️ 第三个取值是**表外的场合** —— 它得同时满足两件事:自己不被拦,
    //   而且**不改变**配方清单(列表页那句"风格不随场合变"在下游的真实版本)。
    for (const occasion of ['interview', 'party', '朋友的婚礼']) {
      const out = await run(tool, { ...lookInput('banquet'), occasion }, session());

      expect(out.isError, `场合「${occasion}」下 banquet 被拒了`).toBeUndefined();
      expect(out.session?.plan?.styleId).toBe('banquet');
      expect(out.session?.lookSpec?.occasion).toBe(occasion);
    }
  });

  it('★★ 失败时必须**开头就说"没有记下任何妆面"** —— 否则模型会在正文里把一套妆面讲成已定', async () => {
    // 2026-09-16 真实端到端抓到的:肤色收窄把 propose_look 打回之后,模型**没有重试**,
    // 而是直接在正文里描述了一套(它以为改好了的)妆面,用户当然以为妆面定了——
    // 而会话里 `lookSpec` 一直是空的,直到用户说"出图吧"才在 render_look 那里塌下来。
    // ★ 只报"哪个字段不对"是不够的:模型会以为**改一下说法**就算完事。
    //   必须把"这次什么都没发生"这个事实放在最前面(同 render_look 失败分支的做法)。
    const out = await run(
      tool,
      withLip('荧光粉'),
      session(),
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('没有记下任何妆面');
    expect(out.content).toMatch(/^★ 这次\*\*没有记下任何妆面/); // 开头第一句,不是缀在末尾
    expect(out.content).toContain('再调用一次本工具');
    expect(out.session).toBeUndefined(); // 失败就是不写会话
  });

  it('★ 肤色已知时按肤色收窄色域 —— 「生成完再检查」变成「根本生成不出来」', async () => {
    const deep = session({ brief: { skinTone: 'deep_brown' } });
    // nude 不在 deep_brown 的可用色域里(词表占位值),应当被打回。
    const out = await run(
      tool,
      withLip('nude'),
      deep,
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('深');
    expect(out.content).toContain('berry');
  });

  it('肤色**未知**时不收窄 —— 「不知道」和「知道但违反」是两回事', async () => {
    const out = await run(
      tool,
      withLip('nude'),
      session(),
    );
    expect(out.isError).toBeUndefined();
  });

  it('自由文本字段塞不进来(§6:开了这个口子,身份保持就形同虚设)', async () => {
    const out = await run(tool, { ...lookInput(PLAIN_STYLE), note: '眼睛放大一点' }, session());
    expect(out.isError).toBe(true);
    expect(out.content).toContain('note');
  });
});

// ── list_cabinet ────────────────────────────────────────────────────────────

describe('list_cabinet', () => {
  it('非空:渲染成行,并按会话的 userId 去问', async () => {
    const reader = new FakeCosmeticReader([
      { name: '某唇釉', attributes: [{ label: '色号', value: '07' }, { label: '质地', value: '雾面' }] },
      { name: '某粉底', attributes: [] },
    ]);
    const out = await run(new ListCabinetTool(reader), {}, session({ userId: 'u-42' }));

    expect(reader.asked).toEqual(['u-42']);
    expect(out.content).toContain('- 某唇釉(色号:07、质地:雾面)');
    expect(out.content).toContain('- 某粉底');
  });

  it('★ 空清单要明说"这是正常的,不要重试" —— 否则模型会换个说法反复试', async () => {
    const out = await run(new ListCabinetTool(new FakeCosmeticReader()), {}, session());

    expect(out.content).toContain('不要重试');
    expect(out.isError).toBeUndefined();
  });

  it('存储故障**故意不在这里吞**,交给 agent-loop 的统一兜底', async () => {
    await expect(run(new ListCabinetTool(new FailingCosmeticReader()), {}, session())).rejects.toThrow(
      '衣橱文件读坏了',
    );
  });
});

// ── list_products / read_product ────────────────────────────────────────────

describe('list_products', () => {
  it('索引、速查表、补充说明都要给到模型', async () => {
    const out = await run(new ListProductsTool(fakeLibrary()), {}, session());

    expect(out.content).toContain('测试库');
    expect(out.content).toContain('42-rouge'); // id 必须给,不然 read_product 无从下手
    expect(out.content).toContain('某细管口红');
    expect(out.content).toContain('哑光质地。');
    // 速查表:最右那列是负向信号,漏了模型就会把该避开的也推出去。
    expect(out.content).toContain('避开品类');
    expect(out.content).toContain('厚重膏状');
    expect(out.content).toContain('含酸提醒');
    expect(out.isError).toBeUndefined();
  });

  it('★ 要把"没标可对应妆面 ≠ 不能用"说清楚 —— 护肤/防晒/妆前/定妆在 LookSpec 里本来就没位置', async () => {
    const out = await run(new ListProductsTool(fakeLibrary()), {}, session());
    expect(out.content).toContain('不是"不能用"');
  });

  /**
   * ★ 2026-09-17:这一条钉的是**版面**(顺序),不是内容。
   *
   * 真机实测里模型推产品时写成了「`33-touche-clat-le-teint`(妍活青春/逆龄粉底液)」——
   * **id 被摆在了产品名的位置上**。根因是渲染时 id 占着行首那个位置,
   * 模型写正文时照着版面复现了一遍(详见 `list-products.ts` 文件头)。
   * 上面那两条 `toContain` 断言**看不出这件事**——它们在不在行首都成立。
   */
  it('★ 名称排在 id 前面 —— id 落在行首会被模型当成产品名抄进正文', async () => {
    const out = await run(new ListProductsTool(fakeLibrary()), {}, session());
    const line = out.content.split('\n').find((l) => l.includes('42-rouge')) ?? '';

    expect(line).not.toBe('');
    expect(line.indexOf('某细管口红')).toBeLessThan(line.indexOf('42-rouge'));
    // 带 `id:` 标签,和名称/类目这些并列项一样有名字,不再是一个孤零零的串。
    expect(line).toContain('id:`42-rouge`');
    // ★ 给模型的那句说明也得跟着改口径:它说的位置就是模型去找 id 的地方。
    expect(out.content).toContain('行尾');
  });
});

describe('read_product', () => {
  it('六维度全文按标签渲染出来', async () => {
    const lib = fakeLibrary();
    const out = await run(new ReadProductTool(lib, fakeShadeCatalog()), { id: '42-rouge' }, session());

    expect(lib.asked).toEqual(['42-rouge']);
    expect(out.content).toContain('【质地/妆效】哑光,显色度高。');
    expect(out.content).toContain('【社交平台用户反馈摘要】');
    expect(out.content).toContain('细管系列');
  });

  it('★ 口径必须提醒:那段"用户反馈"出自品牌资料,不是我们采的口碑(§13-6)', async () => {
    const out = await run(new ReadProductTool(fakeLibrary(), fakeShadeCatalog()), { id: '42-rouge' }, session());
    expect(out.content).toContain('品牌资料');
  });

  it('不存在的 id → isError,并指一条回去的路(不是抛错)', async () => {
    const out = await run(new ReadProductTool(fakeLibrary(), fakeShadeCatalog()), { id: '不存在' }, session());

    expect(out.isError).toBe(true);
    expect(out.content).toContain('不存在');
    expect(out.content).toContain('list_products'); // 光说"没有"它只会原地重试
  });

  it('没给 id → isError,不抛错', async () => {
    const out = await run(new ReadProductTool(fakeLibrary(), fakeShadeCatalog()), {}, session());
    expect(out.isError).toBe(true);
  });

  it('★ 色号表要印出来 —— 模型推荐时填的 `code` 只能从它这里挑', async () => {
    const out = await run(new ReadProductTool(fakeLibrary(), fakeShadeCatalog()), { id: '42-rouge' }, session());

    expect(out.content).toContain('【色号】共 1 个');
    expect(out.content).toContain('01'); // code
    expect(out.content).toContain('正红'); // 名
    expect(out.content).toContain('#b03a3a'); // 色值
    expect(out.content).toContain('`42-rouge`'); // 连同 pid 一起给,模型才拼得出一对
  });

  it('★ 这件产品没有色号 → 明说"只填 pid",不留一段空白', async () => {
    // ⚠️ "整件推荐"是**合法**形态(`products[].code` 空串,见 `propose-look.ts`),
    //   所以这里要说的是怎么填,不是"这件别推荐"。
    const out = await run(new ReadProductTool(fakeLibrary(), { shadesOf: () => [] }), { id: '42-rouge' }, session());

    expect(out.content).toContain('没有色号');
    expect(out.content).toContain('不要填 `code`');
  });

  it('★ 读到了就记进会话(红线 §13-6 那个「品牌参考」角标靠它)', async () => {
    const out = await run(new ReadProductTool(fakeLibrary(), fakeShadeCatalog()), { id: '42-rouge' }, session());

    expect(out.session?.consultedProducts).toEqual([
      { id: '42-rouge', name: '某细管口红', categoryLabel: '唇部彩妆' },
    ]);
  });

  it('读不到就不记 —— 没进模型眼睛的东西不该被标成"品牌参考"', async () => {
    const out = await run(new ReadProductTool(fakeLibrary(), fakeShadeCatalog()), { id: '不存在' }, session());
    expect(out.session).toBeUndefined();
  });

  it('★★ 重入:同一个 id 连读两次,只多一条,且第二次**不产生会话写入**', async () => {
    // `tool.ts` 约束 3 在本模块**唯一实际的受力点**。用户确认出图后那一轮会整轮重跑,
    // read_product 会被再调一次;不防重入就会出现重复条目,或者一次多余的会话写入。
    const lib = fakeLibrary();
    const tool = new ReadProductTool(lib, fakeShadeCatalog());
    const first = await run(tool, { id: '42-rouge' }, session());
    const afterFirst = first.session!;

    const second = await run(tool, { id: '42-rouge' }, afterFirst);

    expect(second.session).toBeUndefined(); // ★ 同一个 id ⇒ 没改 ⇒ 按 tool.ts 不返回 session
    expect(afterFirst.consultedProducts).toHaveLength(1);
    expect(second.content).toBe(first.content); // 内容照样给全,只是不记账
  });

  it('两个不同的 id 各记一条,顺序即查到的先后', async () => {
    const lib = new FakeProductLibrary({
      a: { ...SAMPLE_DETAIL, id: 'a', name: '甲' },
      b: { ...SAMPLE_DETAIL, id: 'b', name: '乙' },
    });
    const tool = new ReadProductTool(lib, fakeShadeCatalog());
    const s1 = (await run(tool, { id: 'b' }, session())).session!;
    const s2 = (await run(tool, { id: 'a' }, s1)).session!;

    expect(s2.consultedProducts.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

// ── read_style_recipe ───────────────────────────────────────────────────────

/**
 * ★★ 这个工具存在的唯一理由是「**把配方正文挪到做决定之前**」。
 *
 * 起因:`propose_look` 的 `zones` 要与所选配方的步骤**集合相等**(`look-spec.validator.ts` ②c),
 * 而配方正文此前**只在 `propose_look` 成功之后**才进上下文 —— 模型是闭着眼睛填那一格的,
 * 实测每轮必被打回一次,代价是一次多出来的计费调用。同 `v16` 的教训:光加提示词不够,
 * 得让它**做决定的那一刻手里真有东西**。
 */
describe('read_style_recipe', () => {
  const tool = new ReadStyleRecipeTool({ hexOf: realHexOf });

  /**
   * ★ 从**印出来的正文**里取回那一行区名单。
   *   ⚠️ 刻意**不调 `requiredZonesOf`** —— 那正是被测对象;用它去构造期望值,
   *   这条断言就变成自证(渲染里少印一个区也照样绿)。
   */
  function zonesPrintedIn(content: string): string[] {
    const keys = /这套参考落在这些区上:([^。]+)。/.exec(content)?.[1];
    return keys === undefined ? [] : keys.split('、').filter(Boolean);
  }

  it('★ 步骤原文 + 色号 + 色值都要给到 —— 这些此前只在 propose_look 成功后才进上下文', async () => {
    const out = await run(tool, { styleId: 'coolclean' }, session());
    const plan = derivePlan({ styleId: 'coolclean' })!;

    expect(out.isError).toBeUndefined();
    // ✏️ 2026-10-02:**逐步列全**(含护肤 / 定妆)—— 它给的是"这条参考整条长什么样",
    //   哪几步要写进 `steps` 由模型自己定(它才是那份入参的作者)。
    for (const s of plan.steps) expect(out.content, `「${s.name}」那一步的原文没给`).toContain(s.desc);
    // 认得出区的步骤要缀 `(区)`:模型填 `zones` 时,那张对照表就是它。
    for (const s of plan.steps) {
      const t = targetOfStepName(s.name);
      if (t !== undefined && t !== 'none') expect(out.content).toContain(`· ${s.name}(${t}):`);
    }
    // 用户那套翻车的原句:光看配方名(`coolclean(淡颜清冷妆)`)看不出它是低饱和。
    expect(out.content).toContain('避免任何高饱和点缀');

    // ★ 色号与色值都在:这一份正文是模型**最省事的真色号来源**(不必先读产品库)。
    const withCode = plan.products.find((p) => p.code !== '')!;
    expect(out.content).toContain(`${withCode.pid}/${withCode.code}`);
    expect(out.content).toContain(realHexOf(withCode.pid, withCode.code));

    // ✏️ v21:这一节不光是"色号来源"——正文里就**要它照这份填 `products`**。
    //   少这句,模型读到了也不填,结果页那栏永远是「本次方案未指定产品」。
    expect(out.content).toContain('填进 `products`');
    expect(out.content).toContain('不用等用户开口问');
  });

  it('★★ 印出来的区名单就是校验器认的那一套:照它填能过,少填一个就被打回', async () => {
    // ★ 这条是"这份正文真的有用"的证明。印出来的东西与 `validateLookSpec` ②c 判的
    //   若不是同一套,模型**照着读也会被打回**——而那时它没有任何办法知道哪里不对。
    let checkedExtras = 0;

    for (const styleId of SAMPLED_STYLES) {
      const content = (await run(tool, { styleId }, session())).content;
      const printed = zonesPrintedIn(content);
      expect(printed.length, `${styleId}: 正文里没印出区名单`).toBeGreaterThanOrEqual(4);

      // ① 前四格每套都必填 —— 它们必须在名单里,而且排在最前面。
      expect(printed.slice(0, 4)).toEqual(['lip', 'cheek', 'eyeshadow', 'brow']);

      // ② 按**印出来的那份**填 ⇒ 过(这正是模型照着读会做出的那个动作)。
      const zones: Record<string, unknown> = { ...SAMPLE_LOOK.zones };
      for (const role of printed) {
        if (role in SAMPLE_LOOK.zones) continue;
        zones[role as AddedZoneRole] = ADDED_ZONE_LOOK[role as AddedZoneRole];
      }
      const required = requiredZonesOf(derivePlan({ styleId })!);
      expect(() =>
        validateLookSpec(
          { ...lookFor(styleId), zones },
          { palette, requiredZones: required },
        ),
        `${styleId}: 照正文印的区填,却被校验打回了`,
      ).not.toThrow();

      // ③ 少印了一个也少填一个 ⇒ 必须被打回,否则这条测试自己就是个假开关。
      const extra = printed.find((r) => ADDED_ZONE_ROLES.includes(r as AddedZoneRole));
      if (!extra) continue;
      checkedExtras += 1;
      const short = { ...zones };
      delete short[extra];
      expect(() =>
        validateLookSpec({ ...lookFor(styleId), zones: short }, { palette, requiredZones: required }),
      ).toThrowError(new RegExp(extra));
    }

    // 没有一条配方带可选区的话,③ 那一半根本没跑过(那是静默失效,不是通过)。
    expect(checkedExtras).toBeGreaterThan(0);
  });

  it('只读 —— 不改会话、不用确认,返回里根本不带 session', async () => {
    const out = await run(tool, { styleId: PLAIN_STYLE }, session());
    expect(out.session).toBeUndefined();
    expect(out.isError).toBeUndefined();
  });

  it('不认得的 styleId / 没给 → isError 且列出**整份**清单(不是只报"没有")', async () => {
    for (const input of [{ styleId: 'no-such-style' }, {}, { styleId: '   ' }]) {
      const out = await run(tool, input, session());
      expect(out.isError).toBe(true);
      expect(out.content).toContain('可选风格');
      expect(out.content).toContain('commute'); // 清单里真有这一条
    }
  });

  it('★★ 三处文案都要把模型推向"先读参考、但别照抄" —— 一个"可有可无"的工具它不会主动去读', () => {
    // ★ 三处是**独立的文案**,只改一处另外两处会把它拉回旧行为(与出图那句同理)。
    const prompt = buildSystemPrompt(session());
    expect(prompt).toContain('先调 `read_style_recipe`');

    const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;
    expect(propose.description).toContain('read_style_recipe');

    // ★ v20 起这第三处要说的**不是"照它填"而是"它只是参考"**:
    //   步骤改由模型自己写,读这条配方读的是**挑颜色的那条线**。
    expect(READ_STYLE_RECIPE.description).toContain('参考,不是模板');
  });
});

// ── 系统提示 ────────────────────────────────────────────────────────────────

describe('系统提示', () => {
  it('每轮嵌**当前** brief 与 LookSpec(留住的是这两个的当前值,不是聊天原文)', async () => {
    const s = session({
      brief: { occasion: 'interview', skinTone: 'deep_brown' },
      lookSpec: SAMPLE_LOOK,
    });
    const prompt = buildSystemPrompt(s);

    expect(prompt).toContain(describeBrief(s.brief));
    expect(prompt).toContain(describeLook(SAMPLE_LOOK));
  });

  /**
   * ★★ 钉「静默丢弃点」2:`FIELD_LABELS` 没登记就不渲染 —— 模型从头到尾不知道用户写过补充说明,
   * 而 200、日志干净。`features` 之外的线索(人设档案那段话)只有这一条路进得了系统提示。
   */
  it('★ 补充说明会被渲染进系统提示(漏登记就永远读不到)', () => {
    const prompt = buildSystemPrompt(session({ brief: { personaNotes: '左脸有一道疤,想要更冷调' } }));
    expect(prompt).toContain('人设补充说明=左脸有一道疤,想要更冷调');
  });

  it('还没提出妆面时要有明确说法,不留空', () => {
    expect(buildSystemPrompt(session())).toContain('还没有提出过妆面');
  });

  it('★ 必须说清"调用 render_look 不等于出图" —— 否则它会替用户拍板', () => {
    // 出图接上之后,这条硬规则管的是**人在回路**:模型只能提议,确认是用户的动作。
    // 它要防的是两个极端:① 当自己已经出好了(用户等一个永远不来的图);
    // ② 反过来还说自己不能出图(能力有了却被它自己藏起来)。
    const prompt = buildSystemPrompt(session());
    expect(prompt).toContain('不等于出图');
    expect(prompt).toContain('必须停下等他');
    expect(prompt).toContain('不要说你已经出好了');
  });

  it('几条硬规则都在:不许写提示词 / 肤色不许猜 / 形态诉求要明说做不到', () => {
    const prompt = buildSystemPrompt(session());
    expect(prompt).toContain('永远不写图像提示词');
    expect(prompt).toContain('肤色不许猜');
    expect(prompt).toContain('形态');
  });

  // ★★ 2026-09-17(v12):规则 3 的**两条半句必须同时在**——这是那一版改动的全部内容,
  //    而它很容易被下一次"顺手把话说圆一点"改回去(改回去的后果是**真机上一个工具都不调**,
  //    实测见 `system-prompt.ts` 的 v12 沿革与 `scripts/probe-agent-prompt.ts`)。
  it('★ 规则 3 两个半句都在:肤色不许猜(且显式留空)+ 问不许吃掉整轮', () => {
    const prompt = buildSystemPrompt(session());
    // ① 前半句保住:它是红线 §13-3 的落点,也是"别替她定"的那一半。
    expect(prompt).toContain('留空,别替她定');
    // ② 后半句是 v12 加的那一半:缺一项**不**等于这一轮只反问。
    expect(prompt).toContain('不许因为缺一项就把整轮用来反问');
    // ③ 而它凭什么能不空转——**妆面那一步根本不需要肤色**,这句是让②成立的前提。
    //    ⚠️ 少了③,② 就变成一句模型做不到的指令(它以为自己缺了必填项)。
    expect(prompt).toContain('妆面本身不需要肤色');
  });

  // ★★ 2026-09-16 真实模型跑端到端时翻出来的那一次(v5)。
  //    妆面聊定、用户还没说要出图的那一轮,模型说「确认之后我就开始出图」——
  //    而它**没调 `render_look`**,确认框根本不存在,用户去找一张永远不出现的卡片。
  //    根因是**那句话被当句式印在了它能读到的地方**(规则 6 + `RENDER_LOOK` 的描述),
  //    而它手里**没有状态**能判断当下该不该说。所以两组断言缺一不可:
  //    ① 状态要给它;② 句式要带前提。只做①它照抄句式,只做②它猜不出该不该说。
  describe('出图那句话必须有前提(v5)', () => {
    /** 一个「欠着 `render_look` 的 `tool_result`」的会话 = 真的有确认框在等。 */
    const awaitingConfirm = (over: Partial<Session> = {}): Session =>
      session({
        faceRef: { storeKey: 'inputs/s1/face/me.png', mimeType: 'image/png' },
        messages: [
          new Message({ role: 'user', content: [new TextBlock({ type: 'text', text: '出图' })] }),
          new Message({
            role: 'assistant',
            content: [
              new ToolUseBlock({ type: 'tool_use', id: 't1', name: TOOL_NAMES.renderLook, input: {} }),
            ],
          }),
        ],
        ...over,
      });

    it('★ 没照片 / 没出过图 / 没有确认框 —— 三样都要说清,不留给人猜的空白', () => {
      // 空白正是这次翻车的来源:模型看不到"没有确认框",只好照句式说有一个。
      const line = describeRenderState(session());

      expect(line).toContain('还没有她的照片');
      expect(line).toContain('还没出过图');
      expect(line).toContain('没有**确认框在等');
    });

    it('有照片、出过 2 张 → 照实报数', () => {
      const s = session({
        faceRef: { storeKey: 'k', mimeType: 'image/png' },
        renders: [
          new RenderRecord({
            seq: 1,
            ref: { storeKey: 'a', mimeType: 'image/png' },
            lookDescription: '',
            // 空数组 = 那张「整脸」兜底图(没有方案时出的那一张)。
            stepIds: [],
            createdAt: '2026-09-16T00:00:00.000Z',
          }),
          new RenderRecord({
            seq: 2,
            ref: { storeKey: 'b', mimeType: 'image/png' },
            lookDescription: '',
            // 空数组 = 那张「整脸」兜底图(没有方案时出的那一张)。
            stepIds: [],
            createdAt: '2026-09-16T00:00:00.000Z',
          }),
        ],
      });

      expect(describeRenderState(s)).toContain('已经出过 2 张图');
      expect(describeRenderState(s)).toContain('没有**确认框在等');
    });

    it('**有待确认的 render_look** → 说有框在等,并且叫它别再提议', () => {
      const line = describeRenderState(awaitingConfirm());

      expect(line).toContain('有一个确认框正等用户点');
      expect(line).toContain('别重复提议');
      // ★ 这一支**不能**再说"没有确认框"——那会把模型推向相反的错法(以为用户没看见框)。
      expect(line).not.toContain('没有**确认框');
    });

    it('★★ 口径与前端视图同源:同一份会话,`pendingRender` 与这一行必须同时说有/说无', () => {
      // 两处判断的是同一件事(「最后一轮欠着 render_look 的结果吗」),分别给前端和给模型看。
      // 不同源就会出现「卡片上有一个确认框、提示词说没有」这种自相矛盾——
      // 而模型会照提示词行事,于是它把用户往错的方向带。
      const has = (s: Session): boolean => describeRenderState(s).includes('有一个确认框正等用户点');
      expect(has(awaitingConfirm())).toBe(true);
      expect(has(session({ faceRef: { storeKey: 'k', mimeType: 'image/png' } }))).toBe(false);
      // 欠的是**别的**工具(如 read_product)不算待确认——判据是按名字挑,不是"有没有欠账"。
      expect(
        has(
          session({
            faceRef: { storeKey: 'k', mimeType: 'image/png' },
            messages: [
              new Message({
                role: 'assistant',
                content: [
                  new ToolUseBlock({
                    type: 'tool_use',
                    id: 't2',
                    name: TOOL_NAMES.listProducts,
                    input: {},
                  }),
                ],
              }),
            ],
          }),
        ),
      ).toBe(false);
    });

    it('★ 系统提示里真的带了这一行(不是只写了个没人调的函数)', () => {
      expect(buildSystemPrompt(session({ brief: { occasion: 'daily' } }))).toContain(
        describeRenderState(session({ brief: { occasion: 'daily' } })),
      );
    });

    it('★★ `v7` 起**模型不再负责转述确认框**:没有义务,就没有"说错时机"', () => {
      // 走到这一版之前试过四轮"加强什么时候可以说",都还会漏(见 `v5`/`v6`/`v7` 沿革)。
      // 根因是这件事**本来就不该由模型说**:那个框是界面自己弹的、话也是界面写的,
      // 而模型被要求转述一个它看不到也管不着的 UI 状态,只能靠猜。
      const prompt = buildSystemPrompt(session());

      // ① 不许再出现那句示范话(照抄过三次,三种错法)
      expect(prompt).not.toContain('确认之后我就开始出图');
      expect(RENDER_LOOK.description).not.toContain('确认之后我就开始出图');
      // ② 也不许再要求它"顺口交代一句"——那正是它到处乱提的来源
      expect(prompt).not.toContain('交给他确认');
      expect(RENDER_LOOK.description).not.toContain('交给他确认');
      // ③ 但**禁令**必须留着,而且要写清"框不总是存在"
      expect(prompt).toContain('别提"确认框"这件事');
      expect(prompt).toContain('那个框并不总是存在');
      expect(RENDER_LOOK.description).toContain('一个字都别提"确认框"');
      // ④ 「停下等他」这条老规矩不能被这轮改动带走
      expect(prompt).toContain('必须停下等他');
      expect(prompt).toContain('不要说你已经出好了');
    });

    it('★ 工具描述里的禁令(模型每轮都读得到它,是它贴着看的文案)', () => {
      // 与系统提示是两处独立的文案,只改一处另一处会把它拉回旧行为。
      expect(RENDER_LOOK.description).toContain('本次调用**报错时不会有任何框**');
      expect(RENDER_LOOK.description).toContain('由界面自己弹、自己解释');
    });

    it('⚠️ 前提**不能**写成"等工具返回结果之后再说" —— 那条路模型走不到', () => {
      // 有 `pending` 时那一轮的结果是**被丢掉的**(`agent-loop.ts` ⑦:发一半会 400),
      // 模型永远收不到那次返回。写成"返回之后"就是一句它做不到的指令。
      expect(buildSystemPrompt(session())).not.toContain('返回了「已把出图请求交给用户确认」');
      expect(RENDER_LOOK.description).not.toContain('返回了「已把出图请求交给用户确认」');
    });
  });

  // ── 妆面那一行的状态(v11) ────────────────────────────────────────────────
  //
  // ⚠️ 修的是**跨轮**那一段:`propose-look.ts` 的失败文案只管当轮(实测有效,
  //    模型确实会在同一回合里重试),可模型若用正文讲完就收尾,
  //    下一轮提示里只剩「当前还没有提出过妆面」——读不出"你被拒了""正文写了不算"。
  describe('妆面定下来没有(v11)', () => {
    /** 造一条「`propose_look` 的 `tool_use` + 它的结果」的消息对。 */
    const proposeTurn = (isError: boolean): Message[] => [
      new Message({
        role: 'assistant',
        content: [
          new ToolUseBlock({ type: 'tool_use', id: 'p1', name: TOOL_NAMES.proposeLook, input: {} }),
        ],
      }),
      new Message({
        role: 'user',
        content: [new ToolResultBlock({ type: 'tool_result', toolUseId: 'p1', content: '…', isError })],
      }),
    ];

    it('★★ 一次都没调过 `propose_look` → 也要说清"正文里描述过不算数"', () => {
      // ★ 这一格是 **v11 首轮真实模型实测**逼出来的:**首轮它一次 `propose_look` 都没调,
      //   正文里却把一整套妆面讲完了**(「底妆遮瑕度4…眼影砖红…」),`lookSpec` 空着。
      //   那种形状下**没有失败的结果块**,只写"被拒了"那半句够不着它。
      const line = describeLookState(session());

      expect(line).toContain('当前还没有提出过妆面');
      expect(line).toContain('正文里描述过妆面不算数');
      // 但它**不是**一条"赶紧去提"的义务——空格上只说明这一格认什么,不催。
      expect(line).not.toContain('再调一次');
    });

    it('★★ 上一次被拒 → 必须说清"正文里讲成定下来的不算数"', () => {
      // 这就是实测翻车的原话形状:模型在正文里把妆面讲完了,`lookSpec` 却是空的。
      const line = describeLookState(session({ messages: proposeTurn(true) }));

      expect(line).toContain('当前还没有提出过妆面');
      expect(line).toContain('被拒了');
      expect(line).toContain('正文里把妆面讲成已经定下来的不算数');
      expect(line).toContain('再调一次');
    });

    it('⚠️ 先失败后成功 = 重试过了 → **不许**再报失败(那是假警报)', () => {
      // 取的是**最后一次**结果,不是"有没有失败过"。模型重试成功是正常路径。
      const line = describeLookState(
        session({
          lookSpec: SAMPLE_LOOK,
          messages: [
            ...proposeTurn(true),
            new Message({
              role: 'assistant',
              content: [
                new ToolUseBlock({
                  type: 'tool_use',
                  id: 'p2',
                  name: TOOL_NAMES.proposeLook,
                  input: {},
                }),
              ],
            }),
            new Message({
              role: 'user',
              content: [
                new ToolResultBlock({
                  type: 'tool_result',
                  toolUseId: 'p2',
                  content: '已记下',
                  isError: false,
                }),
              ],
            }),
          ],
        }),
      );

      expect(line).toContain('当前已提出的妆面');
      expect(line).not.toContain('被拒了');
    });

    it('★★ 已经有一套、改的那次被拒 → 要明说"改动没记下、老的还在"', () => {
      // 这一支最容易漏:只按 `lookSpec` 有没有来分支的写法会显示成"一切正常",
      // 而模型上一条工具结果说的是"这次没记下"——两个说法对不上,
      // 它可能就跟用户说"改好了",而渲染用的仍是老妆面。
      const line = describeLookState(
        session({ lookSpec: SAMPLE_LOOK, messages: proposeTurn(true) }),
      );

      expect(line).toContain('当前已提出的妆面');
      expect(line).toContain('改动的部分一个字都没记下');
      expect(line).toContain('老的还留着');
    });

    it('欠的是**别的**工具不算 —— 判据是按名字挑,不是"有没有报错"', () => {
      const line = describeLookState(
        session({
          messages: [
            new Message({
              role: 'assistant',
              content: [
                new ToolUseBlock({
                  type: 'tool_use',
                  id: 'x1',
                  name: TOOL_NAMES.renderLook,
                  input: {},
                }),
              ],
            }),
            new Message({
              role: 'user',
              content: [
                new ToolResultBlock({
                  type: 'tool_result',
                  toolUseId: 'x1',
                  content: '没有照片',
                  isError: true,
                }),
              ],
            }),
          ],
        }),
      );

      expect(line).not.toContain('被拒了');
      expect(line).not.toContain('改动的部分');
    });

    it('★ 系统提示里真的带了这一行(不是只写了个没人调的函数)', () => {
      const s = session({ messages: proposeTurn(true) });

      expect(buildSystemPrompt(s)).toContain(describeLookState(s));
      expect(buildSystemPrompt(s)).toContain('正文里把妆面讲成已经定下来的不算数');
    });
  });

  describe('风格清单(v15)', () => {
    it('★★ 那两句指令指的名字,就是**真印出来的那一行**的名字', () => {
      // 2026-09-30:这一行从「风格池」(随场合变)改成了「可选风格」(全表 21 条)。
      // ⚠️ 系统提示那句指令、`propose_look` 里 `styleId` 那一格的 description、
      //   渲染器抬头是**三份字符串**,前两份是**按名字去找那一行**的。名字对不上,
      //   模型就会去找一个**不存在的段落**,然后凭记忆编一个 id ——
      //   那是本仓头号 bug「假开关」的形状:界面正常、日志干净、校验也过了
      //   (不存在的 id 只有到 `propose_look` 才被打回)。
      const prompt = buildSystemPrompt(session());
      expect(prompt).toContain(describeStyleOptions());

      const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;
      // ✏️ 2026-10-02:指路那句从**工具描述**挪到了**填 `styleId` 那一格上** ——
      //   模型填那一格时读的是它,离得越近越不容易走空。
      const styleId = (propose.inputSchema as JsonSchema).properties?.styleId;
      for (const [where, text] of [
        ['系统提示', prompt],
        ['styleId 那一格', styleId?.description ?? ''],
      ] as const) {
        expect(text, `${where}里没指向那一行的名字`).toContain(STYLE_OPTIONS_HEAD);
      }
      // ✏️ 旧名字一个字都不能留:留着就是一句**指向空处**的指令。
      expect(prompt).not.toContain('风格池');
    });
  });

  describe('产品推荐(§13-6)', () => {
    it('★ 有产品库时:配料表定妆面时填 / 库只推有的 / 读库等开口 / 转述要说来源', () => {
      const prompt = buildSystemPrompt(session(), { hasProducts: true });

      // ✏️ v21:配料表那一半 —— `products` 不空着,照配方正文那份抄。
      expect(prompt).toContain('提出妆面的那一次调用里,`products` 就要一起填好');
      expect(prompt).toContain('从 `read_style_recipe` 正文「它用到的产品与色号」那一节挑');
      // 库那一半(口径没变):问随时可以,读要等用户开口。
      expect(prompt).toContain('读,等用户点头');
      expect(prompt).toContain('产品名只能来自工具给你的正文');
      expect(prompt).toContain('一个都不许说'); // 库里没有就宁可空着
      expect(prompt).toContain('必须说明它出自品牌资料');
    });

    it('★★ `products` 那一格也要钉住"定妆面时就填"(模型填参读的是它,不是系统提示)', () => {
      // 同 §13-6 那条先例:提示词与工具描述是两处独立的文案,只改一处另一处会把它拉回旧行为。
      // 模型填 `products` 时贴着读的是这一格,所以 v21 的话必须在这里也有一份。
      const products = (PROPOSE_LOOK.inputSchema as JsonSchema).properties?.products;
      expect(products?.description ?? '').toContain('定妆面时就一起填');
      expect(products?.description ?? '').toContain('read_style_recipe');
    });

    it('★★ 「问」和「读」必须分开写 —— 只写一句模型就会倒向一边', () => {
      // 这条是人拍板的口径,一天内改过两次,两次的错法**方向相反**:
      //   只写"等用户开口" → 模型连问都不敢问(第一版就是这样,被纠正成"可以主动挑话头");
      //   只写"可以问一句" → 它问完**直接就去读了**,等于回到"妆面做完自动推"。
      // 所以两句话都得在,缺哪一句都是同一个 bug 的两种长相。
      const prompt = buildSystemPrompt(session(), { hasProducts: true });

      // ① "要主动挑话头"(`v8` 起是**义务**,不再只是许可 —— 理由见下一条用例)
      expect(prompt).toContain('必须把话头给到');
      // ② "但读要等用户开口"(限制)
      expect(prompt).toContain('不是读库的理由');
      // ③ 以及**否掉"先把库读出来备着"**这个具体动作 —— 它才是最真实的那条退化路径:
      //    模型会想"我读了不一定推,先备着总没错",于是库里内容提前进了上下文。
      expect(prompt).toContain('不要先把库读出来备着');
      // ④ 别反复提
      expect(prompt).toContain('她没接住就不再提');
    });

    it('★★ 「主动」和「不硬凑」必须一起写 —— `v8` 把"问"从许可改成了义务', () => {
      // ★ 为什么要改:`v7` 之前那句「妆面定下来之后,你可以问一句」**一次都没触发过**
      //   —— 它是个许可,而同一轮里压着"要不要出图""先给我一张照片"这些更硬的活。
      //   **许可输给义务**,和 `v5` 之前那句"可以告诉用户"是同一种死法。
      const prompt = buildSystemPrompt(session(), { hasProducts: true });

      // ① 义务要落在**一个确定的时机**上。★ 这一条是关键:时机确定(`propose_look`
      //    那一条回复)就不需要新增会话状态,也就不会重演 `v5`「给了义务没给前提」的形状。
      expect(prompt).toContain('提出妆面那一条回复里');
      // ①′ ★★ `v10`:**不许再给示范句**。`v8` 写过一句,实测里模型把它当模板用,
      //     结果**该出现的那一轮没出现、不该出现的那一轮出现了**(而且那一轮它已经
      //     把资料读完,却只回了这句现成话,产品一条没给)。
      //     —— 与 `v6` 从规则 6 删掉「确认之后我就开始出图」是同一件事。
      expect(prompt).not.toContain('想看了说一声');
      expect(prompt).toContain('别拿现成句式去说它');
      // ② 由头那一侧:得说清"由头是用户带来的",否则模型就会自己造。
      expect(prompt).toContain('不许自己制造由头');
      // ③ 没有由头就不提 —— 这一条才是"主动"和"推销"之间的分界线。
      expect(prompt).toContain('没对上就不提');
      // ④ ★ 刻意**不**写"整场最多 N 次":那要求模型数自己说过几次,而我们没有这个状态。
      //    用**由头**当闸门,不用计数当闸门。这里把那个决定钉住,免得下一个人好心补上。
      expect(prompt).not.toMatch(/最多\s*\d+\s*次/);
    });

    it('★ 两个产品工具的**描述**里也钉了同一个触发条件(它们才是模型贴着读的文案)', () => {
      // 提示词与工具描述是两处独立的文案,只改一处的话另一处会把它拉回旧行为。
      // ★ 描述里同样要**同时**有"可以问"和"读要等开口":这里只钉后者的话,
      //   模型贴着工具描述做决定时,会以为自己连问都不该问。
      expect(LIST_PRODUCTS.description).toContain('要用户开口了才用');
      expect(LIST_PRODUCTS.description).toContain('你挑过话头、用户答应了');
      expect(LIST_PRODUCTS.description).toContain('不是读库的理由');
      // ★ `v8` 加了由头,于是这里多了一个必须钉住的**边界**:由头**只买得到一句话**,
      //   买不到一次读库。混成一件就回到了"妆面做完自动推"。
      expect(LIST_PRODUCTS.description).toContain('提到天气/脱妆/预算');
      expect(READ_PRODUCT.description).toContain('要用户开口了才用');
      expect(READ_PRODUCT.description).toContain('答应了你的提议');
      // ★ 读的那一扇门一个字没动,所以 `read_product` 的描述里**不该**出现"由头"。
      expect(READ_PRODUCT.description).not.toContain('由头');
    });

    it('★ 天气缺失时要有退路 —— 速查表主轴是天气×肤质,而 weather 是可选的', () => {
      const prompt = buildSystemPrompt(session(), { hasProducts: true });
      expect(prompt).toContain('天气缺失时');
      expect(prompt).toContain('精度有限');
    });

    it('★★ 没有产品库时,提示词里**一个字都不能提这两个工具**', () => {
      // 这是本组里最要紧的一条:提示词让模型去调一个不在工具名单里的工具,
      // 模型照做,拿回「没有名为 list_products 的工具」,然后它就自己编产品了。
      // 那正是 §13-6 要防的事——而且失败得**悄无声息**。
      const prompt = buildSystemPrompt(session());

      expect(prompt).not.toContain('list_products');
      expect(prompt).not.toContain('read_product');
      expect(prompt).not.toContain('库要等用户开口才读'); // 第 7 条整条都不该在
    });

    it('★ `v9`:内部标识符(工具名 / 产品 id)不许进给用户看的正文', () => {
      // 实测两轮各抓到一个:一次是把 id 缀在产品名后面当注释,一次是说
      // 「我就可以调用 `render_look` 生成成片图了」。同一个毛病:**它把自己读到的
      // 标识符原样抄进了人话** —— 而我们通篇就是这么跟它说话的,它照着学了一遍。
      const prompt = buildSystemPrompt(session(), { hasProducts: true });

      expect(prompt).toContain('不要复述给用户看');
      // ★ `v13`:原来这里断的是「别把 id 缀在后面当注释」。那句**只堵了"后面"**,
      //   而下一轮实测里 id 出现在**前面**(写在产品名位置上)——模型绕开了那个形状。
      //   所以改成不带位置信息的封闭说法;断言也跟着从"某一句原文"改成"三个位置都点到"。
      expect(prompt).toContain('一个字都不该出现在给用户看的正文里');
      expect(prompt).toContain('放在前面当标签');
      expect(prompt).toContain('缀在后面当注释');
      expect(prompt).toContain('塞进括号里');
    });

    it('★ `v13`:推荐产品时不许交代取数过程,但话头那条义务要留着', () => {
      // 实测原话:「我马上从库里给你挑几支真正适配你皮肤状态 + 面试需求的产品」
      // —— 用户要的是产品,不是它的工作流程。根因在规则 7 那段话头本身
      // (「你能按天气和肤质替她挑几支产品」被它原样学走,只是补了个来源),见 `v13` 沿革。
      const prompt = buildSystemPrompt(session(), { hasProducts: true });

      expect(prompt).toContain('不要交代你是从哪儿找的');
      // ⚠️ 这一条是**防"修一个坏一个"**:新禁令紧挨着 `v8` 立的话头,
      //   而 `v12b` 的教训正是两股相反的力会互相顶掉(掐掉不该掐的那一半)。
      expect(prompt).toContain('是义务,不是许可');
      expect(prompt).toContain('不冲突');
    });

    it('免费工具名单按实际注册的写(有产品库才列那两个)', () => {
      expect(buildSystemPrompt(session(), { hasProducts: true })).toContain('`list_products`');
      expect(buildSystemPrompt(session())).not.toContain('`list_products`');
    });
  });

  /**
   * ★★ v16:肤色已知时必须把**该档的**色汇印出来。
   *   起因是实测里每次会话必有一次打回:`propose_look` 的 `tone` `enum` 给的是全 7 个色,
   *   而真正合法的只有该档的 3~6 个(橄榄皮那档恰好排除 `peach`)。
   *   ⚠️ 断言用的是 `palette` 查出来的那一份,**不是写死的色名**——写死就等于把
   *   词表抄了第二份,词表换版时这条测试会继续绿(而生产已经变了)。
   */
  describe('肤色可用色那一行(v16)', () => {
    const olive = { toneKeysFor: () => ['rose', 'coral', 'brick'] as const, labelOf: () => '橄榄皮' };

    it('肤色已知 → 印出该档的色汇', () => {
      const s = session({ brief: { skinTone: 'olive' } });
      const prompt = buildSystemPrompt(s, { palette: olive });
      expect(prompt).toContain('肤色「橄榄皮」可用色:rose / coral / brick');
    });

    it('肤色还不知道 → 整行不印(那时本来就不收窄,`enum` 里的全量色就是对的)', () => {
      const prompt = buildSystemPrompt(session(), { palette: olive });
      expect(prompt).not.toContain('可用色:');
    });

    // ★ 不传 `palette` = 退回 v15 的行为(让模型猜、被拒一次)。**不是安全开关**:
    //   真正的收窄在 `validateLookSpec`,那边 `palette` 是必填的。
    it('没给 palette → 整行不印,且不抛', () => {
      const s = session({ brief: { skinTone: 'olive' } });
      expect(buildSystemPrompt(s)).not.toContain('可用色:');
    });

    // ★ 这一条防的是"有人图省事把色表抄进提示词里":抄了的话两档会印出同一串,
    //   而生产里 `validateLookSpec` 用的是词表那一份 —— 提示说的和校验认的就分家了。
    it('印的是**词表**那一份,不是写死的:两个档印出的色汇不同,且各自等于 toneKeysFor', () => {
      const p = realPalette();
      const of = (skinTone: SkinTone): string =>
        buildSystemPrompt(session({ brief: { skinTone } }), { palette: p });

      const light = of('cool_porcelain');
      const deep = of('deep_brown');

      expect(light).toContain(`可用色:${p.toneKeysFor('cool_porcelain')!.join(' / ')}`);
      expect(deep).toContain(`可用色:${p.toneKeysFor('deep_brown')!.join(' / ')}`);
      expect(light).not.toBe(deep);
    });
  });
});
