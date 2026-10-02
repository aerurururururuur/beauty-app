/**
 * config.test.ts —— 开关取值的解析口径:**认不出来就抛错,不许静默回落**。
 *
 * ★ 2026-10-02:演示模式那三个开关(`MAKEUP_ENGINE` / `WEATHER_PROVIDER` / `AGENT_LLM`)
 *   连同假实现一起删了,现在只剩 `VISION_ANALYZER` 一处在走 `asKind`。
 *   口径不变,而且这个开关**尤其**要抛错:静默回落成 `off` 是"入口消失",
 *   回落成 `real` 是"用户一点就花钱"——两头都不该悄悄发生。
 */
import { describe, expect, it } from 'vitest';
// ★ 直接从实现文件 import,不走 `shared/index.ts` 的 barrel —— `loadConfig` 属于
//   「组装/web shell」的关切,刻意**没有**进那个 barrel(见它的文件头)。
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';

/** 只给要测的那一项,其余全走缺省。`loadConfig` 的每一项都有兜底,不需要完整环境。 */
const envWith = (value: string): NodeJS.ProcessEnv => ({ VISION_ANALYZER: value });

describe('VISION_ANALYZER —— 认不出来 = 启动即失败', () => {
  it('两个取值都认', () => {
    expect(loadConfig(envWith('off')).visionAnalyzer).toBe('off');
    expect(loadConfig(envWith('real')).visionAnalyzer).toBe('real');
  });

  it('★ 不设 = 缺省 off(今天的真实状态就是"没有这个能力")', () => {
    expect(loadConfig({}).visionAnalyzer).toBe('off');
  });

  it('★ 拼错的取值必须抛错,且报错能直接照着改', () => {
    const run = (): void => {
      loadConfig(envWith('on'));
    };
    expect(run).toThrow(/VISION_ANALYZER/);
    const msg = (() => {
      try {
        run();
        return '';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    expect(msg).toContain('on'); // 把拼错的原值打出来,别让人去猜
    expect(msg).toContain('off'); // 合法取值里那个"本来没想写的"
    expect(msg).toContain('real'); // 以及那个"本来想写的"
    expect(msg).toContain('.env.example'); // 去哪儿看完整说明
  });

  it('空串 / 全空白 = 没给,走缺省而不是抛错', () => {
    // 空串是**正常的**形态:`loadDotEnvIfPresent` 会把 `K=` 原样送进来,
    // 而 `.env` 里留一行空的 key 不该让服务起不来(同 `optionalAbsDir` 的口径)。
    expect(loadConfig(envWith('')).visionAnalyzer).toBe('off');
    expect(loadConfig(envWith('   ')).visionAnalyzer).toBe('off');
  });

  it('大小写不认:取值是小写枚举,不是自由文本', () => {
    expect(() => loadConfig(envWith('REAL'))).toThrow(/VISION_ANALYZER/);
  });
});
