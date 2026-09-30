/**
 * domain/ports/custom-feature-repository.ts —— 自建特征仓库端口。实现见 `infrastructure/json/custom-feature-repository.ts`。
 * ★ 与人设是**两张表**:人设行只按 `group/text` 那串原话引用一条,库行的 id 不出现在人设里,
 *   所以"删除时还有没有人在用"要跨两个仓库按字符串比,那个问题在 `RemoveCustomFeature` 用例里问。
 */
import type { CustomFeature } from '../entities/custom-feature.js';

export interface CustomFeatureRepository {
  /** 某个账号的全部自建档。★ 顺序不在这里保证(排序是应用层的事)。 */
  listByUser(userId: string): Promise<CustomFeature[]>;
  /** 按 id 取一条;不存在返回 null。 */
  findById(id: string): Promise<CustomFeature | null>;
  /** 保存(新建或整覆写)。 */
  save(customFeature: CustomFeature): Promise<void>;
  /** 按 id 删一条。★ **幂等**:本来就没有这条时不报错、也不白写一次全表。 */
  remove(id: string): Promise<void>;
}
