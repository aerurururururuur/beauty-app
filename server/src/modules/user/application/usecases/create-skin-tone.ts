/**
 * application/usecases/create-skin-tone.ts —— 建一个自建肤色档:校验 → 账号存在性 → 档数上限 → 落库。
 * ★ 这是"账号共用一份小库"的写入端:建一次,这个人设库里所有脸都挑得到它。
 * ★ **不查重名**:两档同名的色值可能根本不同,拦下来只会让他改个自己都不记得的名字。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { MAX_TONES_PER_USER, createSkinTone } from '../../domain/entities/skin-tone.js';
import type { SkinToneRepository } from '../../domain/ports/skin-tone-repository.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import type { SkinToneView } from '../../domain/schemas/index.js';
import { validateCreateSkinToneInput } from '../../domain/validators/skin-tone.validator.js';
import { toSkinToneView } from '../skin-tone-view.js';

export class CreateSkinTone {
  constructor(
    private readonly deps: {
      tones: SkinToneRepository;
      users: UserRepository;
    },
  ) {}

  async execute(raw: unknown): Promise<SkinToneView> {
    const input = validateCreateSkinToneInput(raw);

    // 归属必须指向真实账号,否则这一档变成孤儿(人设行指着它,但没人认领)。
    if (!(await this.deps.users.findById(input.userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    // 档数上限:先查后写。演示期单进程,竞态窗口可忽略(同 `CreatePersona`)。
    const current = await this.deps.tones.listByUser(input.userId);
    if (current.length >= MAX_TONES_PER_USER) {
      throw new AppError(
        ErrorCode.SKIN_TONE_FULL,
        `自建的肤色档最多 ${MAX_TONES_PER_USER} 个,请先删掉一些再建`,
        { limit: MAX_TONES_PER_USER },
      );
    }

    const tone = createSkinTone(randomUUID(), input.userId, {
      name: input.name,
      hex: input.hex,
    });
    await this.deps.tones.save(tone);

    return toSkinToneView(tone);
  }
}
