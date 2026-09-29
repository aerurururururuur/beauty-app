/**
 * test/helpers/fakes.ts —— 用例单测用的内存假端口。
 *
 * ★ **每个导出都要有活着的消费者。** 删到只剩这些时顺手清过一轮:
 *   `memFile` / `FakeJobRepository` / `FakeArtifactStore` / `FakeQueue` /
 *   `FakeReferenceProvider` / `FakeEngine` / `ThrowingEngine` 随 jobs 与 references
 *   两个模块的删除一起变死,已移除。`Engine` 那类假实现现在由
 *   `agent-render.test.ts` / `demo-llm.test.ts` 各自就地定义(它们要记录输入,形状不同)。
 */
import type {
  PasswordHasher,
  User,
  UserRepository,
} from '../../src/modules/user/index.js';
import type {
  WeatherProvider,
  WeatherResult,
} from '../../src/modules/weather/index.js';
import type {
  CosmeticItem,
  CosmeticRepository,
  UserDirectory,
} from '../../src/modules/cabinet/index.js';
import { LookSpecBase, StyleRead, ZoneSpec } from '../../src/modules/makeup/index.js';
import type {
  AnalysisOf,
  AnalyzeCase,
  AnalyzeInput,
  Analyzers,
  ImageAnalyzer,
  VisionClient,
  VisionRequest,
} from '../../src/modules/makeup/index.js';
import type { Occasion, ResolvedImage, SkinTone } from '../../src/modules/shared/index.js';

/** 固定返回值(或固定抛错)的天气源,用来测用例的错误翻译。 */
export class FakeWeatherProvider implements WeatherProvider {
  readonly name = 'fake';
  calls = 0;

  constructor(private readonly outcome: WeatherResult | Error) {}

  async fetch(): Promise<WeatherResult> {
    this.calls += 1;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

export class FakeUserRepository implements UserRepository {
  private map = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.map.set(user.id, user);
  }
  async findById(id: string): Promise<User | null> {
    return this.map.get(id) ?? null;
  }
  async findByNickname(nickname: string): Promise<User | null> {
    return [...this.map.values()].find((u) => u.nickname === nickname) ?? null;
  }
  /** 断言辅助:取原始记录(含凭据)。 */
  get(id: string): User | undefined {
    return this.map.get(id);
  }
}

/** 测试用「哈希」:不真算,把明文原样编码,便于断言调用链是否真的过了哈希。 */
export class FakePasswordHasher implements PasswordHasher {
  static readonly PREFIX = 'fake-hash:';

  async hash(plain: string): Promise<string> {
    return `${FakePasswordHasher.PREFIX}${plain}`;
  }
  async verify(plain: string, encoded: string): Promise<boolean> {
    return encoded === `${FakePasswordHasher.PREFIX}${plain}`;
  }
}

export class FakeCosmeticRepository implements CosmeticRepository {
  private map = new Map<string, CosmeticItem>();

  async save(item: CosmeticItem): Promise<void> {
    this.map.set(item.id, item);
  }
  async findById(id: string): Promise<CosmeticItem | null> {
    return this.map.get(id) ?? null;
  }
  async listByUser(userId: string): Promise<CosmeticItem[]> {
    return [...this.map.values()].filter((item) => item.userId === userId);
  }
  async remove(id: string): Promise<void> {
    this.map.delete(id);
  }
  /** 断言辅助:表里现有条目数(跨全部用户)。 */
  size(): number {
    return this.map.size;
  }
}

/** 归属目录假实现:构造时给定「存在的用户 id 集合」。 */
export class FakeUserDirectory implements UserDirectory {
  constructor(private readonly ids: readonly string[] = []) {}

  async exists(userId: string): Promise<boolean> {
    return this.ids.includes(userId);
  }
}

// ── 读图(✏️ 2026-09-29:用户点触发分析那一轮)────────────────────────────────

/**
 * 假的多模态客户端:**按队列回话,并记下每一次请求**。
 *
 * ★ 队列而不是单个固定值:"先越界、再合法"这种序列要有地方写得出来。
 * ★ `calls` 是这组测试的主要断言对象 —— 尤其「用户填的优先」那条要断言的是
 *   **一次都没调**,而不是"调了但结果没用"。
 * ⚠️ 队列空了会抛:漏写一次预期调用时,失败点落在**这里**,
 *   而不是落在一条看起来"结果也对"的断言上。
 */
export class FakeVisionClient implements VisionClient {
  readonly name = 'fake-vision';
  readonly calls: VisionRequest[] = [];
  private readonly queue: (string | Error)[];

  constructor(...replies: (string | Error)[]) {
    this.queue = replies;
  }

  async ask(request: VisionRequest): Promise<string> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error('FakeVisionClient:没有更多预设回话了(测试少写了一次调用)');
    }
    if (next instanceof Error) throw next;
    return next;
  }
}

/** 一份合法的风格读数。★ 闭集值必须走构造器(见 `entities/look-spec.ts`)。 */
export const SAMPLE_STYLE_READ = new StyleRead({
  base: new LookSpecBase({ coverage: 3, finish: 'satin', warmth: 0 }),
  zones: {
    lip: new ZoneSpec({ tone: 'rose', finish: 'matte', intensity: 3 }),
    cheek: new ZoneSpec({ tone: 'coral', finish: 'satin', intensity: 2 }),
    eyeshadow: new ZoneSpec({ tone: 'nude', finish: 'satin', intensity: 2 }),
  },
});

/**
 * 三个 case 的假适配器。
 *
 * ★ **运行时刻意没有与它对应的 `VISION_ANALYZER=mock`。** 引擎的 mock 是安全的
 *   (产物就是输入照,假得看得见);而分析的 mock 是**造一个结论**,一个编出来的
 *   肤色会一路流进妆面单和提示词,**假得看不见**。所以假货只活在 `test/`。
 */
export class FakeAnalyzers implements Analyzers {
  /** 每次 `read` 的 case,**按调用顺序**。 */
  readonly calls: AnalyzeCase[] = [];
  /** 每次 `read` 收到的输入图(验"交给分析器的是解析出来的本机路径")。 */
  readonly images: ResolvedImage[] = [];
  /** 置一个错则三个 `read` 都抛(验"分析失败也照样记账"那一支)。 */
  failWith: Error | undefined;
  skinTone: SkinTone = 'warm_ivory';
  occasion: Occasion = 'daily';
  styleRead: StyleRead = SAMPLE_STYLE_READ;

  readonly face: ImageAnalyzer<'face'> = {
    case: 'face',
    read: (input) => this.run('face', input, { skinTone: this.skinTone }),
  };
  readonly scene: ImageAnalyzer<'scene'> = {
    case: 'scene',
    read: (input) => this.run('scene', input, { occasion: this.occasion }),
  };
  readonly style: ImageAnalyzer<'style'> = {
    case: 'style',
    read: (input) => this.run('style', input, this.styleRead),
  };

  private async run<C extends AnalyzeCase>(
    kind: C,
    input: AnalyzeInput,
    out: AnalysisOf[C],
  ): Promise<AnalysisOf[C]> {
    this.calls.push(kind);
    this.images.push(input.image);
    if (this.failWith) throw this.failWith;
    return out;
  }
}
