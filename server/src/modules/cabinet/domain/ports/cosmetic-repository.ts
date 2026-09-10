/**
 * domain/ports/cosmetic-repository.ts —— 衣橱仓库端口(本模块持契约)。
 * 实现见 infrastructure(JSON 落盘,仿 user/infrastructure/json/user-repository)。
 * 只有本模块自己实现/装配它,别处经 public barrel 拿不到具体实现——保持单向依赖。
 *
 * 端口**不做归属校验**:「这条属不属于这个用户」是用例的业务判断,
 * 不是存储的职责;仓库只管按 id 存取。
 */
import type { CosmeticItem } from '../entities/cosmetic-item.js';

export interface CosmeticRepository {
  /** 保存(新增或整覆写)一条条目。 */
  save(item: CosmeticItem): Promise<void>;
  /** 按 id 取条目;不存在返回 null。 */
  findById(id: string): Promise<CosmeticItem | null>;
  /** 取某用户的全部条目(顺序不限,排序策略由用例决定)。 */
  listByUser(userId: string): Promise<CosmeticItem[]>;
  /** 按 id 删除;不存在时静默返回(删除是幂等的)。 */
  remove(id: string): Promise<void>;
}
