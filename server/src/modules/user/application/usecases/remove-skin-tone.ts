/**
 * application/usecases/remove-skin-tone.ts —— 删一个自建肤色档。归属判定走实体的 `assertOwnedBy`。
 * ★★ **还有人在用就不给删**(409),不是静默删、也不是顺手替他把那几份人设的肤色改掉。
 *   静默删看不出来:那几份人设的 `skinTone` 变成悬空 id,前端渲染成「未定档」+ 无色块。
 */
import { skinToneInUse, skinToneNotFound } from '../../domain/entities/skin-tone.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import type { SkinToneRepository } from '../../domain/ports/skin-tone-repository.js';
import { validateOwnerQuery, validatePersonaId } from '../../domain/validators/persona.validator.js';

export class RemoveSkinTone {
  constructor(
    private readonly deps: {
      tones: SkinToneRepository;
      /** ★ 借人设仓库问一句"还有谁在用"——这正是这一档与人设同住一个模块的好处。 */
      personas: PersonaRepository;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<void> {
    const toneId = validatePersonaId(id);
    const { userId } = validateOwnerQuery(raw);

    const tone = await this.deps.tones.findById(toneId);
    if (!tone) throw skinToneNotFound(toneId);
    tone.assertOwnedBy(userId);

    // 只数**这个账号**的人设:别人的脸不可能指着我的档(档本身是按账号分的)。
    const personas = await this.deps.personas.listByUser(userId);
    const inUse = personas.filter((persona) => persona.skinTone === toneId);
    if (inUse.length > 0) throw skinToneInUse(toneId, inUse.length);

    await this.deps.tones.remove(toneId);
  }
}
