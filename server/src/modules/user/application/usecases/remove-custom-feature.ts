/**
 * application/usecases/remove-custom-feature.ts —— 删一条自建特征。归属判定走实体的 `assertOwnedBy`。
 * ★★ **还有人在用就不给删**(409),不是静默删、也不是顺手替他把那几份人设里那一条去掉。
 *   "有人在用"的判据是**字符串相等**:人设行里存的是 `group/text`,不是这一行的 id。
 */
import {
  customFeatureIdOf,
  customFeatureInUse,
  customFeatureNotFound,
} from '../../domain/entities/custom-feature.js';
import type { CustomFeatureRepository } from '../../domain/ports/custom-feature-repository.js';
import type { PersonaRepository } from '../../domain/ports/persona-repository.js';
import { validateOwnerQuery, validatePersonaId } from '../../domain/validators/persona.validator.js';

export class RemoveCustomFeature {
  constructor(
    private readonly deps: {
      customFeatures: CustomFeatureRepository;
      /** ★ 借人设仓库问一句"还有谁在用"——这正是这一条与人设同住一个模块的好处。 */
      personas: PersonaRepository;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<void> {
    const featureId = validatePersonaId(id);
    const { userId } = validateOwnerQuery(raw);

    const item = await this.deps.customFeatures.findById(featureId);
    if (!item) throw customFeatureNotFound(featureId);
    item.assertOwnedBy(userId);

    // 只数**这个账号**的人设:别人的脸不可能指着我的库(库本身是按账号分的)。
    const stored = customFeatureIdOf(item.group, item.text);
    const personas = await this.deps.personas.listByUser(userId);
    const inUse = personas.filter((persona) => persona.features.includes(stored));
    if (inUse.length > 0) throw customFeatureInUse(featureId, inUse.length);

    await this.deps.customFeatures.remove(featureId);
  }
}
