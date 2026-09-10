/**
 * modules/references/compose.ts —— 组合根。
 * 按 config.referenceProvider 分发实现:
 *   mock —— 预设的场合化示意条目;
 *   off  —— 不检索,回空列表(结果页随之不渲染参考区)。
 * 未来接网页/图库检索时在此换实现,业务层不感知。
 */
import { MockReferenceProvider } from './infrastructure/reference-provider/mock-reference-provider.js';
import { OffReferenceProvider } from './infrastructure/reference-provider/off-reference-provider.js';
import type { ReferenceProvider } from './domain/ports/reference-provider.js';

/**
 * 参考源开关。与 `shared/infrastructure/config.ts` 的 `referenceProvider` 同形
 * (那边读 REFERENCE_PROVIDER 环境变量);此处独立声明,避免模块反向依赖组装层的配置类型。
 * 两处要一起改。
 */
export type ReferenceProviderKind = 'mock' | 'off';

export interface ReferencesModuleOptions {
  /** 参考源开关(来自 config.referenceProvider)。 */
  kind?: ReferenceProviderKind;
}

export interface ReferencesModuleServices {
  referenceProvider: ReferenceProvider;
}

export function createReferencesModule(
  options: ReferencesModuleOptions = {},
): ReferencesModuleServices {
  const kind = options.kind ?? 'mock';
  const referenceProvider: ReferenceProvider =
    kind === 'off' ? new OffReferenceProvider() : new MockReferenceProvider();
  return { referenceProvider };
}
