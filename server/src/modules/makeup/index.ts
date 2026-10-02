/**
 * modules/makeup —— 上妆引擎模块(public barrel)。
 * 依赖 shared,`EngineInput` 的输入图一律用 shared 的 `ResolvedImage`,**不依赖别的模块**。
 * 业务「引擎输出校验」也归本模块(贴近 look/引擎契约)。
 */
// ★ `MakeupZone` 虽然也是名义类,但**只导类型**:生产代码里一个构造点都没有
//   (`validateEngineResult` 不构造它 —— 那边面对的是 `unknown`,只查形状;
//   `ImageEngine` 也不产它)。当值导出等于把"随手造一个叠加区"开给全仓。
export type { Look, MakeupZone } from './domain/entities/look.js';
export type { Engine, EngineInput, EngineResult } from './domain/ports/engine.js';
export { validateEngineResult } from './domain/validators/engine-output.validator.js';

// ---- LookSpec:层 A(引擎)与层 B(agent)之间**唯一**的契约(设计文档 §6)----
// ★ 取值仍是占位,见 entities/look-spec.ts 文件头(§15.1 明写枚举「一个都没定」)。
// ★ 前四个是**类**(名义类型),必须当值导出 —— 构造点只有校验器与演示数据两处,
//   见 `entities/look-spec.ts` 里那段「字段不在这里声明」(形状与品牌都来自 schema)。
export {
  ADDED_ZONE_ROLES,
  BROW_SHAPES,
  BrowSpec,
  DEPTHS,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  LookSpec,
  LookSpecBase,
  // ✏️ 2026-10-01:此前没导出过。`read_style_recipe` 要报"这套配方还要求哪些区",
  //   而那句话的起点是"哪几格每套都必填"——就是这三个(`brow` 不在 `ZONE_ROLES` 里)。
  MEASURED_ZONE_ROLES,
  SATURATIONS,
  TONE_KEYS,
  WARMTH_MAX,
  WARMTH_MIN,
  ZONE_ROLES,
  ZoneSpec,
} from './domain/entities/look-spec.js';
export type {
  AddedZoneRole,
  BrowShape,
  Depth,
  Finish,
  Intensity,
  Saturation,
  ToneKey,
  ZoneRole,
} from './domain/entities/look-spec.js';
export { lookSpecSchema } from './domain/schemas/index.js';
// ★ **色域表不再从这里导出**(`TONE_KEYS_BY_SKIN_TONE` 已删):档位表进了词表目录,
//   要按肤色取色域请走 `SkinTonePalette` 端口,由组装根注入。
export { validateLookSpec, validateStyleRead } from './domain/validators/look-spec.validator.js';
// ★ `RequiredZone` = 「本套配方该有哪些区」。调用方(`agent`)算好传进 `validateLookSpec`,
//   本模块不认识配方、也不许认识(§7.1),所以这个类型必须公开。
export type { RequiredZone } from './domain/validators/look-spec.validator.js';
export {
  validateFaceReading,
  validateSceneReading,
  validateStyleReading,
} from './domain/validators/analysis.validator.js';
export type { SkinTonePalette } from './domain/ports/skin-tone-palette.js';
export { StyleRead } from './domain/entities/style-read.js';

// ---- 读图:一个接口 + 三个 case(见 `domain/ports/analyzer.ts`)----
// ★ schema 与 type 成对导出(§4.1)。`style` 的回复形状就是 `StyleRead`,不另起名字。
export { faceReadingSchema, sceneReadingSchema, styleReadSchema } from './domain/schemas/index.js';
export type { FaceReadingRaw, SceneReadingRaw, StyleReadRaw } from './domain/schemas/index.js';
export type { AnalyzeCase, AnalyzeInput, AnalysisOf, ImageAnalyzer, Analyzers } from './domain/ports/analyzer.js';

// ---- 读图的实现:一个端口 + 三个适配器 ----
// ★ 三个提示词常量之所以导出,是为了**测试能钉住它们**:Part 6 有一条
//   「提示词里的枚举 token 与元组一致」的漂移测试,输入就是这三个。
export type { VisionClient, VisionRequest } from './domain/ports/vision.js';
export { DashScopeVision } from './infrastructure/vision/dashscope-vision.js';
export type { DashScopeVisionOptions } from './infrastructure/vision/dashscope-vision.js';
export { FACE_PROMPT, FaceAnalyzer } from './infrastructure/vision/face-analyzer.js';
export { SCENE_PROMPT, SceneAnalyzer } from './infrastructure/vision/scene-analyzer.js';
export { STYLE_PROMPT, StyleAnalyzer } from './infrastructure/vision/style-analyzer.js';
// ★ 把 LookSpec 讲成人话——砍掉 CSS 预览后它是「预览」的替代品(设计文档 §7.4.2)。
export { describeLook, describeStyleRead } from './application/look-description.js';

// ---- 引擎实现(真出图)----
export { ImageEngine } from './infrastructure/engine/image-engine.js';
export type { ImageEngineOptions } from './infrastructure/engine/image-engine.js';

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

// ---- 请求组装 ----
// ★ 公开的理由:"发出去的请求长什么样"要能在单测里当场断言,不必花一次钱、等一次响应。
export { buildGenerateRequest } from './infrastructure/engine/qwen-request.js';
export type { GenerateRequest, QwenRequestOptions } from './infrastructure/engine/qwen-request.js';

export { createMakeupModule } from './compose.js';
export type {
  MakeupModuleOptions,
  MakeupModuleServices,
  VisionAnalyzerKind,
} from './compose.js';
