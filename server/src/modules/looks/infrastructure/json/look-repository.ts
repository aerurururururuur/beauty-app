/**
 * infrastructure/json/look-repository.ts —— LookRepository 的磁盘 JSON 实现
 * (仿 cabinet/infrastructure/json/cosmetic-repository.ts)。
 * 全部档案收在 dataDir/looks/items.json 的 { [id]: LookRow } 里:列表要按 userId 过滤,
 * 单表一次 JSON.parse 就能扫完,不必翻目录读 N 个文件。
 * 代价:写入是整表读-改-写,并发写会互相覆盖;演示期单进程、量级(每人 ≤ 100 版)
 * 远没到需要索引或分片的程度。写盘先写临时文件再 rename,避免留下半截 JSON。
 *
 * ★ **读出口过解析器**(§7.2):交给 `parseLookTable`,不拿 `as` 硬说「我知道它是什么形状」。
 *
 * ⚠️ 本文件只管 `looks/items.json`;**封面字节在 `look-covers/<id>/` 下,不在这个目录里**
 *   (两个顶层名字刻意分开,免得有人把记录目录整个枚举时又撞上封面)。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Look } from '../../domain/entities/look.js';
import type { LookRepository } from '../../domain/ports/look-repository.js';
import { parseLookTable } from '../../domain/validators/look.validator.js';

/** 落盘格式:lookId → LookRow。 */
type LookTable = Record<string, Look>;

/** 读 + `JSON.parse`。文件损坏时报的是「哪个文件、坏在哪」,不是一句裸的 `Unexpected token`。 */
function readJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `妆容档案数据读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class JsonLookRepository implements LookRepository {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return path.join(this.dir, 'items.json');
  }

  async save(look: Look): Promise<void> {
    const table = await this.readTable();
    table[look.id] = look;
    await this.writeAtomic(JSON.stringify(table));
  }

  async findById(id: string): Promise<Look | null> {
    return (await this.readTable())[id] ?? null;
  }

  async listByUser(userId: string): Promise<Look[]> {
    const table = await this.readTable();
    return Object.values(table).filter((look) => look.userId === userId);
  }

  async remove(id: string): Promise<void> {
    const table = await this.readTable();
    // 本来就没有这条:不必白写一次全表(删除是幂等的,不报错)。
    if (table[id] === undefined) return;
    delete table[id];
    await this.writeAtomic(JSON.stringify(table));
  }

  private async readTable(): Promise<LookTable> {
    if (!existsSync(this.file)) return {};
    return parseLookTable(readJson(await readFile(this.file, 'utf8'), this.file), this.file);
  }

  private async writeAtomic(content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, this.file);
  }
}
