/**
 * modules/understanding/compose.ts —— 组合根。
 * 当前只支持 mock;接入真实场景理解(视觉大模型)时按 config.sceneAnalyzer 分发,
 * 仅在 src/index.ts 这里换成别的实现,业务/HTTP 层不感知。
 */
import type { SceneAnalyzer } from './domain/ports/scene-analyzer.js';
import { MockSceneAnalyzer } from './infrastructure/scene-analyzer/mock-scene-analyzer.js';

export interface UnderstandingModuleServices {
  sceneAnalyzer: SceneAnalyzer;
}

export function createUnderstandingModule(): UnderstandingModuleServices {
  return { sceneAnalyzer: new MockSceneAnalyzer() };
}
