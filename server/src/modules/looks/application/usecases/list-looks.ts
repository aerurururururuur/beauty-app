/**
 * application/usecases/list-looks.ts —— 列出某账号「我的妆容档案」里的全部档案。
 *
 * ★ 排序按 `createdAt` **倒序**(最新的在最上面)—— 与 cabinet 的正序**故意相反**:
 *   衣橱是流水账(先加的在前,像货架);档案是"最近生成的那版最有用",
 *   用户翻档案多半是为了找刚存下的那一版。同刻用 id 兜底,保证顺序稳定
 *   —— 列表在页面上乱跳比"排序不合口味"更烦人。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { LookListView } from '../../domain/schemas/index.js';
import type { LookRepository } from '../../domain/ports/look-repository.js';
import type { UserDirectory } from '../../domain/ports/user-directory.js';
import { validateOwnerQuery } from '../../domain/validators/look.validator.js';
import { toLookView } from '../look-view.js';

export class ListLooks {
  constructor(
    private readonly deps: {
      items: LookRepository;
      users: UserDirectory;
    },
  ) {}

  async execute(raw: unknown): Promise<LookListView> {
    const { userId } = validateOwnerQuery(raw);

    // 与新增同口径:账号不存在就明说,别回一个空列表让人以为"档案是空的"。
    if (!(await this.deps.users.exists(userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    const items = await this.deps.items.listByUser(userId);
    const sorted = [...items].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );

    return { items: sorted.map(toLookView) };
  }
}
