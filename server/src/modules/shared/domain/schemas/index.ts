/**
 * shared/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `briefFields` 是 `MakeupBrief` 里被**多条入口共用**的那几个字段，面向上妆引擎，
 * 属跨模块契约（`contracts/`）。★ 它**只有形状**；行为（枚举白名单、长度上限、trim）
 * 与那两个上限常量都在 `shared/domain/validators/brief-fields.validator.ts`，
 * 两条入口（表单 / 对话）调的是**同一份**。
 */
export { briefFields } from './contracts/brief-fields.js';

// ★ 只有形状(§4.2):`ImageRef` 由 artifact-store 直接构造,不经 zod 解析;
//   进了这份 schema 是为了让**三个用它**的模块共用一份形状(§4.1),
//   不是因为它现在要开始校验什么。真正需要解析的那天自然会有人来改这一行。
export { imageRefSchema } from './contracts/image-ref.js';
export type { ImageRef } from './contracts/image-ref.js';
