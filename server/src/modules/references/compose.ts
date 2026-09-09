/**
 * modules/references/compose.ts —— 组合根。
 * 当前只支持 mock(预设场合化示意条目);未来接网页/图库检索在此换实现。
 */
import type { ReferenceProvider } from './domain/ports/reference-provider.js';
import { MockReferenceProvider } from './infrastructure/reference-provider/mock-reference-provider.js';

export interface ReferencesModuleServices {
  referenceProvider: ReferenceProvider;
}

export function createReferencesModule(): ReferencesModuleServices {
  return { referenceProvider: new MockReferenceProvider() };
}
