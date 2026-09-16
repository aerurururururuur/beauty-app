/**
 * modules/makeup/compose.ts —— 组合根。
 * 按 `kind` 分发引擎实现,产物仍由 `domain/validators/engine-output.validator.ts` 把关。
 * 流水线 / agent / 控制器都不感知具体是哪一家引擎。
 *
 * 形状照 `agent/compose.ts`(那边也是照 `weather/compose.ts` 来的:
 * `kind` union 在本模块**独立声明**,免得业务模块反向依赖组装层的配置类型;两处要一起改)。
 *
 * ★ **2026-09-16:这个开关第一次变成真的。** 此前 `MAKEUP_ENGINE` 是一个纯摆设——
 *   `createMakeupModule()` 不收任何参数,永远返回 `MockEngine`,而 `src/index.ts` 与
 *   `server/README.md` 都明写了它"尚未接线"。现在它有第三条分支了,
 *   而且**三条分支里没有一条是假开关**(没有 `off`,理由见下)。
 */
import type { Engine } from './domain/ports/engine.js';
import { MockEngine } from './infrastructure/engine/mock-engine.js';
import { ImageEngine } from './infrastructure/engine/image-engine.js';
import { ReplayEngine } from './infrastructure/engine/replay-engine.js';

/**
 * 上妆引擎开关。与 `shared/infrastructure/config.ts` 的 `MakeupEngineKind` 同形
 * (那边读 `MAKEUP_ENGINE`)。
 *
 * ★ **刻意没有 `off`。** 流水线没有引擎就出不了成品,硬接一个 off 分支只会得到
 *   又一个假开关——这句从 `server/README.md` 到 `src/index.ts` 已经写过三遍,不再重复。
 *
 * ★ **`replay` 与 `mock` 不是一类东西,别混:**
 *   - `mock` 是**骨架**,任何输入都返回,用来让端到端流程能跑通;
 *   - `replay` 是**回放**,只认录过的输入,**未命中就报错**(§5.4)。
 *   两者都不联网、都不出账单,但 `mock` 会"假装成功",`replay` 不会——这正是它存在的意义。
 */
export type MakeupEngineKind = 'mock' | 'qwen' | 'replay';

export interface MakeupModuleOptions {
  /** 缺省 `mock`(不联网、不出账单)。 */
  kind?: MakeupEngineKind;
  /** 成品图落盘目录(引擎写,调用方/ArtifactStore 收编)。 */
  outputDir: string;
  /**
   * 生图模型名。`qwen` 与 `replay` **都要用**:
   * replay 拿它算夹具键,所以**必须与录制时逐字相同**,否则永远未命中。
   */
  model: string;
  /**
   * ★ **仅 `qwen` 用。`replay` 不需要 key——它不发请求。**
   * 把这两件事分开是有意的:如果 replay 也要求 key,离线 CI 就得配一个假 key,
   * 而"CI 里挂一个从没被用到的 secret"迟早会被人当成真的在用。
   *
   * ⚠️ `apiKey` **不进 `ServerConfig`**(见 `config.ts` 里 `readDashScopeApiKey` 的注释):
   * 那个对象会被传进 `buildApp` 并挂在 `app` 上,任何一次调试式日志都会把它打出来。
   */
  qwen?: {
    apiKey: string;
    apiHost: string;
    timeoutMs?: number;
  };
  /** 夹具目录:`qwen` 时给了就**录**,`replay` 时**必填**。 */
  fixturesDir?: string;
}

export interface MakeupModuleServices {
  engine: Engine;
}

export function createMakeupModule(options: MakeupModuleOptions): MakeupModuleServices {
  return { engine: buildEngine(options) };
}

function buildEngine(options: MakeupModuleOptions): Engine {
  const kind = options.kind ?? 'mock';

  if (kind === 'mock') return new MockEngine();

  if (kind === 'replay') {
    if (!options.fixturesDir) {
      // ★ 启动即失败,不留到第一次出图才炸。理由同 `agent/compose.ts` 缺 key 那一段:
      //   **配置错了却"能启动",是最容易拖到演示当天才炸的一类问题。**
      //   而 replay 缺目录尤其糟——它会"看起来在跑",直到某个具体输入才报未命中。
      throw new Error(
        'MAKEUP_ENGINE=replay 但没有设 MAKEUP_FIXTURES_DIR。' +
          '回放必须有夹具目录;请指向录好的那一个,或把 MAKEUP_ENGINE 设回 mock。',
      );
    }
    return new ReplayEngine({
      fixturesDir: options.fixturesDir,
      outputDir: options.outputDir,
      model: options.model,
    });
  }

  const qwen = options.qwen;
  if (!qwen || !qwen.apiKey) {
    // 同一条规矩:启动即失败。
    throw new Error(
      'MAKEUP_ENGINE=qwen 但没有拿到 DASHSCOPE_API_KEY。' +
        '请在 .env 里填上,或把 MAKEUP_ENGINE 设回 mock 走骨架引擎。',
    );
  }
  return new ImageEngine({
    apiKey: qwen.apiKey,
    apiHost: qwen.apiHost,
    model: options.model,
    outputDir: options.outputDir,
    ...(qwen.timeoutMs !== undefined ? { timeoutMs: qwen.timeoutMs } : {}),
    // ★ 给了才录(缺省不写盘,见 `image-engine.ts` 里 fixturesDir 的注释)。
    ...(options.fixturesDir ? { fixturesDir: options.fixturesDir } : {}),
  });
}
