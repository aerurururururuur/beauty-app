/**
 * application/usecases/update-persona.ts —— 改一份人设(部分更新)。归属判定走实体的 `assertOwnedBy`。
 *
 * ★★ **换照片的三条路径都要走对**(错了都静默):
 *   · `photo` **没传** ⇒ 字节一个都不碰。⚠️ 最容易写错成"没传就当没有照片",那会在用户改名时**顺手删掉他的脸**;
 *   · `photo: ''` ⇒ **先删字节再写行**置 `none`;反过来若删字节失败,行已写 `none`,那张脸就**永远没人认领也没人删**;
 *   · `photo: <dataURL>` ⇒ **先写新字节再写行**(端口会覆盖同 id 旧字节,不会留两份)。
 *
 * ★ 不接 `seed` 那一态:种子照片由播种写入,客户端把 `photoUrl`(静态路径)原样回传会在 validator 里 422。
 */
import { personaNotFound, updatePersona } from '../../domain/entities/persona.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import type { PersonaPhotoStore } from '../../domain/ports/persona-photo-store.js';
import type { PersonaView } from '../../domain/schemas/index.js';
import { validatePersonaId, validateUpdateInput } from '../../domain/validators/persona.validator.js';
import { toPersonaView } from '../persona-view.js';

export class UpdatePersona {
  constructor(
    private readonly deps: {
      personas: PersonaRepository;
      photos: PersonaPhotoStore;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<PersonaView> {
    const personaId = validatePersonaId(id);
    const input = validateUpdateInput(raw);

    const persona = await this.deps.personas.findById(personaId);
    if (!persona) throw personaNotFound(personaId);
    persona.assertOwnedBy(input.userId);

    // 只有 `photo` 真传了才动它(见文件头第一条)。
    let nextPhoto = persona.photo;
    if (input.photo !== undefined) {
      if (input.photo.kind === 'none') {
        await this.deps.photos.remove(personaId);
        nextPhoto = { kind: 'none' };
      } else {
        await this.deps.photos.save(personaId, input.photo.mime, input.photo.bytes);
        nextPhoto = { kind: 'file', mime: input.photo.mime };
      }
    }

    const updated = updatePersona(persona, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.relation !== undefined ? { relation: input.relation } : {}),
      ...(input.skinTone !== undefined ? { skinTone: input.skinTone } : {}),
      ...(input.features !== undefined ? { features: input.features } : {}),
      // ★ `''` 传下去(不是省略):`updatePersona` 据此把那一格从行里删掉,那是"清空"的表达。
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.photo !== undefined ? { photo: nextPhoto } : {}),
    });
    await this.deps.personas.save(updated);

    return toPersonaView(updated);
  }
}
