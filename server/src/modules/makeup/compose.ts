/**
 * modules/makeup/compose.ts —— 组合根。
 * 引擎**由调用方造好注入**,产物仍由 `domain/validators/engine-output.validator.ts` 把关。
 * 流水线 / agent / 控制器都不感知具体是哪一家引擎。
 *
 * ★ **`engine` 与 `analyzerKind` 是两件事**:前者管"出不出图"(必填,不注入就没有模块),
 *   后者管"读不读图"(缺省 `off`,读图在缺省配置下**本来就不存在**)。
 */
import type { Engine } from './domain/ports/engine.js';
import type { Analyzers } from './domain/ports/analyzer.js';
import { DashScopeVision } from './infrastructure/vision/dashscope-vision.js';
import { FaceAnalyzer } from './infrastructure/vision/face-analyzer.js';
import { SceneAnalyzer } from './infrastructure/vision/scene-analyzer.js';
import { StyleAnalyzer } from './infrastructure/vision/style-analyzer.js';

/**
 * 读图分析开关。与 `shared/infrastructure/config.ts` 的 `VisionAnalyzerKind` 同形
 * (那边读 `VISION_ANALYZER`)。
 *
 * ★ **可以有 `off`**:读图今天本来就等于没有——`off` 说的是当下的真实状态。
 *   ★ **刻意没有 `mock`**:理由见 `config.ts` 的同名 union(假得看不见)。
 */
export type VisionAnalyzerKind = 'off' | 'real';

export interface MakeupModuleOptions {
  /** 上妆引擎。★ **由组合根造好注入**(`src/index.ts` 的 `ImageEngine`);本模块不再按开关分发。 */
  engine: Engine;
  /** 读图分析。**缺省 `off`**(入口不注册)。 */
  analyzerKind?: VisionAnalyzerKind;
  /**
   * ★ **仅 `real` 用。** 字段名留着厂商名,理由与上面那个 `qwen` 包**逐条相同**
   *   ——它装的是"当前那个实现要什么",不是"做什么"。
   *
   * ⚠️ `baseUrl` 是**兼容模式基址**(形如 `…/compatible-mode/v1`),与 `qwen.apiHost`
   *   (只有域名)不同:对话与读图走 `/chat/completions`,生图走另一套路径。
   */
  vision?: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs?: number;
  };
}

export interface MakeupModuleServices {
  engine: Engine;
  /**
   * 三个读图适配器。**`off` 时整个键不出现**(不是给一个空对象)——
   * 先例是 `PRODUCTS_DIR` 指空 ≡ 关掉产品库(工具不注册):「关掉」要表现为
   * **入口不存在**,而不是"注册了但什么都不发生"。
   */
  analyzers?: Analyzers;
}

export function createMakeupModule(options: MakeupModuleOptions): MakeupModuleServices {
  const analyzers = buildAnalyzers(options);
  return {
    engine: options.engine,
    ...(analyzers ? { analyzers } : {}),
  };
}

/**
 * 按 `analyzerKind` 装配三个适配器。
 *
 * ★ 返回的那个对象**由 `Analyzers` 这个 mapped type 把关**:少配一个 case 编译不过,
 *   而不是留一个"这个 case 没人实现"的洞到运行时才发现。
 */
function buildAnalyzers(options: MakeupModuleOptions): Analyzers | undefined {
  const kind = options.analyzerKind ?? 'off';
  if (kind === 'off') return undefined;

  const vision = options.vision;
  if (!vision || !vision.apiKey) {
    // 同 `buildEngine`:启动即失败,不留到用户点下去那一刻才炸。
    throw new Error(
      'VISION_ANALYZER=real 但没有拿到 DASHSCOPE_API_KEY。' +
        '请在 .env 里填上,或把 VISION_ANALYZER 设回 off(缺省)。',
    );
  }

  const client = new DashScopeVision({
    apiKey: vision.apiKey,
    baseUrl: vision.baseUrl,
    model: vision.model,
    ...(vision.timeoutMs !== undefined ? { timeoutMs: vision.timeoutMs } : {}),
  });
  return {
    face: new FaceAnalyzer(client),
    scene: new SceneAnalyzer(client),
    style: new StyleAnalyzer(client),
  };
}

