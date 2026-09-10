/**
 * infrastructure/json/cosmetic-repository.ts —— CosmeticRepository 的磁盘 JSON 实现。
 * 与 user 的账号表同款:**一张小表**——全部条目收在 dataDir/cabinet/items.json 的
 * { [id]: CosmeticItem } 里。之所以单文件而不是"一实体一文件"(jobs 那样):
 * 列表要按 userId 过滤,单表一次 JSON.parse 就能扫完,不必翻目录读 N 个文件。
 * 代价(README 也写了):写入是整表读-改-写,并发写会互相覆盖;
 * 演示期单进程、量级(每人 ≤ 100 件)远没到需要索引或分片的程度。
 * 写盘先写临时文件再 rename,保证原子性(避免留下半截 JSON)。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CosmeticItem } from '../../domain/entities/cosmetic-item.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';

/** 落盘格式:itemId → CosmeticItem。 */
type ItemTable = Record<string, CosmeticItem>;

export class JsonCosmeticRepository implements CosmeticRepository {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return path.join(this.dir, 'items.json');
  }

  async save(item: CosmeticItem): Promise<void> {
    const table = await this.readTable();
    table[item.id] = item;
    await this.writeAtomic(JSON.stringify(table));
  }

  async findById(id: string): Promise<CosmeticItem | null> {
    return (await this.readTable())[id] ?? null;
  }

  async listByUser(userId: string): Promise<CosmeticItem[]> {
    const table = await this.readTable();
    return Object.values(table).filter((item) => item.userId === userId);
  }

  async remove(id: string): Promise<void> {
    const table = await this.readTable();
    // 本来就没有这条:不必白写一次全表(删除是幂等的,不报错)。
    if (table[id] === undefined) return;
    delete table[id];
    await this.writeAtomic(JSON.stringify(table));
  }

  private async readTable(): Promise<ItemTable> {
    if (!existsSync(this.file)) return {};
    return JSON.parse(await readFile(this.file, 'utf8')) as ItemTable;
  }

  private async writeAtomic(content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, this.file);
  }
}
