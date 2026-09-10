/**
 * scene-rules.test.ts —— 妆容方向规则的单测(原 understanding.test.ts)。
 * 守三条:① 场合判定行为不变(显式 occasion → 关键词命中 → daily 兜底);
 *        ② **自由文字真的进方向**——选了场合也不再被整个丢掉;
 *        ③ 判定规则是前后端共享的单一源,所以把共享文件本身的硬约束(零运行时 import、
 *           前端确实指着它)钉住。
 *
 * 曾经还有一组「适配器」用例,比 MockSceneAnalyzer 与纯函数的输出一致 ——
 * 那个模块连同它的两个适配器已于 2026-09-10 删除,`describeScene` 由流水线直接调用,
 * 不再存在「纯函数与适配器会不会漂移」这个问法。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OCCASIONS,
  SCENE_MATCH_ORDER,
  SCENE_RULES,
  describeScene,
} from '../src/modules/shared/index.js';

const RULES_PATH = fileURLToPath(
  new URL('../src/modules/shared/domain/scene-rules.ts', import.meta.url),
);

describe('describeScene —— 场合判定(行为不变)', () => {
  it('显式 occasion 直接采用', () => {
    expect(describeScene({ occasion: 'stage' }).label).toBe('stage');
  });

  it('无 occasion 时按自由文字关键词命中', () => {
    expect(describeScene({ sceneText: '明天要去面试' }).label).toBe('interview');
  });

  it('写了字但认不出场合 → daily', () => {
    expect(describeScene({ sceneText: '随便弄弄' }).label).toBe('daily');
  });

  it('完全没写 → daily', () => {
    expect(describeScene({}).label).toBe('daily');
  });

  it('任意自定义文字不会被硬塞进某类场合(daily 兜底)', () => {
    for (const text of ['哈哈哈哈', '见一个很久没见的朋友', '???']) {
      expect(describeScene({ sceneText: text }).label).toBe('daily');
    }
  });

  it('命中多个场合时按 SCENE_MATCH_ORDER 取靠前的,不是按枚举顺序', () => {
    // 「上台」在 SCENE_MATCH_ORDER 里排在「约会」前面 —— 这一条同时钉住优先级表本身。
    expect(SCENE_MATCH_ORDER.indexOf('stage')).toBeLessThan(SCENE_MATCH_ORDER.indexOf('date'));
    expect(describeScene({ sceneText: '上台约会' }).label).toBe('stage');
  });
});

describe('describeScene —— 自由文字叠加修饰(本轮修复的要点)', () => {
  it('★ 选了场合之后,自由文字仍然生效(此前被 if(brief.occasion) 整个短路)', () => {
    const plain = describeScene({ occasion: 'interview' });
    const withText = describeScene({ occasion: 'interview', sceneText: '想显得低调一点' });

    expect(withText.label).toBe('interview'); // 场合基调不变
    expect(withText.tags).not.toEqual(plain.tags); // 但标签变了
    expect(withText.tags).toContain('低调');
    expect(withText.direction).not.toBe(plain.direction); // 方向也变了
    expect(withText.direction.startsWith(plain.direction)).toBe(true); // 是在基准上追加,不是替换
  });

  it('没选场合时,修饰词同样生效', () => {
    const s = describeScene({ sceneText: '面试,低调一些' });
    expect(s.label).toBe('interview');
    expect(s.tags).toContain('低调');
  });

  it('各修饰组都能命中', () => {
    const cases: [string, string][] = [
      ['想低调一点', '低调'],
      ['今天要浓一点', '加浓'],
      ['想显气色', '提气色'],
      ['干练一些', '利落'],
      ['来点甜美的', '温柔'],
    ];
    for (const [text, tag] of cases) {
      // 用 daily 当基准,避免与各场合自带标签的去重互相干扰。
      expect(describeScene({ occasion: 'daily', sceneText: text }).tags).toContain(tag);
    }
  });

  it('多个修饰词按表内顺序用「、」连起来', () => {
    const s = describeScene({ occasion: 'interview', sceneText: '专业、低调、显气色' });
    expect(s.tags).toEqual(['正式', '哑光', '大地色', '利落', '低调', '提气色']);
    // 「利落」的标签面试基准已有,整条规则跳过;剩下两条按表内顺序拼接。
    expect(s.direction).toBe(
      '正式得体 · 哑光大地色,眉眼利落显精神;按你的要求再压低一档存在感、把气色提上来',
    );
  });

  it('没有修饰词时,方向与标签与基准**完全一致**(不发散)', () => {
    const base = SCENE_RULES.interview;
    const s = describeScene({ occasion: 'interview', sceneText: '明天终面,对方是国企' });
    expect(s.tags).toEqual(base.tags);
    expect(s.direction).toBe(base.direction);
  });

  it('场合基准已满足的诉求不重复追加(面试 + 专业 → 无变化)', () => {
    const base = SCENE_RULES.interview;
    const s = describeScene({ occasion: 'interview', sceneText: '想显得专业' });
    expect(s.tags).toEqual(base.tags);
    expect(s.direction).toBe(base.direction);
  });

  it('★ 红线:「显白」不被采纳', () => {
    // 按真实肤色走、不默认浅肤色审美(roadmap 红线 §13-3)。
    // 用户写「显白」不算命中任何修饰词 —— 不迎合就是设计行为,不是漏配。
    const s = describeScene({ occasion: 'daily', sceneText: '想要显白一点,越白越好' });
    expect(s.tags).not.toContain('显白');
    expect(s.direction).not.toContain('显白');
    expect(s.tags).toEqual(SCENE_RULES.daily.tags); // 整句没有任何修饰被采纳
    expect(s.direction).toBe(SCENE_RULES.daily.direction);
  });
});

describe('单一源完整性', () => {
  it('SCENE_RULES 覆盖 OCCASIONS 全集(加场合时漏配会先在这里红)', () => {
    expect(Object.keys(SCENE_RULES).sort()).toEqual([...OCCASIONS].sort());
  });

  it('SCENE_MATCH_ORDER 覆盖 OCCASIONS 全集(优先级表不能漏场合)', () => {
    expect([...SCENE_MATCH_ORDER].sort()).toEqual([...OCCASIONS].sort());
  });

  it('每个场合的中文名/方向/关键词都不为空', () => {
    for (const o of OCCASIONS) {
      const rule = SCENE_RULES[o];
      expect(rule.cn.length).toBeGreaterThan(0);
      expect(rule.direction.length).toBeGreaterThan(0);
      expect(rule.keywords.length).toBeGreaterThan(0);
    }
  });

  it('★ 判定结果只有 { label, direction, tags }(多出来的字段都是硬写常量,别加回来)', () => {
    // 曾经有两个字段都不是「算出来的」,而是按分支硬写的常量,已先后删掉:
    //   · `confidence`(0.92/0.72/0.4/0.3)—— 由「用户点没点 chip」决定,调用方本就知道;
    //   · `source`(恒为 'mock',删模块前是 'mock' | 'off')—— 只有一个生产者,读不出信息。
    // 真接了视觉模型、分数变成真的了,再连同这条测试一起改。
    for (const brief of [{}, { occasion: 'stage' }, { sceneText: '面试' }] as const) {
      expect(Object.keys(describeScene(brief)).sort()).toEqual(['direction', 'label', 'tags']);
    }
  });

  it('★ 共享文件里没有运行时 import(前端会直接执行它,加了就会炸)', () => {
    const src = readFileSync(RULES_PATH, 'utf8');
    // 只允许 `import type`(编译期擦除)。注释里的示例写在行首 `*` 之后,不会命中这个正则。
    const runtimeImports = src.match(/^\s*import\s+(?!type\s)/gm) ?? [];
    expect(runtimeImports).toEqual([]);
  });

  it('★ 前端确实配了指向这个文件的 alias(vite.config.js 与后端同源)', () => {
    const viteConfig = readFileSync(
      fileURLToPath(new URL('../../vue/vite.config.js', import.meta.url)),
      'utf8',
    );
    expect(viteConfig).toContain('scene-rules');
    expect(viteConfig).toContain('fs'); // server.fs.allow 放行 server/ 目录
  });
});
