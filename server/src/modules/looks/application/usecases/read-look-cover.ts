/**
 * application/usecases/read-look-cover.ts —— 取一版档案的封面(给表现层发字节用)。
 *
 * ★ 记录在、字节读不到 ⇒ `console.warn` + 抛 `LOOK_COVER_NOT_FOUND`,**不静默回落**。
 *   这与 `GetRender` 同一条规矩:正常路径不会走到这里(字节与记录一起写、删除先删字节),
 *   走到了就是"盘和记录不一致"这件具体的事,该留下痕迹并明确失败,
 *   而不是回一张空白图让页面看起来"只是没图"。
 *
 * ⚠️ 只回路径 + MIME,**不建流**:开文件流是 I/O,归表现层(§2)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { ResolvedImage } from '../../../shared/index.js';
import { coverNotFound, lookNotFound } from '../../domain/entities/look.js';
import type { LookCoverStore } from '../../domain/ports/look-cover-store.js';
import type { LookRepository } from '../../domain/ports/look-repository.js';
import { validateLookId, validateOwnerQuery } from '../../domain/validators/look.validator.js';

export class ReadLookCover {
  constructor(
    private readonly deps: {
      items: LookRepository;
      covers: LookCoverStore;
    },
  ) {}

  async execute(id: string, raw: unknown): Promise<ResolvedImage> {
    const lookId = validateLookId(id);
    const { userId } = validateOwnerQuery(raw);

    const look = await this.deps.items.findById(lookId);
    if (!look) throw lookNotFound();
    look.assertOwnedBy(userId);

    const image = await this.deps.covers.resolve(lookId);
    if (!image) {
      console.warn(
        `[looks] 档案「${lookId}」的记录在,但封面字节读不到(look-covers/${lookId}/)。` +
          '正常路径不会走到这里:字节与记录一起写、删除时先删字节。',
      );
      throw coverNotFound();
    }
    return image;
  }
}
