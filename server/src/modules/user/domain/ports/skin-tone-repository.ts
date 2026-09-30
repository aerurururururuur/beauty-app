/**
 * domain/ports/skin-tone-repository.ts —— 自建肤色档仓库端口。实现见 `infrastructure/json/skin-tone-repository.ts`。
 * ★ 与人设是**两张表**:人设行只按 id 引用其中一档,所以"删除时还有没有人在用"要跨两个仓库,
 *   那个问题在 `RemoveSkinTone` 用例里问。
 */
import type { SkinTone } from '../entities/skin-tone.js';

export interface SkinToneRepository {
  /** 某个账号的全部自建档。★ 顺序不在这里保证(排序是应用层的事)。 */
  listByUser(userId: string): Promise<SkinTone[]>;
  /** 按 id 取一档;不存在返回 null。 */
  findById(id: string): Promise<SkinTone | null>;
  /** 保存(新建或整覆写)。 */
  save(tone: SkinTone): Promise<void>;
  /** 按 id 删一档。★ **幂等**:本来就没有这条时不报错、也不白写一次全表。 */
  remove(id: string): Promise<void>;
}
