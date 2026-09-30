/**
 * application/usecases/create-persona.ts —— 建一份人设:
 * 校验 → 账号存在性 → 件数上限 → 照片字节落盘 → 建实体 → 落库 → 视图。
 *
 * ★★ **先写字节,再写行,别对调**:反过来时若写字节失败,就留下一条 `kind:'file'` 而**没有字节**的人设
 * ——永远破图,取照片那条 500,没人知道该去删那半条记录。先写字节最坏是一堆没人引用的字节(占盘,不撒谎)。
 * ★ 删除路径方向相反(先删字节),同理。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { MAX_PERSONAS_PER_USER, createPersona } from '../../domain/entities/persona.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import type { PersonaPhotoStore } from '../../domain/ports/persona-photo-store.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import type { PersonaView } from '../../domain/schemas/index.js';
import { validateCreateInput } from '../../domain/validators/persona.validator.js';
import { toPersonaView } from '../persona-view.js';

export class CreatePersona {
  constructor(
    private readonly deps: {
      personas: PersonaRepository;
      photos: PersonaPhotoStore;
      users: UserRepository;
    },
  ) {}

  async execute(raw: unknown): Promise<PersonaView> {
    const input = validateCreateInput(raw);

    // 归属必须指向真实账号,否则人设变成孤儿。
    if (!(await this.deps.users.findById(input.userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    // 件数上限:先查后写。演示期单进程,竞态窗口可忽略(同 `AddCosmetic`)。
    const current = await this.deps.personas.listByUser(input.userId);
    if (current.length >= MAX_PERSONAS_PER_USER) {
      throw new AppError(
        ErrorCode.PERSONA_FULL,
        `人设库最多 ${MAX_PERSONAS_PER_USER} 份,请先删掉一些再建`,
        { limit: MAX_PERSONAS_PER_USER },
      );
    }

    const id = randomUUID();
    const photo = input.photo;
    if (photo.kind === 'file') {
      // ★ 字节在前(见文件头)。
      await this.deps.photos.save(id, photo.mime, photo.bytes);
    }

    const persona = createPersona(id, input.userId, {
      name: input.name,
      relation: input.relation,
      skinTone: input.skinTone,
      features: input.features,
      notes: input.notes,
      // ★ 落库那一格**不带字节**:字节已在盘上,行里只留"去哪找、是什么类型"。
      photo: photo.kind === 'file' ? { kind: 'file', mime: photo.mime } : { kind: 'none' },
    });
    await this.deps.personas.save(persona);

    return toPersonaView(persona);
  }
}
