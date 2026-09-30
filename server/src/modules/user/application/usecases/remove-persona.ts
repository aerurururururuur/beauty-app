/**
 * application/usecases/remove-persona.ts —— 删一份人设。归属判定走同一个 `assertOwnedBy`。
 *
 * ★★ **先删字节,再删行**(与建档方向相反,同理):反过来若删字节失败,就留下一份**没有任何行指向、
 * 永远没人会删**的脸 —— 盘上一张沉默的照片,用户以为删掉了。先删字节最坏是"字节没了、行还指着它":
 * 用户看到 500,再点一次就干净了。一次可见的错误好过一份沉默的残留。
 *
 * ★ 照片为 `seed`(住前端 `public/`)时**不删字节**:那两份 SVG 全站共用。
 */
import { personaNotFound } from '../../domain/entities/persona.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import type { PersonaPhotoStore } from '../../domain/ports/persona-photo-store.js';
import { validatePersonaId, validateOwnerQuery } from '../../domain/validators/persona.validator.js';

export class RemovePersona {
  constructor(
    private readonly deps: {
      personas: PersonaRepository;
      photos: PersonaPhotoStore;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<void> {
    const personaId = validatePersonaId(id);
    const { userId } = validateOwnerQuery(raw);

    const persona = await this.deps.personas.findById(personaId);
    if (!persona) throw personaNotFound(personaId);
    persona.assertOwnedBy(userId);

    // ★ 只有 `file` 那一态有本模块自己的字节;`remove` 幂等,所以"行说有、盘上没有"不会误报失败。
    if (persona.photo.kind === 'file') {
      await this.deps.photos.remove(personaId);
    }
    await this.deps.personas.remove(personaId);
  }
}
