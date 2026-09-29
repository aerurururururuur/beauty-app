/**
 * modules/makeup/compose.ts —— 组合根。
 * 按 `kind` 分发引擎实现,产物仍由 `domain/validators/engine-output.validator.ts` 把关。
 * 流水线 / agent / 控制器都不感知具体是哪一家引擎。
 *
 * ★ **两个开关是分开的**:`kind` 管"出不出图",`analyzerKind` 管"读不读图"。
 *   别混成一条 —— 读图在缺省配置下**本来就不存在**,而出图从来都在。
 *
 * 形状照 `agent/compose.ts`(那边也是照 `weather/compose.ts` 来的:
 * `kind` union 在本模块**独立声明**,免得业务模块反向依赖组装层的配置类型;两处要一起改)。
 *
 * ★ **2026-09-16:这个开关第一次变成真的。** 此前 `MAKEUP_ENGINE` 是一个纯摆设——
 *   `createMakeupModule()` 不收任何参数,永远返回 `MockEngine`,而 `src/index.ts` 与
 *   `server/README.md` 都明写了它"尚未接线"。现在它真的按 `kind` 分发了,
 *   而且**两条分支里没有一条是假开关**(没有 `off`,理由见下)。
 */
import type { Engine } from './domain/ports/engine.js';
import type { Analyzers } from './domain/ports/analyzer.js';
import { MockEngine } from './infrastructure/engine/mock-engine.js';
import { ImageEngine } from './infrastructure/engine/image-engine.js';
import { DashScopeVision } from './infrastructure/vision/dashscope-vision.js';
import { FaceAnalyzer } from './infrastructure/vision/face-analyzer.js';
import { SceneAnalyzer } from './infrastructure/vision/scene-analyzer.js';
import { StyleAnalyzer } from './infrastructure/vision/style-analyzer.js';

/**
 * 上妆引擎开关。与 `shared/infrastructure/config.ts` 的 `MakeupEngineKind` 同形
 * (那边读 `MAKEUP_ENGINE`)。
 *
 * ★ **刻意没有 `off`。** 流水线没有引擎就出不了成品,硬接一个 off 分支只会得到
 *   又一个假开关——这句从 `server/README.md` 到 `src/index.ts` 已经写过三遍,不再重复。
 *
 * ★ **取值按「行为」命名,不按厂商**(2026-09-17:`qwen` → `image`)。
 *   两个类本来就按行为命名(`MockEngine` / `ImageEngine`),
 *   只有这个枚举是配置层单方面把厂商名焊了进去。理由与"旧值为什么不做兼容"
 *   见 `shared/infrastructure/config.ts` 的同名 union。
 */
export type MakeupEngineKind = 'mock' | 'image';

/**
 * 读图分析开关。与 `shared/infrastructure/config.ts` 的 `VisionAnalyzerKind` 同形
 * (那边读 `VISION_ANALYZER`)。
 *
 * ★ **可以有 `off`,与上面那个「刻意没有 off」不矛盾**:没有引擎就出不了成品,
 *   而**分析今天本来就等于没有**——`off` 说的是当下的真实状态。
 *   ★ **刻意没有 `mock`**:理由见 `config.ts` 的同名 union(假得看不见)。
 */
export type VisionAnalyzerKind = 'off' | 'real';

export interface MakeupModuleOptions {
  /** 缺省 `mock`(不联网、不出账单)。 */
  kind?: MakeupEngineKind;
  /** 成品图落盘目录(引擎写,调用方/ArtifactStore 收编)。 */
  outputDir: string;
  /** 生图模型名(`image` 用它发请求)。 */
  model: string;
  /**
   * ⚠️ `apiKey` **不进 `ServerConfig`**(见 `config.ts` 里 `readDashScopeApiKey` 的注释):
   * 那个对象会被传进 `buildApp` 并挂在 `app` 上,任何一次调试式日志都会把它打出来。
   *
   * ★ **这个字段名留着厂商名,与 `kind` 的改名不冲突,是故意的。**
   *   `kind` 回答的是"**做什么**"(用真实出图引擎),所以按行为叫 `image`;
   *   而这个包里装的是"**当前那个实现要什么**"——它就是百炼的 key 与域名
   *   (`index.ts` 里填的正是 `readDashScopeApiKey()` / `makeupApiHost`)。
   *   接第二家时该多出的是**同级的第二个凭据包 + 一个选厂商的配置**,
   *   而不是把这个包改名成 `image` 再往里面塞两家的字段。
   */
  qwen?: {
    apiKey: string;
    apiHost: string;
    timeoutMs?: number;
  };
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
    engine: buildEngine(options),
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

function buildEngine(options: MakeupModuleOptions): Engine {
  const kind = options.kind ?? 'mock';

  if (kind === 'mock') return new MockEngine();

  const qwen = options.qwen;
  if (!qwen || !qwen.apiKey) {
    // 同一条规矩:启动即失败。
    throw new Error(
      'MAKEUP_ENGINE=image 但没有拿到 DASHSCOPE_API_KEY。' +
        '请在 .env 里填上,或把 MAKEUP_ENGINE 设回 mock 走骨架引擎。',
    );
  }
  return new ImageEngine({
    apiKey: qwen.apiKey,
    apiHost: qwen.apiHost,
    model: options.model,
    outputDir: options.outputDir,
    ...(qwen.timeoutMs !== undefined ? { timeoutMs: qwen.timeoutMs } : {}),
  });
}
