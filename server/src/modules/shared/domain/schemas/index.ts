/**
 * shared/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `briefFields` 是 `MakeupBrief` 里被**多条入口共用**的那几个字段，面向上妆引擎，
 * 属跨模块契约（`contracts/`）。★ 它**只有形状**；行为（枚举白名单、长度上限、trim）
 * 与那两个上限常量都在 `shared/domain/validators/brief-fields.validator.ts`，
 * 两条入口（表单 / 对话）调的是**同一份**。
 */
export { briefFields } from './contracts/brief-fields.js';
