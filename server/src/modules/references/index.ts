/**
 * modules/references —— 参考图检索模块(public barrel)。
 * 给定场景分析,返回按部位标记的参考图条目(imageUrl/sourceUrl/role)。
 * 依赖 shared(类型 + 场合语义);跨模块只经由这里。
 */
export { REFERENCE_ROLES } from './domain/entities/reference.js';
export type { ReferenceImage, ReferenceRole } from './domain/entities/reference.js';
export type { ReferenceProvider } from './domain/ports/reference-provider.js';
export { BingReferenceProvider, DEFAULT_BASE_URL } from './infrastructure/reference-provider/bing-reference-provider.js';
export { parseBingHits } from './infrastructure/reference-provider/parse-bing.js';
export type { BingHit } from './infrastructure/reference-provider/parse-bing.js';
export { MockReferenceProvider } from './infrastructure/reference-provider/mock-reference-provider.js';
export { OffReferenceProvider } from './infrastructure/reference-provider/off-reference-provider.js';
export { createReferencesModule } from './compose.js';
export type {
  ReferenceProviderKind,
  ReferencesModuleOptions,
  ReferencesModuleServices,
} from './compose.js';
