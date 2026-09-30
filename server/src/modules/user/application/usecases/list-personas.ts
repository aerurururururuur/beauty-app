/**
 * application/usecases/list-personas.ts —— 列出某账号的全部人设,**并在读的时候补齐种子**。
 *
 * ★ **播种长在读路径上**(照搬前端 `migrateSeeds`):没有别的入口能保证"新账号第一次打开人设库时
 * 手里有东西"——做成注册时的事,老账号永远看不到;做成定时任务,是为 5 行数据养一个调度器。
 *
 * ★ **版本号那道门不能省**:没有它,**用户删掉的种子下次进人设库会自己回来**(只在"全删光"后才看得出来)。
 * 记的是**每账号播到第几版**(`seeded.json`),不是"表是不是空的"。规则三条:
 *   ① 版本没到 ⇒ 只补**缺失的 id**;② 已有的、用户自建的一律**不动**;③ **补完才写版本号**。
 *
 * ★ 排序 `createdAt` 倒序、同刻用 id 兜底(条目乱跳比"排序不好看"更烦人)。
 * ⚠️ 与前端旧行为的**刻意**差别:旧版是升序,所以 5 份种子的次序会反过来(`ps-sister` 在最前)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import { PERSONA_SEEDS, PERSONA_SEED_VERSION } from '../../domain/entities/persona-seeds.js';
import { personaFromSeed } from '../../domain/entities/persona.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import type { PersonaView } from '../../domain/schemas/index.js';
import { validateOwnerQuery } from '../../domain/validators/persona.validator.js';
import { toPersonaView } from '../persona-view.js';

export class ListPersonas {
  constructor(
    private readonly deps: {
      personas: PersonaRepository;
      /** ★ 同模块的账号仓库:账号不存在就明说,别回空列表让人以为"人设库是空的"。 */
      users: UserRepository;
    },
  ) {}

  async execute(raw: unknown): Promise<PersonaView[]> {
    const { userId } = validateOwnerQuery(raw);

    if (!(await this.deps.users.findById(userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    await this.seedIfNeeded(userId);

    const personas = await this.deps.personas.listByUser(userId);
    const sorted = [...personas].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
    return sorted.map(toPersonaView);
  }

  /** 缺什么补什么(见文件头三条规则);版本号已经到位就一次 IO 都不多做。 */
  private async seedIfNeeded(userId: string): Promise<void> {
    const version = await this.deps.personas.seedVersion(userId);
    if (version !== null && version >= PERSONA_SEED_VERSION) return;

    const existing = await this.deps.personas.listByUser(userId);
    const have = new Set(existing.map((persona) => persona.id));
    const missing = PERSONA_SEEDS.filter((seed) => !have.has(seed.id));

    for (const seed of missing) {
      await this.deps.personas.save(personaFromSeed(seed, userId));
    }

    // ★ 补完才写版本号(规则 ③)。
    await this.deps.personas.markSeeded(userId, PERSONA_SEED_VERSION);
  }
}
