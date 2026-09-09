/**
 * infrastructure/json/job-repository.ts —— JobRepository 的磁盘 JSON 实现。
 * dataDir/jobs/<id>.json;update 读-改-写:先写临时文件再 rename,保证原子性。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { JobRecord } from '../../domain/entities/job.js';
import type { JobRepository } from '../../domain/ports/job-repository.js';

export class JsonJobRepository implements JobRepository {
  constructor(private readonly dir: string) {}

  private fileOf(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  async create(record: JobRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.writeAtomic(record.id, JSON.stringify(record));
  }

  async find(id: string): Promise<JobRecord | null> {
    const file = this.fileOf(id);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, 'utf8')) as JobRecord;
  }

  async update(id: string, mutate: (prev: JobRecord) => JobRecord): Promise<JobRecord> {
    const file = this.fileOf(id);
    if (!existsSync(file)) throw new Error(`job ${id} 不存在,无法更新`);
    const prev = JSON.parse(await readFile(file, 'utf8')) as JobRecord;
    const next = mutate(prev);
    await this.writeAtomic(id, JSON.stringify(next));
    return next;
  }

  private async writeAtomic(id: string, content: string): Promise<void> {
    const file = this.fileOf(id);
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, file);
  }
}
