/**
 * application/usecases/add-look.ts —— 把一版生成好的妆容存进「我的妆容档案」。
 *
 * 顺序就是诚实性,别调换:
 *   ① 校验体 → ② 账号存在性 → ③ 同一张图已存过就直接回它(幂等)→ ④ 上限
 *   → ⑤ **解析源图;解析不到 ⇒ 抛 `LOOK_COVER_UNAVAILABLE`,此时盘上什么都没写**
 *   → ⑥ 复制封面字节 → ⑦ 写记录(写砸则尽力清掉刚复制的字节再抛)。
 *
 * ★ 第 ⑤ 步必须在第 ⑥ 步之前:先复制再发现源图不在,会在 `look-covers/` 下留一个
 *   没有记录认领的目录 —— 那个根**没有清扫器**,漏下的字节永远留在盘上。
 * ★ 幂等放在④之前:档案满了也不该挡住「把同一张图再存一次」这种无害重放。
 * ⚠️ 第 ⑤ 步的四种"拿不到"在界面上收敛成同一句话:都是「存不下来」(见 `coverUnavailable`)。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { MAX_ITEMS_PER_USER, createLook, coverUnavailable, isSameSource } from '../../domain/entities/look.js';
import type { LookView } from '../../domain/schemas/index.js';
import type { LookCoverStore } from '../../domain/ports/look-cover-store.js';
import type { LookRepository } from '../../domain/ports/look-repository.js';
import type { RenderSource } from '../../domain/ports/render-source.js';
import type { UserDirectory } from '../../domain/ports/user-directory.js';
import { validateCreateInput } from '../../domain/validators/look.validator.js';
import { toLookView } from '../look-view.js';

export class AddLook {
  constructor(
    private readonly deps: {
      items: LookRepository;
      users: UserDirectory;
      renders: RenderSource;
      covers: LookCoverStore;
    },
  ) {}

  async execute(raw: unknown): Promise<LookView> {
    const input = validateCreateInput(raw);

    // 归属必须指向真实账号,否则档案会变成谁也打不开、谁也删不掉的孤儿。
    if (!(await this.deps.users.exists(input.userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '桃妆账号不存在');
    }

    const current = await this.deps.items.listByUser(input.userId);

    // ③ 幂等在④之前:档案满了也不该挡住「把同一张图再存一次」这种无害重放。
    const existing = current.find((look) => isSameSource(look, input.sessionId, input.seq));
    if (existing) return toLookView(existing);

    // ④ 上限:先查后写。演示期单进程,竞态窗口可忽略。
    if (current.length >= MAX_ITEMS_PER_USER) {
      throw new AppError(
        ErrorCode.LOOK_FULL,
        `我的妆容档案最多 ${MAX_ITEMS_PER_USER} 版,请先删掉一些再来`,
        { limit: MAX_ITEMS_PER_USER },
      );
    }

    // ⑤ 源图解析不到 = 这次存不了。抛在这一步,盘上还没动过任何东西。
    const image = await this.deps.renders.resolve(input.sessionId, input.seq, input.userId);
    if (!image) throw coverUnavailable();

    // ⑥ 复制字节。★ 复制而非引用:源图在 `results/` 下受会话 24h TTL 管,档案要长期留着。
    const id = randomUUID();
    const coverMime = image.mimeType;
    await this.deps.covers.save(id, image.filePath, coverMime);

    const look = createLook({ ...input, id, coverMime });
    try {
      await this.deps.items.save(look);
    } catch (err) {
      // ⑦ 记录没写成,刚复制的字节就成了没人认领的目录。这里**尽力**清掉;
      //    清不掉也只能照抛原错误(记录没落盘这件事更要紧),别把它盖掉。
      try {
        await this.deps.covers.remove(id);
      } catch {
        /* 尽力而为 */
      }
      throw err;
    }

    return toLookView(look);
  }
}
