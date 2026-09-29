/**
 * infrastructure/json/user-repository.ts —— UserRepository 的磁盘 JSON 实现。
 * 与 `cabinet` 的衣橱表同一个形状,账号也是**一张小表**:全部用户收在
 * dataDir/users/users.json 的 { [id]: User } 里——按昵称查号要扫全表,
 * 单文件才不必翻目录;账号量级(演示期)远没到需要索引的程度。
 * 写入读-改-写:先写临时文件再 rename,保证原子性(单进程内足以避免半截文件)。
 *
 * ★ **读出口过解析器**(§7.2):`readTable` 交给 `parseUserTable`,不拿 `as` 断言硬说
 *   「我知道它是什么形状」。`.json` 里的东西可以是手改的 —— 断言在边界处不作数(§7.3)。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { User } from '../../domain/entities/user.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import { parseUserTable } from '../../domain/validators/user.validator.js';

/** 落盘格式:userId → User。 */
type UserTable = Record<string, User>;

/** 读 + `JSON.parse`。文件损坏时报的是「哪个文件、坏在哪」,不是一句裸的 `Unexpected token`。 */
function readJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `账号数据读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class JsonUserRepository implements UserRepository {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return path.join(this.dir, 'users.json');
  }

  async save(user: User): Promise<void> {
    const table = await this.readTable();
    table[user.id] = user;
    await this.writeAtomic(JSON.stringify(table));
  }

  async findById(id: string): Promise<User | null> {
    return (await this.readTable())[id] ?? null;
  }

  async findByNickname(nickname: string): Promise<User | null> {
    const table = await this.readTable();
    return Object.values(table).find((u) => u.nickname === nickname) ?? null;
  }

  private async readTable(): Promise<UserTable> {
    if (!existsSync(this.file)) return {};
    return parseUserTable(readJson(await readFile(this.file, 'utf8'), this.file), this.file);
  }

  private async writeAtomic(content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, this.file);
  }
}
