/**
 * application/usecases/create-custom-feature.ts —— 建一条自建特征:校验 → 账号存在性 → 条数上限 → 落库。
 * ★ 这是"账号共用一份小库"的写入端:建一次,这个人设库里所有脸都挑得到它。
 * ★ **不查重复**:同一条原话重复建只会多一行,而前端在发请求之前就会先在本账号库里找一遍。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import {
  MAX_CUSTOM_FEATURES_PER_USER,
  createCustomFeature,
} from '../../domain/entities/custom-feature.js';
import type { CustomFeatureRepository } from '../../domain/ports/custom-feature-repository.js';
import type { UserRepository } from '../../domain/ports/user-repository.js';
import type { CustomFeatureView } from '../../domain/schemas/index.js';
import { validateCreateCustomFeatureInput } from '../../domain/validators/custom-feature.validator.js';
import { toCustomFeatureView } from '../custom-feature-view.js';

export class CreateCustomFeature {
  constructor(
    private readonly deps: {
      customFeatures: CustomFeatureRepository;
      users: UserRepository;
    },
  ) {}

  async execute(raw: unknown): Promise<CustomFeatureView> {
    const input = validateCreateCustomFeatureInput(raw);

    // 归属必须指向真实账号,否则这一条变成孤儿(谁都不认领,还占着全表)。
    if (!(await this.deps.users.findById(input.userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    // 条数上限:先查后写。演示期单进程,竞态窗口可忽略(同 `CreateSkinTone`)。
    const current = await this.deps.customFeatures.listByUser(input.userId);
    if (current.length >= MAX_CUSTOM_FEATURES_PER_USER) {
      throw new AppError(
        ErrorCode.CUSTOM_FEATURE_FULL,
        `自建的特征最多 ${MAX_CUSTOM_FEATURES_PER_USER} 条,请先删掉一些再建`,
        { limit: MAX_CUSTOM_FEATURES_PER_USER },
      );
    }

    const item = createCustomFeature(randomUUID(), input.userId, {
      group: input.group,
      text: input.text,
    });
    await this.deps.customFeatures.save(item);

    return toCustomFeatureView(item);
  }
}
