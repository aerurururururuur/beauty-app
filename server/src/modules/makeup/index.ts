/**
 * modules/makeup —— 上妆引擎模块(public barrel)。
 * 依赖 shared;引擎端口还引用 understanding(场景)与 references(参考图)的类型。
 * 业务「文案组装 narration」与「引擎输出校验」也归本模块(都贴近 look/引擎契约)。
 */
export type { Look, MakeupZone } from './domain/entities/look.js';
export type { ResultText } from './domain/entities/result-text.js';
export type { Engine, EngineInput, EngineResult } from './domain/ports/engine.js';
export { validateEngineResult } from './domain/validators/engine-output.validator.js';
export { buildNarrative } from './application/narration.js';
export { MockEngine } from './infrastructure/engine/mock-engine.js';
export { createMakeupModule } from './compose.js';
export type { MakeupModuleServices } from './compose.js';
