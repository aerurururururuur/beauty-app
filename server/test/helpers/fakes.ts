/**
 * test/helpers/fakes.ts —— 用例单测用的内存假端口。
 */
import { Readable } from 'node:stream';
import type { ImageRef, SceneDescriptor } from '../../src/modules/shared/index.js';
import type { JobRecord } from '../../src/modules/jobs/index.js';
import type { ReferenceImage } from '../../src/modules/references/index.js';
import type {
  ArtifactStore,
  StoredResult,
  UploadFile,
} from '../../src/modules/assets/index.js';
import type { JobQueue, JobRepository } from '../../src/modules/jobs/index.js';
import type { Engine, EngineInput, EngineResult } from '../../src/modules/makeup/index.js';
import type { ReferenceProvider } from '../../src/modules/references/index.js';
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

export function memFile(
  originalName = 'me.png',
  mimeType = 'image/png',
  data = 'fake-bytes',
): UploadFile {
  return { originalName, mimeType, stream: Readable.from([data]) };
}

export class FakeJobRepository implements JobRepository {
  private map = new Map<string, JobRecord>();

  async create(record: JobRecord): Promise<void> {
    this.map.set(record.id, record);
  }
  async find(id: string): Promise<JobRecord | null> {
    return this.map.get(id) ?? null;
  }
  async update(id: string, mutate: (prev: JobRecord) => JobRecord): Promise<JobRecord> {
    const prev = this.map.get(id);
    if (!prev) throw new Error(`job ${id} 不存在`);
    const next = mutate(prev);
    this.map.set(id, next);
    return next;
  }
  get(id: string): JobRecord | undefined {
    return this.map.get(id);
  }
}

export class FakeArtifactStore implements ArtifactStore {
  private files = new Map<string, { data: Buffer; mimeType: string }>();
  private seq = 0;

  async putInputFile(jobId: string, kind: 'face' | 'scene', file: UploadFile): Promise<ImageRef> {
    const data = await collectStream(file.stream);
    const key = `inputs/${jobId}/${kind}/${++this.seq}`;
    this.files.set(key, { data, mimeType: file.mimeType });
    return { storeKey: key, mimeType: file.mimeType, originalName: file.originalName };
  }

  async putResult(jobId: string, sourceFilePath: string, mimeType: string): Promise<StoredResult> {
    // 假实现不真正复制文件;仅登记结果。
    const key = `results/${jobId}/result`;
    this.files.set(key, { data: Buffer.from(`result-of:${sourceFilePath}`), mimeType });
    return { ref: { storeKey: key, mimeType }, url: `/jobs/${jobId}/result` };
  }

  async resolveToFilePath(_jobId: string): Promise<string> {
    return 'mem://face.png';
  }

  async readResult(jobId: string): Promise<{ stream: Readable; mimeType: string } | null> {
    const entry = this.files.get(`results/${jobId}/result`);
    return entry ? { stream: Readable.from(entry.data), mimeType: entry.mimeType } : null;
  }

  /** 断言辅助:已登记文件数。 */
  fileCount(): number {
    return this.files.size;
  }
}

function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export class FakeQueue implements JobQueue {
  readonly enqueued: string[] = [];
  enqueue(jobId: string): void {
    this.enqueued.push(jobId);
  }
  async whenIdle(): Promise<void> {
    /* no-op */
  }
}

export class FakeReferenceProvider implements ReferenceProvider {
  readonly name = 'fake';
  async fetch(scene: SceneDescriptor): Promise<ReferenceImage[]> {
    return [{ id: 'r1', title: `参考:${scene.label}`, license: '自绘测试素材', sourceUrl: '' }];
  }
}

export class FakeEngine implements Engine {
  readonly name = 'fake';
  async generate(input: EngineInput): Promise<EngineResult> {
    return {
      resultFilePath: 'mem://rendered.png',
      mimeType: 'image/png',
      look: {
        style: input.scene?.direction ?? '默认',
        skinTone: input.brief?.skinTone,
        palette: [],
        zones: [],
      },
    };
  }
}

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

export class ThrowingEngine implements Engine {
  readonly name = 'throwing';
  async generate(): Promise<EngineResult> {
    throw new Error('引擎炸了');
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
