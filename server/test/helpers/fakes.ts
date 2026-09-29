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
