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
import { MAX_DRESS, MAX_SCENE_TEXT } from '../src/modules/shared/index.js';
// ★ 对话那条路的补丁 schema + 它的 validator。
import {
  briefPatchSchema,
  checkBriefPatch,
  MAX_AGENT_TEXT,
  sendMessageSchema,
  startSessionSchema,
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
