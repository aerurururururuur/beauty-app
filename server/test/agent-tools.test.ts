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
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  TONE_KEYS,
  describeLook,
  validateLookSpec,
} from '../src/modules/makeup/index.js';
import type { LookSpec } from '../src/modules/makeup/index.js';
import { OCCASIONS } from '../src/modules/shared/index.js';
import {
  LIST_PRODUCTS,
  ListCabinetTool,
  ListProductsTool,
  PatchBriefTool,
  ProposeLookTool,
  READ_PRODUCT,
  RENDER_LOOK,
  ReadProductTool,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  buildSystemPrompt,
  createSession,
  createToolRegistry,
  describeBrief,
  describeLookState,
  describeRenderState,
} from '../src/modules/agent/index.js';
import type {
  CabinetItemSnapshot,
  CosmeticReader,
  ProductDetailSnapshot,
  ProductLibrary,
  ProductLibraryOverview,
  Session,
  ToolOutcome,
} from '../src/modules/agent/index.js';

// ── 样例与替身 ───────────────────────────────────────────────────────────────

/** 一份合法的妆面单,同时喂给 zod 与 JSON Schema 两边。 */
const SAMPLE_LOOK: LookSpec = {
  occasion: 'interview',
  base: { coverage: 3, finish: 'satin', warmth: 0 },
  zones: {
    lip: { tone: 'rose', finish: 'matte', intensity: 3 },
    cheek: { tone: 'coral', finish: 'satin', intensity: 2 },
    eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 },
    brow: { shape: 'natural', intensity: 2 },
  },
};

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: unknown[];
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

const session = (over: Partial<Session> = {}): Session => ({ ...createSession('s1', 'u1'), ...over });

async function run(tool: { run(i: unknown, c: { session: Session }): Promise<ToolOutcome> }, input: unknown, s: Session) {
  return tool.run(input, { session: s });
}

// ── ① 工具契约与实体同源 ─────────────────────────────────────────────────────

describe('工具契约', () => {
  it('★ 工具全集就这几个,名字与常量一致(加工具必挂——这正是它存在的意义)', () => {
    // 2026-09-16 从 4 变 6:接入产品库加了 list_products / read_product。
    // 这次破例的边界写在 `definitions.ts` 的文件头,别让它悄悄扩大。
    expect(TOOL_DEFINITIONS.map((d) => d.name)).toEqual([
      TOOL_NAMES.patchBrief,
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
      maxRenders: 3,
    };
    const without = createToolRegistry(base);
    expect([...without.keys()]).toEqual([
      TOOL_NAMES.patchBrief,
      TOOL_NAMES.proposeLook,
      TOOL_NAMES.listCabinet,
      TOOL_NAMES.renderLook,
    ]);

    const withProducts = createToolRegistry({ ...base, products: fakeLibrary() });
    expect([...withProducts.keys()]).toContain(TOOL_NAMES.listProducts);
    expect([...withProducts.keys()]).toContain(TOOL_NAMES.readProduct);
  });

  it('枚举与上下界**没有一个手抄**,全部与实体常量同源', () => {
    const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;
    const props = propose.inputSchema as JsonSchema;
    const zones = props.properties?.zones?.properties ?? {};

    expect((props.properties?.occasion as JsonSchema).enum).toEqual([...OCCASIONS]);
    expect(zones.lip?.properties?.tone.enum).toEqual([...TONE_KEYS]);
    expect(zones.lip?.properties?.finish.enum).toEqual([...FINISHES]);
    expect(zones.lip?.properties?.intensity).toMatchObject({
      minimum: INTENSITY_MIN,
      maximum: INTENSITY_MAX,
    });

    const brief = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.patchBrief)!;
    const briefProps = brief.inputSchema as JsonSchema;
    // patch_brief 的面里**没有 weather**(§7.2:天气不是问出来的)。
    expect(Object.keys(briefProps.properties ?? {})).not.toContain('weather');
  });

  it('手写的 JSON Schema 结构与 zod 的 LookSpec 对得上(样例双向校验)', () => {
    const propose = TOOL_DEFINITIONS.find((d) => d.name === TOOL_NAMES.proposeLook)!;

    // 一侧:JSON Schema 认这份样例。
    assertSchemaCoversSample(propose.inputSchema as JsonSchema, SAMPLE_LOOK, '$');
    // 另一侧:zod 也认同一份样例(不收窄肤色,只看形状)。
    expect(() => validateLookSpec(SAMPLE_LOOK)).not.toThrow();
  });
});

// ── patch_brief ─────────────────────────────────────────────────────────────

describe('patch_brief', () => {
  const tool = new PatchBriefTool();

  it('记下并回显当前已知需求', async () => {
    const out = await run(tool, { occasion: 'interview', skinTone: 'deep' }, session());

    expect(out.session?.brief).toEqual({ occasion: 'interview', skinTone: 'deep' });
    expect(out.content).toContain('场合=interview');
    expect(out.content).toContain('肤色深浅=deep');
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

  it('不动没提到的字段', async () => {
    const before = session({ brief: { occasion: 'daily', dress: '卫衣' } });
    const out = await run(tool, { skinType: 'dry' }, before);
    expect(out.session?.brief).toEqual({ occasion: 'daily', dress: '卫衣', skinType: 'dry' });
  });
});

// ── propose_look ────────────────────────────────────────────────────────────

describe('propose_look', () => {
  const tool = new ProposeLookTool();

  it('产出记进会话,并把 describeLook 的结果交回去(那段文字就是"预览")', async () => {
    const out = await run(tool, SAMPLE_LOOK, session());

    expect(out.session?.lookSpec).toEqual(SAMPLE_LOOK);
    expect(out.content).toContain(describeLook(SAMPLE_LOOK));
    // 必须提醒模型"这就是用户唯一能看到的东西",不能加戏。
    expect(out.content).toContain('唯一能看到');
  });

  it('形状不对时把合法取值清单一起回给模型(报错就是 prompt)', async () => {
    const out = await run(tool, { ...SAMPLE_LOOK, zones: { ...SAMPLE_LOOK.zones, lip: { tone: '荧光粉', finish: 'matte', intensity: 3 } } }, session());

    expect(out.isError).toBe(true);
    expect(out.content).toContain('可用');
    expect(out.content).toContain('rose');
  });

  it('★★ 失败时必须**开头就说"没有记下任何妆面"** —— 否则模型会在正文里把一套妆面讲成已定', async () => {
    // 2026-09-16 真实端到端抓到的:肤色收窄把 propose_look 打回之后,模型**没有重试**,
    // 而是直接在正文里描述了一套(它以为改好了的)妆面,用户当然以为妆面定了——
    // 而会话里 `lookSpec` 一直是空的,直到用户说"出图吧"才在 render_look 那里塌下来。
    // ★ 只报"哪个字段不对"是不够的:模型会以为**改一下说法**就算完事。
    //   必须把"这次什么都没发生"这个事实放在最前面(同 render_look 失败分支的做法)。
    const out = await run(
      tool,
      { ...SAMPLE_LOOK, zones: { ...SAMPLE_LOOK.zones, lip: { tone: '荧光粉', finish: 'matte', intensity: 3 } } },
      session(),
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('没有记下任何妆面');
    expect(out.content).toMatch(/^★ 这次\*\*没有记下任何妆面/); // 开头第一句,不是缀在末尾
    expect(out.content).toContain('再调用一次本工具');
    expect(out.session).toBeUndefined(); // 失败就是不写会话
  });

  it('★ 肤色已知时按肤色收窄色域 —— 「生成完再检查」变成「根本生成不出来」', async () => {
    const deep = session({ brief: { skinTone: 'deep' } });
    // nude 不在 deep 的可用色域里(占位表),应当被打回。
    const out = await run(
      tool,
      { ...SAMPLE_LOOK, zones: { ...SAMPLE_LOOK.zones, lip: { tone: 'nude', finish: 'matte', intensity: 3 } } },
      deep,
    );

    expect(out.isError).toBe(true);
    expect(out.content).toContain('深');
    expect(out.content).toContain('berry');
  });

  it('肤色**未知**时不收窄 —— 「不知道」和「知道但违反」是两回事', async () => {
    const out = await run(
      tool,
      { ...SAMPLE_LOOK, zones: { ...SAMPLE_LOOK.zones, lip: { tone: 'nude', finish: 'matte', intensity: 3 } } },
      session(),
    );
    expect(out.isError).toBeUndefined();
  });

  it('自由文本字段塞不进来(§6:开了这个口子,身份保持就形同虚设)', async () => {
    const out = await run(tool, { ...SAMPLE_LOOK, note: '眼睛放大一点' }, session());
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
});

describe('read_product', () => {
  it('六维度全文按标签渲染出来', async () => {
    const lib = fakeLibrary();
    const out = await run(new ReadProductTool(lib), { id: '42-rouge' }, session());

    expect(lib.asked).toEqual(['42-rouge']);
    expect(out.content).toContain('【质地/妆效】哑光,显色度高。');
    expect(out.content).toContain('【社交平台用户反馈摘要】');
    expect(out.content).toContain('细管系列');
  });

  it('★ 口径必须提醒:那段"用户反馈"出自品牌资料,不是我们采的口碑(§13-6)', async () => {
    const out = await run(new ReadProductTool(fakeLibrary()), { id: '42-rouge' }, session());
    expect(out.content).toContain('品牌资料');
  });

  it('不存在的 id → isError,并指一条回去的路(不是抛错)', async () => {
    const out = await run(new ReadProductTool(fakeLibrary()), { id: '不存在' }, session());

    expect(out.isError).toBe(true);
    expect(out.content).toContain('不存在');
    expect(out.content).toContain('list_products'); // 光说"没有"它只会原地重试
  });

  it('没给 id → isError,不抛错', async () => {
    const out = await run(new ReadProductTool(fakeLibrary()), {}, session());
    expect(out.isError).toBe(true);
  });

  it('★ 读到了就记进会话(红线 §13-6 那个「品牌参考」角标靠它)', async () => {
    const out = await run(new ReadProductTool(fakeLibrary()), { id: '42-rouge' }, session());

    expect(out.session?.consultedProducts).toEqual([
      { id: '42-rouge', name: '某细管口红', categoryLabel: '唇部彩妆' },
    ]);
  });

  it('读不到就不记 —— 没进模型眼睛的东西不该被标成"品牌参考"', async () => {
    const out = await run(new ReadProductTool(fakeLibrary()), { id: '不存在' }, session());
    expect(out.session).toBeUndefined();
  });

  it('★★ 重入:同一个 id 连读两次,只多一条,且第二次**不产生会话写入**', async () => {
    // `tool.ts` 约束 3 在本模块**唯一实际的受力点**。用户确认出图后那一轮会整轮重跑,
    // read_product 会被再调一次;不防重入就会出现重复条目,或者一次多余的会话写入。
    const lib = fakeLibrary();
    const tool = new ReadProductTool(lib);
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
    const tool = new ReadProductTool(lib);
    const s1 = (await run(tool, { id: 'b' }, session())).session!;
    const s2 = (await run(tool, { id: 'a' }, s1)).session!;

    expect(s2.consultedProducts.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

// ── 系统提示 ────────────────────────────────────────────────────────────────

describe('系统提示', () => {
  it('每轮嵌**当前** brief 与 LookSpec(留住的是这两个的当前值,不是聊天原文)', async () => {
    const s = session({
      brief: { occasion: 'interview', skinTone: 'deep' },
      lookSpec: SAMPLE_LOOK,
    });
    const prompt = buildSystemPrompt(s);

    expect(prompt).toContain(describeBrief(s.brief));
    expect(prompt).toContain(describeLook(SAMPLE_LOOK));
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
          { role: 'user', content: [{ type: 'text', text: '出图' }] },
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 't1', name: TOOL_NAMES.renderLook, input: {} }],
          },
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
          { seq: 1, ref: { storeKey: 'a', mimeType: 'image/png' }, input: { ref: { storeKey: 'f', mimeType: 'image/png' }, lookDescription: '' }, createdAt: '2026-09-16T00:00:00.000Z' },
          { seq: 2, ref: { storeKey: 'b', mimeType: 'image/png' }, input: { ref: { storeKey: 'f', mimeType: 'image/png' }, lookDescription: '' }, createdAt: '2026-09-16T00:00:00.000Z' },
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
              {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 't2', name: TOOL_NAMES.listProducts, input: {} }],
              },
            ],
          }),
        ),
      ).toBe(false);
    });

    it('★ 系统提示里真的带了这一行(不是只写了个没人调的函数)', () => {
      expect(buildSystemPrompt(session({ brief: { occasion: 'work' } }))).toContain(
        describeRenderState(session({ brief: { occasion: 'work' } })),
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
    const proposeTurn = (isError: boolean) => [
      {
        role: 'assistant' as const,
        content: [{ type: 'tool_use' as const, id: 'p1', name: TOOL_NAMES.proposeLook, input: {} }],
      },
      {
        role: 'user' as const,
        content: [{ type: 'tool_result' as const, toolUseId: 'p1', content: '…', isError }],
      },
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
            {
              role: 'assistant',
              content: [{ type: 'tool_use', id: 'p2', name: TOOL_NAMES.proposeLook, input: {} }],
            },
            {
              role: 'user',
              content: [{ type: 'tool_result', toolUseId: 'p2', content: '已记下', isError: false }],
            },
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
            {
              role: 'assistant',
              content: [{ type: 'tool_use', id: 'x1', name: TOOL_NAMES.renderLook, input: {} }],
            },
            {
              role: 'user',
              content: [{ type: 'tool_result', toolUseId: 'x1', content: '没有照片', isError: true }],
            },
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

  describe('产品推荐(§13-6)', () => {
    it('★ 有产品库时:只推库里有的 / 用户开口才读 / 转述要说来源', () => {
      const prompt = buildSystemPrompt(session(), { hasProducts: true });

      expect(prompt).toContain('库要等用户开口才读');
      expect(prompt).toContain('产品名只能来自这两个工具');
      expect(prompt).toContain('一个都不许说'); // 库里没有就宁可空着
      expect(prompt).toContain('必须说明它出自品牌资料');
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
      expect(prompt).toContain('别把 id 缀在后面当注释');
    });

    it('免费工具名单按实际注册的写(有产品库才列那两个)', () => {
      expect(buildSystemPrompt(session(), { hasProducts: true })).toContain('`list_products`');
      expect(buildSystemPrompt(session())).not.toContain('`list_products`');
    });
  });
});
