/**
 * makeup/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `LookSpec` 是妆容引擎的跨模块契约（agent 按它调引擎），故进 `contracts/`；
 * makeup 没有 HTTP 面，也就没有 `api/`。数值界（intensity / warmth）在
 * `domain/validators/look-spec.validator.ts`。
 */
export { lookSpecSchema } from './contracts/look-spec.js';
export type { LookSpecRaw } from './contracts/look-spec.js';
