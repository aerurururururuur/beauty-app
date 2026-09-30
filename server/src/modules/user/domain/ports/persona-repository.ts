/**
 * domain/ports/persona-repository.ts —— 人设仓库端口。实现见 `infrastructure/json/persona-repository.ts`。
 *
 * ★ **播种记账也在本端口上**(`seedVersion` / `markSeeded`),不另开一个:两者是同一目录下的
 * 同一族状态(`personas.json` + `seeded.json`)。⚠️ 播种**规则**在用例(`list-personas.ts`),这里只管读写。
 */
import type { Persona } from '../entities/persona.js';

export interface PersonaRepository {
  /** 某个账号的全部人设。★ 顺序不在这里保证(排序是应用层的事,见 `ListPersonas`)。 */
  listByUser(userId: string): Promise<Persona[]>;
  /** 按 id 取一份;不存在返回 null。 */
  findById(id: string): Promise<Persona | null>;
  /** 保存(新建或整覆写)。 */
  save(persona: Persona): Promise<void>;
  /** 按 id 删一份。★ **幂等**:本来就没有这条时不报错、也不白写一次全表。 */
  remove(id: string): Promise<void>;
  /**
   * 该账号「已播种到」的版本号;**从没播种过返回 null**。
   * ★ 没有这两格就会「删掉的种子自己回来」,理由见 `personaSeedTableSchema`。
   */
  seedVersion(userId: string): Promise<number | null>;
  /** 记下该账号已播种到的版本号。 */
  markSeeded(userId: string, version: number): Promise<void>;
}
