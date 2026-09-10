/**
 * infrastructure/json/user-repository.ts —— UserRepository 的磁盘 JSON 实现。
 * 与 jobs 的「一实体一文件」不同,账号是**一张小表**:全部用户收在
 * dataDir/users/users.json 的 { [id]: User } 里——按昵称查号要扫全表,
 * 单文件才不必翻目录;账号量级(演示期)远没到需要索引的程度。
 * 写入读-改-写:先写临时文件再 rename,保证原子性(单进程内足以避免半截文件)。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { User } from '../../domain/entities/user.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';

/** 落盘格式:userId → User。 */
type UserTable = Record<string, User>;

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
    return JSON.parse(await readFile(this.file, 'utf8')) as UserTable;
  }

  private async writeAtomic(content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, this.file);
  }
}
