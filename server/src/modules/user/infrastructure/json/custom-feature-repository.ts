/**
 * infrastructure/json/custom-feature-repository.ts —— CustomFeatureRepository 的磁盘 JSON 实现(同肤色档仓库款)。
 * 自建档收在 `<dataDir>/personas/features.json` 的 `{ [id]: CustomFeatureRow }` 里。
 * ★ **读出口过解析器**,不拿 `as` 断言硬说形状 —— `.json` 里的东西可以是手改的。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CustomFeature } from '../../domain/entities/custom-feature.js';
import type { CustomFeatureRepository } from '../../domain/ports/custom-feature-repository.js';
import { parseCustomFeatureTable } from '../../domain/validators/custom-feature.validator.js';

/** 落盘格式:id → 自建档。 */
type CustomFeatureTable = Record<string, CustomFeature>;

/** 读 + `JSON.parse`。文件损坏时报的是「哪个文件、坏在哪」,不是一句裸的 `Unexpected token`。 */
function readJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `自建特征数据读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class JsonCustomFeatureRepository implements CustomFeatureRepository {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return path.join(this.dir, 'features.json');
  }

  async save(customFeature: CustomFeature): Promise<void> {
    const table = await this.readTable();
    table[customFeature.id] = customFeature;
    await this.writeAtomic(JSON.stringify(table));
  }

  async findById(id: string): Promise<CustomFeature | null> {
    return (await this.readTable())[id] ?? null;
  }

  async listByUser(userId: string): Promise<CustomFeature[]> {
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

  private async readTable(): Promise<CustomFeatureTable> {
    if (!existsSync(this.file)) return {};
    const raw = readJson(await readFile(this.file, 'utf8'), this.file);
    // ★ 解析器返回的就是包好的实体(它在那一轮里 `new CustomFeature(row)`)。
    return parseCustomFeatureTable(raw, this.file);
  }

  /** 写盘:临时文件 + rename(`mkdir -p` 保证人设目录不在时也能建起来)。 */
  private async writeAtomic(content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, this.file);
  }
}
