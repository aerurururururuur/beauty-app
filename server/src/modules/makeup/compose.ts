/**
 * modules/makeup/compose.ts —— 组合根。
 * 当前只支持 mock;接入参数化上妆 / 第三方图像 API 时按 config.makeupEngine 分发,
 * 实现 domain/ports/engine.ts 即可,产物仍由 engine-output.validator 把关。
 */
import type { Engine } from './domain/ports/engine.js';
import { MockEngine } from './infrastructure/engine/mock-engine.js';

export interface MakeupModuleServices {
  engine: Engine;
}

export function createMakeupModule(): MakeupModuleServices {
  return { engine: new MockEngine() };
}
