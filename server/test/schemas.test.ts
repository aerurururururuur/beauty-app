/**
 * domain/schemas —— 「形状/契约」测试 + 两条入口的规则一致性测试。
 *
 * ★ §4.2 之后分工变了,这个文件也跟着改了:
 *   - **schema 只答「这是什么结构」**:类型对不对、`.strict()`、`weather` 的数值区间。
 *   - **枚举白名单 / 长度上限 / trim 是业务规则**,在 validator 里
 *     (`shared/domain/validators/brief-fields.validator.ts`,两条路共用那一份)。
 *   所以「`occasion: 'snow'` 要被拒」这类断言**从 `safeParse` 挪到了 validator**
 *   ——它们原来测的是 schema,现在测的是规则。见下面第二个 describe。
 *
 * ✏️ 2026-09-29:表单那条路(`POST /api/jobs` 的 `metaRaw`)随 `jobs` 模块删除,
 *   简报的第二条入口改成**开会话**(`POST /api/agent/sessions` 带初始 brief)。
 *   「两条路给同一个答案」那组因此改测开会话 ↔ 对话——**规则本身没变,还是同一份**。
 *
 * ✏️ 2026-09-29(§4.2 扫完其余模块):同样那件事在 `user` / `cabinet` / `weather` /
 *   `agent-http` 上也做了一遍,分工由**最后一组** describe 统一钉着。
 */
import { describe, expect, it } from 'vitest';
import { AppError, MAX_DRESS, MAX_SCENE_TEXT } from '../src/modules/shared/index.js';
import type { Occasion } from '../src/modules/shared/index.js';
// ★ makeup 那六个类:收窄与品牌的钉子(见文件末那一组)。类型与值分开 import,同下面几处的写法。
import { BrowSpec, LookSpec, LookSpecBase, ZoneSpec } from '../src/modules/makeup/index.js';
import type { BrowShape, Finish, Intensity, ToneKey } from '../src/modules/makeup/index.js';
// ★ 对话那条路的补丁 schema + 它的 validator。
import {
  briefPatchSchema,
  checkBriefPatch,
  confirmRenderSchema,
  MAX_AGENT_TEXT,
  Message,
  sendMessageSchema,
  startSessionSchema,
  ToolResultBlock,
  validateConfirmRender,
  validateSendMessage,
  validateStartSession,
} from '../src/modules/agent/index.js';
// ★ §4.2 那一批「规则从 schema 搬进 validator」的其余模块。下面最后一组把分工本身钉住。
import {
  credentialsSchema,
  MAX_NICKNAME_RAW,
  MAX_PASSWORD,
  userIdSchema,
  validateCredentials,
} from '../src/modules/user/index.js';
import {
  createItemSchema,
  itemIdSchema,
  MAX_ATTRIBUTES,
  MAX_NAME_RAW,
  validateCreateInput,
} from '../src/modules/cabinet/index.js';
import { MAX_CITY, validateWeatherQuery, weatherQuerySchema } from '../src/modules/weather/index.js';

/**
 * ★ §4.2 的分工本身也要被钉住:schema **只答形状**,规则在 validator。
 *
 * 这两条断言是**故意反过来**的:schema 现在**接受** `occasion: 'snow'`。
 * 如果谁哪天把 `z.enum` / `.max()` 加回 schema,这里就红——
 * 因为那意味着规则又有了第二个落点,而 schema 的松紧决定两条路会不会**一起**失守。
 * 「`'snow'` 最终被拒」由下面一致性那组测试保证(经 validator)。
 */
describe('★ §4.2:schema 只答形状,枚举与上限不在 schema 里', () => {
  it('briefPatchSchema 只答形状', () => {
    expect(briefPatchSchema.safeParse({ occasion: 'snow' }).success).toBe(true);
  });

  it('startSessionSchema 的简报字段同样只答形状', () => {
    expect(startSessionSchema.safeParse({ userId: 'u1', occasion: 'snow' }).success).toBe(true);
    expect(
      startSessionSchema.safeParse({ userId: 'u1', sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) })
        .success,
    ).toBe(true);
  });

  it('★ 天气的数值区间也不在 schema 里(区间是规则)', () => {
    // schema 放行…
    expect(
      startSessionSchema.safeParse({ userId: 'u1', weather: { uvIndex: 999 } }).success,
    ).toBe(true);
    // …validator 拒。
    expect(() =>
      validateStartSession({ userId: 'u1', occasion: 'interview', weather: { uvIndex: 999 } }),
    ).toThrow('uvIndex 超出合理区间');
  });
});

/**
 * ★ 两条入口的规则必须一致(开会话 `validateStartSession` ↔ 对话 `checkBriefPatch`)。
 *
 * 这一组测试**不是重复覆盖**,它钉的是一件具体的事:此前两份 schema 各写了一遍
 * 那五个字段,注释里写着「改 `MakeupBrief` 时两处都要看」——而那种约定守不住。
 * 现在两条路都调 `shared` 的 `checkBriefFields`(§4.2 把规则从 schema 搬进 validator 之后
 * **尤其**需要这条,因为 schema 变松了、没有第二道网),这个 describe 就是那条规则的证据:
 * **同一份输入,两条路必须给同一个答案**。谁哪天把某一处改回手写、或给某一处加特例,这里就红。
 */
describe('★ 两条入口共用同一份简报规则(开会话 ↔ 对话)', () => {
  /** 合法基线。 */
  const BASELINE = { occasion: 'interview', sceneText: '正式终面' } as const;

  /** 开会话那条路:走真正的 validator(`userId` 是它自己的必填成员)。 */
  const viaStart = (input: unknown): boolean => {
    try {
      validateStartSession({ userId: 'u1', ...(input as object) });
      return true;
    } catch {
      return false;
    }
  };

  /** 对话那条路:走 `patch_brief` 的 validator。 */
  const viaChat = (input: unknown): boolean => checkBriefPatch(input).ok;

  const cases: Array<[string, unknown]> = [
    ['空补丁', {}],
    ['合法场合', { occasion: 'date' }],
    ['不存在的场合', { occasion: 'snow' }],
    ['合法肤质 + 肤色', { skinType: 'oily', skinTone: 'warm_tan' }],
    ['不存在的肤色', { skinTone: 'fair' }],
    ['不存在的肤质', { skinType: 'mixed' }],
    ['自由文字到上限', { sceneText: 'a'.repeat(MAX_SCENE_TEXT) }],
    ['自由文字超一个字', { sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) }],
    ['穿搭到上限', { dress: 'a'.repeat(MAX_DRESS) }],
    ['穿搭超一个字', { dress: 'a'.repeat(MAX_DRESS + 1) }],
    ['只要空白(trim 后视同没给)', { sceneText: '   ' }],
  ];

  for (const [label, probe] of cases) {
    it(`${label}:两条路给同一个答案`, () => {
      const input = { ...BASELINE, ...(probe as object) };
      expect(viaChat(input)).toBe(viaStart(input));
    });
  }

  it('认不出的字段:两条路都拒(形状层,各自 .strict())', () => {
    const input = { ...BASELINE, hobby: '滑雪' };
    expect(viaChat(input)).toBe(false);
    expect(viaStart(input)).toBe(false);
  });

  it('★ 非法取值两条路都真被拒(不是"碰巧都 false"的反面:这里要是 true)', () => {
    // 上一条只比「两边答案相同」,相同也可能是**一起放过**。这条把方向钉死。
    expect(viaChat({ ...BASELINE, occasion: 'snow' })).toBe(false);
    expect(viaChat({ ...BASELINE, skinTone: 'fair' })).toBe(false);
    expect(viaChat({ ...BASELINE, sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) })).toBe(false);
    expect(viaStart({ ...BASELINE, occasion: 'snow' })).toBe(false);
    expect(viaStart({ ...BASELINE, sceneText: 'a'.repeat(MAX_SCENE_TEXT + 1) })).toBe(false);
  });

  it('★ 唯一的刻意分歧:开会话收 weather,对话不收', () => {
    // 天气不是问出来的,是 `weather` 模块实拉的,所以 `patch_brief` 刻意没有它。
    // 这条断言把那个分歧钉住,免得哪天被"统一一下"抹平。
    const withWeather = { ...BASELINE, weather: { condition: '晴', uvIndex: 3 } };
    expect(viaStart(withWeather)).toBe(true);
    expect(viaChat(withWeather)).toBe(false);
  });

  it('★ 上限常量本身也是同一个值(转发不许漂)', () => {
    // 两条路都从 `shared` 的 validator 取——谁都不许再写字面量。
    expect(MAX_SCENE_TEXT).toBe(2000);
    expect(MAX_DRESS).toBe(80);
  });
});

/**
 * ★ 出图那条路的形状:只认 `userId`(`agent-http.ts` 的「一个出图参数都不收」)。
 *
 * 这条守卫是**补的**:2026-09-29 把 `startSessionSchema` 与 `confirmRenderSchema` 拆成
 * 两个对象时,validator 里那个 `userIdOnlySchema` 还指着前者 —— 于是出图那条路
 * **悄悄又能收 brief 与天气了**,而形状测试全绿:两条路各自都"能用"。
 * 所以下面断言的方向是**拒**,不是"能不能用":上一条的那种写法正好照不见这个 bug。
 */
describe('★ 确认出图那条路只收 userId', () => {
  it('只有 userId → 过(schema 与 validator 两半都过)', () => {
    expect(confirmRenderSchema.safeParse({ userId: 'u1' }).success).toBe(true);
    expect(validateConfirmRender({ userId: 'u1' })).toEqual({ userId: 'u1' });
  });

  it('★ 带上 brief 或天气 → 拒(拆分前它们与 userId 共用一份形状,别合并回去)', () => {
    const payloads: unknown[] = [
      { userId: 'u1', occasion: 'date' },
      { userId: 'u1', sceneText: '正式终面' },
      { userId: 'u1', skinType: 'oily' },
      { userId: 'u1', skinTone: 'warm_tan' },
      { userId: 'u1', dress: '西装 · 藏青' },
      { userId: 'u1', weather: { condition: '晴', uvIndex: 3 } },
    ];
    for (const payload of payloads) {
      // ★ 形状层就拒 —— 不是靠 validator 事后挑拣。两半都钉住,只钉一半就还能漂回去。
      expect(confirmRenderSchema.safeParse(payload).success).toBe(false);
      expect(() => validateConfirmRender(payload)).toThrowError(AppError);
    }
  });
});

/**
 * ★ §4.2 那一批改动(`user` / `cabinet` / `weather` / `agent-http`)的**分工本身**也要钉住。
 *
 * 上面两组管的是简报字段;这一组管其余几张表。写法与上面**故意同款**:
 * 每条都先**反着断言**——schema 现在**接受**这些非法值。
 * 谁哪天把 `.max()` / 正则加回 schema,这里就红:那意味着同一条规则又有了第二个落点,
 * 而 schema 的松紧决定**所有**入口会不会一起失守(§14-08)。
 *
 * 后半段是配套的另一半:**真正的把关一处都没松**,只是换了地方。
 * 少了它,这一组就退化成"两边一起放过也全绿"。
 */
describe('★ §4.2 其余模块:schema 只答形状,规则在 validator', () => {
  const tooLongBy = (n: number) => 'a'.repeat(n + 1);

  it('schema 层统统放行(这些取值**不再**是形状问题)', () => {
    expect(
      credentialsSchema.safeParse({ nickname: tooLongBy(MAX_NICKNAME_RAW), password: 'x' }).success,
    ).toBe(true);
    expect(
      credentialsSchema.safeParse({ nickname: '小美', password: tooLongBy(MAX_PASSWORD) }).success,
    ).toBe(true);
    expect(userIdSchema.safeParse('../../etc/passwd').success).toBe(true);

    expect(createItemSchema.safeParse({ userId: 'u1', name: tooLongBy(MAX_NAME_RAW) }).success).toBe(
      true,
    );
    expect(
      createItemSchema.safeParse({
        userId: 'u1',
        name: '口红',
        attributes: Array.from({ length: MAX_ATTRIBUTES + 1 }, (_, i) => ({
          label: `L${i}`,
          value: 'v',
        })),
      }).success,
    ).toBe(true);
    expect(itemIdSchema.safeParse('../etc').success).toBe(true);

    expect(weatherQuerySchema.safeParse({ city: tooLongBy(MAX_CITY) }).success).toBe(true);
  });

  it('validator 层统统照旧拒(且说的是同一句话)', () => {
    expect(() =>
      validateCredentials({ nickname: tooLongBy(MAX_NICKNAME_RAW), password: 'x' }),
    ).toThrow(`昵称原文最多 ${MAX_NICKNAME_RAW} 字`);
    expect(() =>
      validateCredentials({ nickname: '小美', password: tooLongBy(MAX_PASSWORD) }),
    ).toThrow(`密码最多 ${MAX_PASSWORD} 位`);
    expect(() => validateCreateInput({ userId: 'u1', name: tooLongBy(MAX_NAME_RAW) })).toThrow(
      `名称原文最多 ${MAX_NAME_RAW} 字`,
    );
    expect(() =>
      validateCreateInput({
        userId: 'u1',
        name: '口红',
        attributes: Array.from({ length: MAX_ATTRIBUTES + 1 }, (_, i) => ({
          label: `L${i}`,
          value: 'v',
        })),
      }),
    ).toThrow(`特性最多 ${MAX_ATTRIBUTES} 条`);
    expect(() => validateWeatherQuery({ city: tooLongBy(MAX_CITY) })).toThrow(
      `城市名最多 ${MAX_CITY} 字`,
    );
  });

  it('★ agent 那条路也一样:长度不在 schema 里,但 validator 拦得住', () => {
    const long = { userId: 'u1', text: tooLongBy(MAX_AGENT_TEXT) };
    // 这一支**没有 HTTP 层测试**(6 条 agent 路由一条都没有),所以它是这条规则唯一的网。
    expect(sendMessageSchema.safeParse(long).success).toBe(true);
    expect(() => validateSendMessage(long)).toThrow(`消息最多 ${MAX_AGENT_TEXT} 字`);
  });
});

/**
 * ✏️ 2026-09-29:实体改成「形状在 schema 写一次、`Object.assign` 搬过来」之后的两条守卫。
 *
 * ★ 这一组里的东西**测不出来**,除非用编译期/键集合这两种方式之一 ——
 *   运行时看着一切正常,坏的正是"看着正常"。
 */
describe('★ schema 推导出来的实体:品牌与键集合', () => {
  /**
   * ★ **名义化的钉子**(全仓第一处 `@ts-expect-error`)。
   *
   * `Message` 的构造器只收"schema 推导出来的 row",所以字面量当不了它 ——
   * 这条**不是**断言,是**编译期**事实:本行由第 2 道门 `npm run typecheck:test` 生效。
   * 谁哪天把 `messageSchema` 的 `.brand<'Message'>()` 去掉,这里会立刻变成
   * 「Unused '@ts-expect-error' directive」而红 —— 品牌就白加了。
   *
   * ⚠️ 别把这一行挪进 `expect(...)`:那样它就又变成一个运行时断言了,而运行时**永远过**。
   */
  it('★ 品牌不是装饰:普通字面量在编译期就当不了 Message', () => {
    // @ts-expect-error 品牌:普通字面量不是 Message(去掉 `.brand()` 这行会变成 "Unused")
    const fake: Message = { role: 'user', content: [] };
    expect(fake).toEqual({ role: 'user', content: [] });
  });

  /**
   * ★ `ToolResultBlock` 的**可选键**:`isError` 缺省时这个键**不存在**,不是 `undefined`。
   *
   * 为什么值得单测:换成 `Object.assign` 之后,`agent-loop.ts` 传进来的
   * `outcome.isError` 是 `boolean | undefined`,而 `Object.assign` 会把值为 `undefined`
   * 的键**一起搬过去** —— 于是"没出错"那条路会凭空多一个 `isError: undefined`。
   * 构造器里那句 `if (this.isError === undefined) delete this.isError;` 就是补这一格的,
   * 照旧行为与改动前那句 `if (isError !== undefined)` 逐字等价。
   * ⚠️ 差分在这两格,只测「有值时在」的那一条**照不见**它(缺省那条才是坏法)。
   */
  it('★ ToolResultBlock:没传 isError → 键不存在(不是 undefined)', () => {
    const omitted = new ToolResultBlock({ type: 'tool_result', toolUseId: 'c1', content: 'A' });
    expect('isError' in omitted).toBe(false);
    expect(Object.keys(omitted)).toEqual(['type', 'toolUseId', 'content']);
  });

  it('★ ToolResultBlock:显式传 undefined 也**不**多出这个键', () => {
    const explicit = new ToolResultBlock({
      type: 'tool_result',
      toolUseId: 'c1',
      content: 'A',
      isError: undefined,
    });
    expect('isError' in explicit).toBe(false);
  });

  it('ToolResultBlock:真的出错时那个键**在**,且为 true(上一条别退化成"永远删")', () => {
    const failed = new ToolResultBlock({
      type: 'tool_result',
      toolUseId: 'c1',
      content: '没有照片',
      isError: true,
    });
    expect(failed.isError).toBe(true);
    expect(Object.keys(failed)).toContain('isError');
  });
});

/**
 * ★ makeup 那六个类(2026-09-29 从 `declare` 换成 schema 推导)同一套口径的钉子。
 *
 * 口径本身写在 `makeup/domain/entities/look-spec.ts` 的「字段不在这里声明」那段,不抄第二遍。
 * 这里只放**这个文件才能做的两件事**:
 *   ① **收窄是类型级的** —— 只能在编译期钉,`expect` 照不见;
 *   ② **品牌是真的** —— 同上,而且要 `@ts-expect-error`(第 2 道门 `typecheck:test` 生效)。
 */
describe('★ schema 推导出来的实体(2):收窄与品牌是真的(makeup)', () => {
  /**
   * 一份合法妆面单。★ 构造器收的是**未加品牌的 row** —— 所以调用点照旧写字面量,
   * 不必先造一个"合法的"东西(见 `contracts/look-spec.ts` 文件头「一份形状两份 schema」)。
   */
  function sampleLook(): LookSpec {
    return new LookSpec({
      occasion: 'interview',
      base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
      zones: {
        lip: new ZoneSpec({ tone: 'rose', finish: 'matte', intensity: 3 }),
        cheek: new ZoneSpec({ tone: 'coral', finish: 'satin', intensity: 2 }),
        eyeshadow: new ZoneSpec({ tone: 'nude', finish: 'satin', intensity: 2 }),
        brow: new BrowSpec({ shape: 'natural', intensity: 2 }),
      },
    });
  }

  /**
   * ★ 收窄(枚举白名单)**留在 validator**(§4.2),实体只把收窄后的类型标出来。
   *
   * ⚠️ 这六行不是"练习赋值的写法",它们**就是钉子**:接口**允许多出成员**,
   *   所以把 `tone` 误写成 `tones` 既不报错、运行时也不炸 ——
   *   只会静默退化成"多一个谁都不填的键 + 真的那格仍是宽 `string`"。
   *   上面那个 describe 的注释说得对:运行时**永远过**,所以要钉就得在编译期钉。
   *   `StyleRead` / `MakeupZone` 走的是同一段代码(同一个机制、同一处 schema 文件),不重复钉。
   */
  it('★ 每一格都是枚举类型,不是宽 string / number', () => {
    const spec = sampleLook();
    const occasion: Occasion = spec.occasion;
    const coverage: Intensity = spec.base.coverage;
    const finish: Finish = spec.zones.lip.finish;
    const tone: ToneKey = spec.zones.lip.tone;
    const browShape: BrowShape = spec.zones.brow.shape;
    const browIntensity: Intensity = spec.zones.brow.intensity;
    expect([occasion, coverage, finish, tone, browShape, browIntensity]).toEqual([
      'interview',
      3,
      'matte',
      'rose',
      'natural',
      2,
    ]);
  });

  it('★ 品牌不是装饰:形状全对的字面量在编译期当不了 ZoneSpec', () => {
    // @ts-expect-error 品牌:普通字面量不是 ZoneSpec(去掉 `.brand()` 这行会变成 "Unused")
    const fake: ZoneSpec = { tone: 'rose', finish: 'matte', intensity: 3 };
    expect(fake).toEqual({ tone: 'rose', finish: 'matte', intensity: 3 });
  });

  /**
   * ★ 品牌**在嵌套上也成立**:`zonesSchema` 用的是带品牌的 `zoneSchema`,
   *   所以"外层差一个品牌"补不上内层差的那几个。
   *
   * ⚠️ 这一行**必须写成一整行**:`@ts-expect-error` 只压住**紧接的下一行**报的错,
   *   而缺品牌的报错点分别在 `base:` / `lip:` / `brow:` 各自那一格上 —— 折了行就压不住,
   *   会变成"本该被压住的编译红"。
   */
  it('★ 品牌也在嵌套上:形状全对、每层字段都对,依然当不了 LookSpec', () => {
    // @ts-expect-error 品牌:zones 里每一格也是名义类型,外层那个品牌不是随便一个对象补得上的
    const fake: LookSpec = { occasion: 'interview', base: { coverage: 3, finish: 'satin', warmth: 0 }, zones: { lip: { tone: 'rose', finish: 'matte', intensity: 3 }, cheek: { tone: 'coral', finish: 'satin', intensity: 2 }, eyeshadow: { tone: 'nude', finish: 'satin', intensity: 2 }, brow: { shape: 'natural', intensity: 2 } } };
    expect(fake.occasion).toBe('interview');
  });
});
