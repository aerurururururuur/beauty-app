/**
 * infrastructure/json/persona-repository.ts —— PersonaRepository 的磁盘 JSON 实现(与账号表、衣橱同款)。
 * 全部人设收在 `<dataDir>/personas/personas.json` 的 `{ [id]: PersonaRow }` 里:列表按 userId 过滤,
 * 单表一次 `JSON.parse` 就扫完,不必翻目录。代价:整表读-改-写,并发写会互相覆盖(演示期单进程可忽略)。
 * 写盘临时文件 + rename 保证原子性。★ `seeded.json` 住同一目录、同一个类(理由见端口文件头)。
 *
 * ★ **读出口过解析器**,不拿 `as` 断言硬说形状 —— `.json` 里的东西可以是手改的。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Persona } from '../../domain/entities/persona.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import { parsePersonaTable, parseSeedTable } from '../../domain/validators/persona.validator.js';

/** 落盘格式:id → 人设行。 */
type PersonaTable = Record<string, Persona>;
/** 播种记账:`userId` → 已播种到的版本号。 */
type SeedTable = Record<string, number>;

/** 读 + `JSON.parse`。文件损坏时报的是「哪个文件、坏在哪」,不是一句裸的 `Unexpected token`。 */
function readJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `人设数据读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class JsonPersonaRepository implements PersonaRepository {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return path.join(this.dir, 'personas.json');
  }

  private get seedFile(): string {
    return path.join(this.dir, 'seeded.json');
  }

  async save(persona: Persona): Promise<void> {
    const table = await this.readTable();
    table[persona.id] = persona;
    await this.writeAtomic(this.file, JSON.stringify(table));
  }

  async findById(id: string): Promise<Persona | null> {
    return (await this.readTable())[id] ?? null;
  }

  async listByUser(userId: string): Promise<Persona[]> {
    const table = await this.readTable();
    return Object.values(table).filter((persona) => persona.userId === userId);
  }

  async remove(id: string): Promise<void> {
    const table = await this.readTable();
    // 本来就没有这条:不必白写一次全表(删除是幂等的,不报错)。
    if (table[id] === undefined) return;
    delete table[id];
    await this.writeAtomic(this.file, JSON.stringify(table));
  }

  async seedVersion(userId: string): Promise<number | null> {
    const table = await this.readSeedTable();
    return table[userId] ?? null;
  }

  async markSeeded(userId: string, version: number): Promise<void> {
    const table = await this.readSeedTable();
    table[userId] = version;
    await this.writeAtomic(this.seedFile, JSON.stringify(table));
  }

  private async readTable(): Promise<PersonaTable> {
    if (!existsSync(this.file)) return {};
    const raw = readJson(await readFile(this.file, 'utf8'), this.file);
    // ★ 解析器返回的就是包好的实体(它在那一轮里 `new Persona(row)`)。
    return parsePersonaTable(raw, this.file);
  }

  private async readSeedTable(): Promise<SeedTable> {
    if (!existsSync(this.seedFile)) return {};
    const raw = readJson(await readFile(this.seedFile, 'utf8'), this.seedFile);
    return parseSeedTable(raw, this.seedFile);
  }

  /** 写盘:临时文件 + rename(`mkdir -p` 保证 dataDir 不在时也能建起来)。 */
  private async writeAtomic(target: string, content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, target);
  }
}
