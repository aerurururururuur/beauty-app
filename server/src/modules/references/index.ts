/**
 * modules/references —— 参考妆面检索模块(public barrel)。
 * 给定场景分析,返回带授权来源标注的参考图条目(license/sourceUrl 诚实红线)。
 * 依赖 shared(类型);跨模块只经由这里。
 */
export type { ReferenceImage } from './domain/entities/reference.js';
export type { ReferenceProvider } from './domain/ports/reference-provider.js';
export { MockReferenceProvider } from './infrastructure/reference-provider/mock-reference-provider.js';
export { OffReferenceProvider } from './infrastructure/reference-provider/off-reference-provider.js';
export { createReferencesModule } from './compose.js';
export type {
  ReferenceProviderKind,
  ReferencesModuleOptions,
  ReferencesModuleServices,
} from './compose.js';
