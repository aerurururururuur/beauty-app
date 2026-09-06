/**
 * test/helpers/fakes.ts —— 用例单测用的内存假端口。
 */
import { Readable } from 'node:stream';
import type { ImageRef } from '../../src/domain/entities/image.js';
import type { JobRecord } from '../../src/domain/entities/job.js';
import type { SceneAnalysis } from '../../src/domain/entities/scene.js';
import type { ReferenceImage } from '../../src/domain/entities/reference.js';
import type {
  ArtifactStore,
  StoredResult,
  UploadFile,
} from '../../src/domain/ports/artifact-store.js';
import type { JobQueue } from '../../src/domain/ports/job-queue.js';
import type { JobRepository } from '../../src/domain/ports/job-repository.js';
import type { Engine, EngineInput, EngineResult } from '../../src/domain/ports/engine.js';
import type { SceneAnalyzer, SceneAnalyzerInput } from '../../src/domain/ports/scene-analyzer.js';
import type { ReferenceProvider } from '../../src/domain/ports/reference-provider.js';

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

export class FakeSceneAnalyzer implements SceneAnalyzer {
  readonly name = 'fake';
  async analyze(input: SceneAnalyzerInput): Promise<SceneAnalysis> {
    return {
      label: input.sceneText?.includes('雪') ? 'snow' : 'unknown',
      direction: '测试方向',
      tags: ['测试'],
      confidence: 0.6,
      source: 'fake',
    };
  }
}

export class FakeReferenceProvider implements ReferenceProvider {
  readonly name = 'fake';
  async fetch(scene: SceneAnalysis): Promise<ReferenceImage[]> {
    return [
      { id: 'r1', title: `参考:${scene.label}`, license: 'cc0', sourceUrl: 'https://example.com/1' },
    ];
  }
}

export class FakeEngine implements Engine {
  readonly name = 'fake';
  async generate(input: EngineInput): Promise<EngineResult> {
    return {
      resultFilePath: 'mem://rendered.png',
      mimeType: 'image/png',
      look: { style: input.sceneAnalysis?.direction ?? '默认', palette: [], zones: [] },
    };
  }
}

export class ThrowingEngine implements Engine {
  readonly name = 'throwing';
  async generate(): Promise<EngineResult> {
    throw new Error('引擎炸了');
  }
}
