/**
 * makeup/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `LookSpec` 是妆容引擎的跨模块契约（agent 按它调引擎），故进 `contracts/`；
 * makeup 没有 HTTP 面，也就没有 `api/`。数值界（intensity / warmth）在
 * `domain/validators/look-spec.validator.ts`。
 */
// ★ 值只导出**带品牌**的那两份(`lookSpecSchema` / `styleReadSchema`)——它们是这个契约
//   对外的形状,`validators/look-spec.validator.ts` 用它 `safeParse`。
//   三个子形状(`zoneSchema` / `baseSchema` / `browSchema`)只出类型:实体 `extends` 它们,
//   但没有任何调用点需要拿它们 parse。⚠️ 那三份**未加品牌的 row 更不许拿出去当契约**
//   (宽 `string` / `number`,一条取值都没查),它们只是构造参数的类型 —— 见 `contracts/look-spec.ts` 文件头。
export { lookSpecSchema, styleReadSchema } from './contracts/look-spec.js';
export type {
  BaseRow,
  BrowRow,
  BrowSpecShape,
  LookSpecBaseShape,
  LookSpecRaw,
  LookSpecShape,
  StyleReadRaw,
  StyleReadShape,
  ZoneRow,
  ZoneSpecShape,
} from './contracts/look-spec.js';

// 读图回复的形状(边界,见 `contracts/analysis.ts`)。★ schema 与 type 成对导出(§4.1)。
export { faceReadingSchema, sceneReadingSchema } from './contracts/analysis.js';
export type { FaceReadingRaw, SceneReadingRaw } from './contracts/analysis.js';

// 叠加区的形状(实体,见 `entities/makeup-zone.ts`)。★ **只出类型**:这份 schema 谁也不 parse
//   —— 它存在是为了给 `domain/entities/look.ts` 的 `MakeupZone` 一份"形状的单源",
//   真正在多处跑的校验是 `validators/engine-output.validator.ts` 的 `assertZone`(面对 `unknown`)。
export type { MakeupZoneRow, MakeupZoneShape } from './entities/makeup-zone.js';
