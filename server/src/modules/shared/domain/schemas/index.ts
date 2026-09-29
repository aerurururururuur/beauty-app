/**
 * shared/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `briefFields` 是 `MakeupBrief` 里被**多条入口共用**的那几个字段，面向上妆引擎，
 * 属跨模块契约（`contracts/`）。★ 它的**行为**（枚举白名单、上限、trim）不在这里，
 * 在 `shared/domain/validators/brief-fields.validator.ts` —— 三条入口共用同一份。
 */
export { MAX_SCENE_TEXT, MAX_DRESS, briefFields } from './contracts/brief-fields.js';
