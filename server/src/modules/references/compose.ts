/**
 * modules/references/compose.ts —— 组合根。
 * 按 config.referenceProvider 分发实现:
 *   bing —— 检索外部站点(基址由 REFERENCE_BASE_URL 配,见下);
 *   mock —— 预设的场合化条目,给不出图片地址(离线兜底);
 *   off  —— 不检索,回空列表(结果页随之不渲染参考区)。
 * 换实现只动这里,业务层(jobs 流水线)不感知。
 */
import { BingReferenceProvider, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from './infrastructure/reference-provider/bing-reference-provider.js';
import { MockReferenceProvider } from './infrastructure/reference-provider/mock-reference-provider.js';
import { OffReferenceProvider } from './infrastructure/reference-provider/off-reference-provider.js';
import type { ReferenceProvider } from './domain/ports/reference-provider.js';

/**
 * 参考源开关。与 `shared/infrastructure/config.ts` 的同名 union 同形
 * (那边读 REFERENCE_PROVIDER 环境变量);此处独立声明,避免模块反向依赖组装层的配置类型。
 * 两处要一起改。
 */
export type ReferenceProviderKind = 'mock' | 'off' | 'bing';

export interface ReferencesModuleOptions {
  /** 参考源开关(来自 config.referenceProvider)。 */
  kind?: ReferenceProviderKind;
  /**
   * 检索站点基址(来自 config.referenceBaseUrl / REFERENCE_BASE_URL)。
   * ★ 之所以做成配置项:部署环境(如魔搭创空间)的出站策略与本机不同,
   *   换站点 / 换镜像 / 指向自建代理都不该改代码。仅 kind='bing' 用。
   */
  baseUrl?: string;
  /** 检索超时毫秒;仅 kind='bing' 用。 */
  timeoutMs?: number;
}

export interface ReferencesModuleServices {
  referenceProvider: ReferenceProvider;
}

export function createReferencesModule(
  options: ReferencesModuleOptions = {},
): ReferencesModuleServices {
  const kind = options.kind ?? 'mock';
  const referenceProvider: ReferenceProvider = (() => {
    switch (kind) {
      case 'bing':
        return new BingReferenceProvider(options.baseUrl ?? DEFAULT_BASE_URL, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      case 'off':
        return new OffReferenceProvider();
      default:
        return new MockReferenceProvider();
    }
  })();
  return { referenceProvider };
}
