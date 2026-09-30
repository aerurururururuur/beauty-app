/**
 * application/usecases/read-persona-photo.ts —— 取一份人设的照片字节。
 *
 * ★ 本模块**唯一一条走 `<img>` 而不是 axios 的口**:浏览器不给 `<img>` 带自定义头,
 * 所以归属只能靠查询串里的 `userId` 判。⚠️ 拿到 URL 的人就能看到这张脸,所以控制器里
 * **必须**设 `Cache-Control: private, no-store` —— 这条 URL 不带版本号,任何缓存留下它,
 * 都会在用户换照片后继续发旧的那张。
 *
 * ★ 两态各一个不同的错误:人设不在/不是你的 ⇒ `PERSONA_NOT_FOUND`;人设在、照片不在 ⇒ `PERSONA_PHOTO_NOT_FOUND`。
 */
import { personaNotFound, personaPhotoMissing } from '../../domain/entities/persona.js';
import type { PersonaPhotoStore } from '../../domain/ports/persona-photo-store.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import { validatePersonaId, validateOwnerQuery } from '../../domain/validators/persona.validator.js';

export class ReadPersonaPhoto {
  constructor(
    private readonly deps: {
      personas: PersonaRepository;
      photos: PersonaPhotoStore;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<{ mime: string; bytes: Buffer }> {
    const personaId = validatePersonaId(id);
    const { userId } = validateOwnerQuery(raw);

    const persona = await this.deps.personas.findById(personaId);
    if (!persona) throw personaNotFound(personaId);
    persona.assertOwnedBy(userId);

    // ★ `none` 与 `seed` 都没有**服务端**字节。
    const photo = persona.photo;
    if (photo.kind !== 'file') throw personaPhotoMissing(personaId);

    return { mime: photo.mime, bytes: await this.deps.photos.read(personaId, photo.mime) };
  }
}
