/**
 * config.test.ts —— 开关取值的解析口径:**认不出来就抛错,不许静默回落**。
 *
 * 起因之一(2026-09-17):`MAKEUP_ENGINE` 的真出图取值从 `qwen` 改名为 `image`
 * (按行为命名,与 `MockEngine` / `ImageEngine` / `ReplayEngine` 对齐)。
 * 改名本身不危险,**危险的是它怎么失败**:
 *
 * > 老 `.env` 里写着 `MAKEUP_ENGINE=qwen`,新代码不认识 → 静默回落 `mock`
 * > → 服务照常启动、日志干净、出图那一步开始返回原图。
 *
 * 那正是本项目反复点名的"假开关"。
 *
 * ★ **2026-09-18:四个开关一律改成「不认识的取值 = 抛错」**,连同原先静默回落的
 *   `WEATHER_PROVIDER` / `REFERENCE_PROVIDER` / `AGENT_LLM`(`MAKEUP_ENGINE` 当时
 *   只是"回落 + 一声 `warn`",现在也一并抛错)。旧理由——"那三个回落的是增强项或
 *   离线兜底,所以静默没关系"——经不起看:`AGENT_LLM=dashscope` 静默变成 `mock`,
 *   表现是**对话被换成了那段离线脚本**,而服务在跑、端口通、日志干净,
 *   操作的人以为对面是真模型。**一声 `warn` 也拦不住**:日志会被刷过去,
 *   而故障现场在几分钟之后、几十行之外。
 *
 * ⚠️ 所以现在**没有"只警告不抛错"的档位**。注释没法回归,断言可以:
 *   下面这两组用例钉的就是"抛错"本身,以及报错里必须出现什么。
 */
import { describe, expect, it } from 'vitest';
// ★ 直接从实现文件 import,不走 `shared/index.ts` 的 barrel —— `loadConfig` 属于
//   「组装/web shell」的关切,刻意**没有**进那个 barrel(见它的文件头)。
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';

/** 只给要测的那一项,其余全走缺省。`loadConfig` 的每一项都有兜底,不需要完整环境。 */
const envWith = (value: string): NodeJS.ProcessEnv => ({ MAKEUP_ENGINE: value });

describe('MAKEUP_ENGINE —— 取值按行为命名,旧名与错拼都不许静默', () => {
  it('三个当前取值都认', () => {
    expect(loadConfig(envWith('mock')).makeupEngine).toBe('mock');
    expect(loadConfig(envWith('image')).makeupEngine).toBe('image');
    expect(loadConfig(envWith('replay')).makeupEngine).toBe('replay');
  });

  it('★ 不设 = 回落到 mock(离线、不出账单),这不是错误', () => {
    expect(loadConfig({}).makeupEngine).toBe('mock');
  });

  it('★ 旧名 qwen 不再兼容 —— 与拼错的值一视同仁', () => {
    // 不留别名:留着等于同时存在两个"合法"取值,而其中一个在文档、`.env.example`、
    // `MakeupEngineKind` 里都不存在。代价是老的 .env 会让服务**起不来**,
    // 而那正是要的:它总比"起来了但出图是假的"早一步暴露。
    expect(() => loadConfig(envWith('qwen'))).toThrow(/MAKEUP_ENGINE/);
  });

  it('★ 拼错的取值必须抛错,且报错要能直接照着改', () => {
    const err = (() => {
      try {
        loadConfig(envWith('images'));
        return '';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    expect(err).toContain('MAKEUP_ENGINE'); // 哪一项错了
    expect(err).toContain('images'); // 把拼错的原值打出来,别让人去猜
    expect(err).toContain('mock'); // 合法取值里那个"本来没想写的"
    expect(err).toContain('image'); // 以及那个"本来想写的"
    expect(err).toContain('replay');
    expect(err).toContain('.env.example'); // 去哪儿看完整说明
  });
});

describe('★ 四个开关同一个口径:认不出来 = 启动即失败', () => {
  // 每项:[环境变量名, 一个不认识的取值, 必须出现在报错里的合法取值]
  const CASES: Array<[string, string, string[]]> = [
    ['MAKEUP_ENGINE', 'qwen', ['mock', 'image', 'replay']],
    ['WEATHER_PROVIDER', 'open-meteo', ['mock', 'live']],
    ['REFERENCE_PROVIDER', 'bing', ['mock', 'live']],
    ['AGENT_LLM', 'dashscope', ['mock', 'real']],
  ];

  for (const [key, bogus, valid] of CASES) {
    it(`${key}=${bogus} 抛错,并列出合法取值`, () => {
      const run = (): void => loadConfig({ [key]: bogus });
      expect(run).toThrow(new RegExp(key));
      const msg = (() => {
        try {
          run();
          return '';
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      })();
      expect(msg).toContain(bogus);
      for (const v of valid) expect(msg).toContain(v);
    });

    it(`${key} 留空 / 全空白 = 没给,走缺省而不是抛错`, () => {
      // 空串是**正常的**形态:`loadDotEnvIfPresent` 会把 `K=` 原样送进来,
      // 而 `.env` 里留一行空的 key 不该让服务起不来(同 `optionalAbsDir` 的口径)。
      expect(() => loadConfig({ [key]: '' })).not.toThrow();
      expect(() => loadConfig({ [key]: '   ' })).not.toThrow();
    });
  }

  it('大小写不认:取值是小写枚举,不是自由文本', () => {
    expect(() => loadConfig({ AGENT_LLM: 'REAL' })).toThrow(/AGENT_LLM/);
  });
});
