/**
 * 「配方步骤名 ↔ 妆面单区名」那张对照表的单测。
 *
 * ★ 这张表(`agent/application/step-zones.ts`)是全仓**唯一**一处同时认识
 *   「配方步骤名」与「妆面单区名」的地方,而它的失败方式是本仓最恨的那一种:
 *   某个步骤名不认得 ⇒ **那一步静默没有图**,页面不摆空块、日志干净、接口 200。
 *   所以第一条断言就是把 21 套配方的**每一个步骤名**跑一遍,一个都不许落空。
 *
 * ★ 第二条盯的是"张数"这条对外承诺:确认框上那句「这套妆有 N 个上妆步骤,会依次出 N 张图」
 *   就是照 `renderPlanOf` 算的,而它同时也是超时预算(`confirm-render.ts`)与
 *   `stepRenders`(前端图位)的来源。三处同源,所以只要它错了,三处一起错。
 */
import { describe, expect, it } from 'vitest';
import { ZONE_ROLES } from '../src/modules/makeup/index.js';
import { STYLE_LIBRARY, derivePlan, styleById } from '../src/modules/styling/index.js';
import { composePlan } from '../src/modules/styling/index.js';
import {
  MAX_RENDER_SHOTS,
  STEP_VOCABULARY,
  checkStepNames,
  renderCountOf,
  renderPlanOf,
  requiredZonesOf,
  targetOfStepName,
} from '../src/modules/agent/application/step-zones.js';

/** 21 套配方的 `(styleId, plan)`,只算一次。 */
const PLANS = STYLE_LIBRARY.map((style) => ({ styleId: style.id, plan: derivePlan({ styleId: style.id })! }));

/** 一个配方里出现过的全部步骤名(含重复)。 */
function stepNames(): string[] {
  return PLANS.flatMap(({ plan }) => plan.steps.map((s) => s.name));
}

describe('targetOfStepName —— 步骤名 → 位置', () => {
  it('★ 21 套配方里**每一个**步骤名都认得出来(落空 = 那一步静默没有图)', () => {
    const unknown = [...new Set(stepNames())].filter((name) => targetOfStepName(name) === undefined);
    expect(unknown, `这些步骤名没有落进任何一条规则:\n${unknown.join('\n')}`).toEqual([]);
  });

  it('★ 只有护肤 / 妆前 / 防晒 / 定妆这四步是「不出图」——多一个都算改口径', () => {
    // 这条是**已拍板的口径**(只给出妆步出图)。多认一个名字进 `none`,
    // 就等于那一步悄悄少了一张图,而界面上只是"这一步没有图",看不出是错的。
    const none = [...new Set(stepNames())].filter((name) => targetOfStepName(name) === 'none');
    // ⚠️ 两边都 `.sort()`:汉字是按码位排的,不是拼音,写死顺序只会让这条断言假红。
    expect(none.sort()).toEqual(['护肤', '妆前', '防晒', '定妆'].sort());
  });

  it('底妆与眉各归各的,不落进任何区', () => {
    expect(targetOfStepName('底妆')).toBe('base');
    expect(targetOfStepName('眉毛')).toBe('brow');
    // ⚠️ 「眉眼」同时含有"眉":规则顺序里眉必须排在区之后,先命中哪个都要是眉。
    expect(targetOfStepName('眉眼')).toBe('brow');
  });

  it('新品类的步骤名落进各自的区(睫毛 / 眼线 / 卧蚕 / 提亮都在)', () => {
    expect(targetOfStepName('彩色睫毛')).toBe('lash');
    expect(targetOfStepName('彩色眼线')).toBe('liner');
    expect(targetOfStepName('卧蚕')).toBe('aegyoSal');
    expect(targetOfStepName('面部提亮')).toBe('highlight');
    expect(targetOfStepName('局部提亮')).toBe('highlight');
    expect(targetOfStepName('烟熏眼妆')).toBe('eyeshadow');
  });
});

/**
 * ✏️ 2026-10-02 新增。步骤改由**模型自己写**之后,这张表第一次成了**入参的判据**:
 * `propose_look` 拿 `checkStepNames` 挡表外的名字(认不出来 = 那一步没有图,
 * 却是一个干净的 200),而词表是给模型看的唯一依据。两边漂开就会出现
 * "提示里让你用这个词、工具又说认不出来"——模型照做也被拒。
 */
describe('STEP_VOCABULARY / checkStepNames —— 给模型看的词表与那道闸', () => {
  it('★ 词表里每一个名字都认得出来 —— 否则模型照它写反而被打回', () => {
    // ★ 词表是**手写**的一张单,`targetOfStepName` 是**正则**:这两者只能靠这条断言绑在一起。
    const unknown = STEP_VOCABULARY.filter((name) => targetOfStepName(name) === undefined);
    expect(unknown, `词表里这些名字没有落进任何一条规则:\n${unknown.join('\n')}`).toEqual([]);
  });

  it('★ 每个区都至少有一个规范名(加了区却没加词 = 那个区提示里根本没提)', () => {
    for (const role of ZONE_ROLES) {
      const names = STEP_VOCABULARY.filter((name) => targetOfStepName(name) === role);
      expect(names, `区 ${role} 在词表里一个规范名都没有`).not.toEqual([]);
    }
  });

  it('`checkStepNames` 只报认不出来的那些,顺序即传入顺序', () => {
    expect(checkStepNames(['底妆', '打光', '唇妆'])).toEqual(['打光']);
    expect(checkStepNames(STEP_VOCABULARY)).toEqual([]);
    // ★ 变体照旧通过(判据是正则,词表只是**建议**):不接受变体的话,
    //   「烟熏眼妆」这种写法会被打回,而那正是我们要模型做的事。
    expect(checkStepNames(['烟熏眼妆', '彩色睫毛', '面部提亮'])).toEqual([]);
  });
});

describe('MAX_RENDER_SHOTS —— 一次确认最多几张', () => {
  it('★ = 区数 + 底妆那一张(`base` 那一张要算进去)', () => {
    expect(MAX_RENDER_SHOTS).toBe(ZONE_ROLES.length + 1);
  });

  it('★★ 它是**结构上的天花板**:每个区各一步 + 一步底妆,正好用满这个数', () => {
    // 步骤由模型自己写之后,步数不再被配方钉死 —— `propose_look` 那条成本闸
    // 因此第一次有了真的受力面。这条钉住"那个数不是随手写的":
    // 用满它需要一个**恰好**装满 9 个区的方案,而再想多也写不出来。
    const perZone = ZONE_ROLES.map((role) => STEP_VOCABULARY.find((n) => targetOfStepName(n) === role)!);
    const plan = composePlan({
      styleName: '满配',
      steps: [{ name: '底妆', desc: '打底' }, ...perZone.map((name) => ({ name, desc: '上妆' }))],
    });

    expect(renderCountOf(plan)).toBe(MAX_RENDER_SHOTS);
  });

  it('★ 21 套配方全都在闸下面(`renderCountOf` 从来碰不到它)', () => {
    for (const { styleId, plan } of PLANS) {
      expect(renderCountOf(plan), `${styleId} 超了`).toBeLessThanOrEqual(MAX_RENDER_SHOTS);
    }
  });
});

describe('requiredZonesOf —— 本套配方该有哪些区', () => {
  it('★ 只报区,不报底妆 / 眉 / 那四个不出妆的步骤', () => {
    for (const { styleId, plan } of PLANS) {
      for (const zone of requiredZonesOf(plan)) {
        expect(ZONE_ROLES, `${styleId} 报了一个不是区的 role`).toContain(zone.role);
      }
    }
  });

  it('★ 同一个区出现两次只报一次(`smokey` 的两次遮瑕、`festival` 的两次眼妆)', () => {
    for (const { plan } of PLANS) {
      const roles = requiredZonesOf(plan).map((z) => z.role);
      expect(new Set(roles).size).toBe(roles.length);
    }
  });

  it('报告里带着「哪一步」——打回模型时那句话得说得出来', () => {
    const plan = derivePlan({ styleId: 'smokey' })!;
    const said = requiredZonesOf(plan).find((z) => z.role === 'concealer');
    expect(said?.stepName).toContain('遮瑕');
  });
});

describe('renderPlanOf —— 这一次确认要出几张', () => {
  it('★ 每一张都至少代表一个步骤,且 `appliedZones` 只增不减', () => {
    for (const { styleId, plan } of PLANS) {
      const shots = renderPlanOf(plan);
      expect(shots.length, `${styleId} 一张都不出`).toBeGreaterThan(0);
      let seen = 0;
      for (const shot of shots) {
        expect(shot.stepIds.length).toBeGreaterThan(0);
        expect(shot.appliedZones?.length ?? 0).toBeGreaterThanOrEqual(seen);
        seen = shot.appliedZones?.length ?? 0;
      }
    }
  });

  it('★ 最后一张画的就是整套:它的区集合 = `requiredZonesOf`(所以成片 = 今天那张)', () => {
    for (const { styleId, plan } of PLANS) {
      const last = renderPlanOf(plan).at(-1)!;
      expect(last.appliedZones, `${styleId} 的最后一张不是整套`).toEqual(
        requiredZonesOf(plan).map((z) => z.role),
      );
    }
  });

  it('★ 每一张都代表它**之前**那些步骤里被折进来的(步骤覆盖是完整的)', () => {
    // 护肤那四步不出图,所以比的是"该出图的步骤"这一个集合。
    for (const { styleId, plan } of PLANS) {
      const renderable = plan.steps
        .filter((s) => {
          const target = targetOfStepName(s.name);
          return target !== undefined && target !== 'none';
        })
        .map((s) => s.id);
      const covered = renderPlanOf(plan).flatMap((shot) => shot.stepIds);
      expect(covered, `${styleId} 有步骤没有归属`).toEqual(renderable);
    }
  });

  it('张数在 3~7 之间 —— 确认框那句"总共大约 N 秒"与超时预算都照它算', () => {
    // 上界仍是 7:`coolclean` / `princess` 是**底妆在最前**的配方,七个区各推进一张,
    // 没有任何一张与别人同款。折底妆步只削掉那 4 套"遮瑕在前"的配方各一张。
    for (const { styleId, plan } of PLANS) {
      expect(renderCountOf(plan), `${styleId} 的张数离谱`).toBeGreaterThanOrEqual(3);
      expect(renderCountOf(plan), `${styleId} 的张数离谱`).toBeLessThanOrEqual(7);
    }
  });

  it('★ 没有两张的累积集合是一样的 —— 集合一样 ⇒ 提示词逐字一样 ⇒ 白付一次钱', () => {
    // 底妆跟在区后面(此前 `bunny`/`wolf`/`smokey`/`commute` 的第 2 张)就是这么漏的:
    // 那两页的字面内容完全相同,只有 `appliedZones` 这条判据看得出来。
    for (const { styleId, plan } of PLANS) {
      const keys = renderPlanOf(plan).map((shot) => JSON.stringify(shot.appliedZones ?? null));
      expect(new Set(keys).size, `${styleId} 有一次出图与另一张同款`).toBe(keys.length);
    }
  });

  it('★ 没有方案时给**一张整脸**,而不是 0 张(0 张 = 点下去什么都没发生)', () => {
    const whole = renderPlanOf(undefined);
    expect(whole).toHaveLength(1);
    // ⚠️ `appliedZones` 整个键**缺席** = 一次画完整套;空数组是"除了底妆什么都不画"。
    expect(whole[0]!.appliedZones).toBeUndefined();
    expect(whole[0]!.stepIds).toEqual([]);
  });

  it('认得的 id 都能推出方案(这张表依赖 `styling` 的配方表不空)', () => {
    expect(PLANS).toHaveLength(STYLE_LIBRARY.length);
    expect(styleById(STYLE_LIBRARY[0]!.id)).toBeDefined();
  });
});
