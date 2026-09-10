/**
 * application/usecases/add-cosmetic.ts —— 往衣橱里加一件。
 * 职责:入参校验行为(domain/validator)→ 归属用户存在性(经 UserDirectory 端口)
 *      → 件数上限 → 建实体 → 落库(经 CosmeticRepository 端口)→ 回对外视图。
 * 用例不感知 HTTP,也不知道存储是 JSON 还是别的。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { MAX_ITEMS_PER_USER, createCosmeticItem } from '../../domain/entities/cosmetic-item.js';
import type { CosmeticItemView } from '../../domain/api/cosmetic-item-view.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';
import type { UserDirectory } from '../../domain/ports/user-directory.js';
import { validateCreateInput } from '../../domain/validators/cosmetic-item.validator.js';
import { toCosmeticItemView } from '../mapping/cosmetic-item-view.mapper.js';

export class AddCosmetic {
  constructor(
    private readonly deps: {
      items: CosmeticRepository;
      users: UserDirectory;
    },
  ) {}

  async execute(raw: unknown): Promise<CosmeticItemView> {
    const input = validateCreateInput(raw);

    // 归属必须指向真实用户,否则条目会变成孤儿,一路漏到推荐模块。
    if (!(await this.deps.users.exists(input.userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, `用户不存在:${input.userId}`);
    }

    // 件数上限:先查后写。演示期单进程,竞态窗口可忽略;
    // 真并发时这个约束要下沉到仓库实现里兜底(端口契约不变)。
    const current = await this.deps.items.listByUser(input.userId);
    if (current.length >= MAX_ITEMS_PER_USER) {
      throw new AppError(
        ErrorCode.CABINET_FULL,
        `衣橱最多 ${MAX_ITEMS_PER_USER} 件,请先删掉一些再加`,
        { limit: MAX_ITEMS_PER_USER },
      );
    }

    const item = createCosmeticItem(randomUUID(), input.userId, input.name, input.attributes);
    await this.deps.items.save(item);

    return toCosmeticItemView(item);
  }
}
