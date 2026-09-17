/**
 * config.test.ts —— 配置解析里**唯一一处会喊的开关**。
 *
 * 起因(2026-09-17):`MAKEUP_ENGINE` 的真出图取值从 `qwen` 改名为 `image`
 * (按行为命名,与 `MockEngine` / `ImageEngine` / `ReplayEngine` 对齐)。
 * 改名本身不危险,**危险的是它怎么失败**:
 *
 * > 老 `.env` 里写着 `MAKEUP_ENGINE=qwen`,新代码不认识 → 静默回落 `mock`
 * > → 服务照常启动、日志干净、出图那一步开始返回原图。
 *
 * 那正是本项目反复点名的"假开关"。所以这个开关**不认识的取值必须出声**,
 * 而这一组用例就是把"出声"这件事钉住的 —— 注释没法回归,断言可以。
 *
 * ⚠️ 其余 `as*Kind`(`asWeatherKind` / `asReferenceKind` / `asAgentLlmKind`)
 *    **刻意仍是静默回落**,别照抄这组用例去改它们:那三个回落的是增强项或离线兜底,
 *    而这个回落的是"出图变成了假的"。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// ★ 直接从实现文件 import,不走 `shared/index.ts` 的 barrel —— `loadConfig` 属于
//   「组装/web shell」的关切,刻意**没有**进那个 barrel(见它的文件头)。
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';

/** 只给要测的那一项,其余全走缺省。`loadConfig` 的每一项都有兜底,不需要完整环境。 */
const envWith = (value: string): NodeJS.ProcessEnv => ({ MAKEUP_ENGINE: value });

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('MAKEUP_ENGINE —— 取值按行为命名,旧名与错拼都不许静默', () => {
  it('三个当前取值都认', () => {
    expect(loadConfig(envWith('mock')).makeupEngine).toBe('mock');
    expect(loadConfig(envWith('image')).makeupEngine).toBe('image');
    expect(loadConfig(envWith('replay')).makeupEngine).toBe('replay');
    expect(warn).not.toHaveBeenCalled();
  });

  it('★ 不设 = 回落到 mock(离线、不出账单),且不算异常,不喊', () => {
    expect(loadConfig({}).makeupEngine).toBe('mock');
    expect(warn).not.toHaveBeenCalled();
  });

  it('★ 旧名 qwen 不再兼容 —— 与拼错的值一视同仁', () => {
    // 不留别名:留着等于同时存在两个"合法"取值,而其中一个在文档、`.env.example`、
    // `MakeupEngineKind` 里都不存在。代价是老的 .env 会回落 mock,所以下面那条断言
    // (必须喊)才是这条路的全部安全性所在。
    expect(loadConfig(envWith('qwen')).makeupEngine).toBe('mock');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('qwen');
  });

  it('★ 拼错的取值不许静默变成 mock —— 那样出图会悄悄返回原图', () => {
    expect(loadConfig(envWith('images')).makeupEngine).toBe('mock');
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('images'); // 把拼错的原值打出来,别让人去猜
    expect(msg).toContain('mock'); // 说清回落到了哪里
    expect(msg).toContain('image'); // 并且点明合法取值里有那个"本来想写的"
  });
});
