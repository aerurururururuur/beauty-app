/**
 * application/usecases/list-cosmetics.ts —— 列出某用户衣橱里的全部条目。
 * 排序策略属于应用层(不是存储的事):按建档时间升序,同刻用 id 兜底,
 * 保证同一批数据每次渲染顺序一致——UI 上条目乱跳比"排序不好看"更烦人。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { CosmeticListView } from '../../domain/api/cosmetic-item-view.js';
import type { CosmeticRepository } from '../../domain/ports/cosmetic-repository.js';
import type { UserDirectory } from '../../domain/ports/user-directory.js';
import { validateOwnerQuery } from '../../domain/validators/cosmetic-item.validator.js';
import { toCosmeticItemView } from '../mapping/cosmetic-item-view.mapper.js';

export class ListCosmetics {
  constructor(
    private readonly deps: {
      items: CosmeticRepository;
      users: UserDirectory;
    },
  ) {}

  async execute(raw: unknown): Promise<CosmeticListView> {
    const { userId } = validateOwnerQuery(raw);

    // 与新增同口径:用户不存在就明说,别回一个空列表让人以为"衣橱是空的"。
    if (!(await this.deps.users.exists(userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, `用户不存在:${userId}`);
    }

    const items = await this.deps.items.listByUser(userId);
    const sorted = [...items].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );

    return { items: sorted.map(toCosmeticItemView) };
  }
}
