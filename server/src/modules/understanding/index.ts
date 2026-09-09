/**
 * modules/understanding —— 场景理解模块(public barrel)。
 * 把用户需求简报 brief(occasion / 自由文字)翻译成妆容方向。
 * 跨模块协作只经由这里;依赖 shared。可选缝:未来视觉大模型读可选氛围图。
 */
export type { SceneAnalysis } from './domain/entities/scene.js';
export type { SceneAnalyzer, SceneAnalyzerInput } from './domain/ports/scene-analyzer.js';
export { MockSceneAnalyzer } from './infrastructure/scene-analyzer/mock-scene-analyzer.js';
export { createUnderstandingModule } from './compose.js';
export type { UnderstandingModuleServices } from './compose.js';
