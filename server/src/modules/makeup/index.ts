/**
 * modules/makeup —— 上妆引擎模块(public barrel)。
 * 依赖 shared;引擎端口还引用 references(参考图)的类型。
 * 业务「文案组装 narration」与「引擎输出校验」也归本模块(都贴近 look/引擎契约)。
 */
export type { Look, MakeupZone } from './domain/entities/look.js';
export type { ResultText } from './domain/entities/result-text.js';
export type { Engine, EngineInput, EngineResult } from './domain/ports/engine.js';
export { validateEngineResult } from './domain/validators/engine-output.validator.js';

// ---- LookSpec:层 A(引擎)与层 B(agent)之间**唯一**的契约(设计文档 §6)----
// ★ 取值仍是占位,见 entities/look-spec.ts 文件头(§15.1 明写枚举「一个都没定」)。
export type {
  BrowShape,
  Finish,
  Intensity,
  LookSpec,
  ToneKey,
  ZoneRole,
  ZoneSpec,
} from './domain/entities/look-spec.js';
export {
  BROW_SHAPES,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  TONE_KEYS,
  WARMTH_MAX,
  WARMTH_MIN,
  ZONE_ROLES,
} from './domain/entities/look-spec.js';
export { lookSpecSchema } from './domain/schemas/look-spec.js';
export { TONE_KEYS_BY_SKIN_TONE, validateLookSpec } from './domain/validators/look-spec.validator.js';
// ★ 把 LookSpec 讲成人话——砍掉 CSS 预览后它是「预览」的替代品(设计文档 §7.4.2)。
export { describeLook } from './application/look-description.js';
export { buildNarrative } from './application/narration.js';

// ---- 引擎实现(三个,**按行为区分,不按厂商区分**:骨架 / 真出图 / 回放)----
export { MockEngine } from './infrastructure/engine/mock-engine.js';
export { ImageEngine } from './infrastructure/engine/image-engine.js';
export type { ImageEngineOptions } from './infrastructure/engine/image-engine.js';
export { ReplayEngine } from './infrastructure/engine/replay-engine.js';
export type { ReplayEngineOptions } from './infrastructure/engine/replay-engine.js';

// ---- 提示词模板:★ 层 A 最该投入的那一块(§5.2)----
// 公开的理由是**它是阶段 1 的验收对象**:禁词扫描(不含构图/服装/背景/几何词)必须能断言。
export {
  IDENTITY_ANCHOR,
  NEGATIVE_PROMPT,
  TEMPLATE_VERSION,
  buildPrompt,
  renderLookClauses,
} from './infrastructure/engine/prompt-builder.js';
export type { PromptOptions } from './infrastructure/engine/prompt-builder.js';

// ---- 请求组装 + 夹具(record/replay,§5.4)----
// ★ 请求组装之所以公开:录像与回放**必须算出同一个键**,单测要能把这一点钉住。
export { buildGenerateRequest, fixtureKeyOf } from './infrastructure/engine/qwen-request.js';
export type { GenerateRequest, QwenRequestOptions } from './infrastructure/engine/qwen-request.js';
export {
  FIXTURE_FORMAT_VERSION,
  readFixture,
  writeFixture,
} from './infrastructure/engine/engine-fixtures.js';
export type { EngineFixture } from './infrastructure/engine/engine-fixtures.js';

export { createMakeupModule } from './compose.js';
export type { MakeupEngineKind, MakeupModuleOptions, MakeupModuleServices } from './compose.js';
