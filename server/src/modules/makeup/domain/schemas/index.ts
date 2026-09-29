/**
 * makeup/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `LookSpec` 是妆容引擎的跨模块契约（agent 按它调引擎），故进 `contracts/`；
 * makeup 没有 HTTP 面，也就没有 `api/`。数值界（intensity / warmth）在
 * `domain/validators/look-spec.validator.ts`。
 */
export { lookSpecSchema, styleReadSchema } from './contracts/look-spec.js';
export type { LookSpecRaw, StyleReadRaw } from './contracts/look-spec.js';

// 读图回复的形状(边界,见 `contracts/analysis.ts`)。★ schema 与 type 成对导出(§4.1)。
export { faceReadingSchema, sceneReadingSchema } from './contracts/analysis.js';
export type { FaceReadingRaw, SceneReadingRaw } from './contracts/analysis.js';
