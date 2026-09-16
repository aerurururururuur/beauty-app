/**
 * agent/domain/ports/cosmetic-reader.ts —— 「这个用户有哪些化妆品」的端口。
 *
 * ★ **跨模块"问一句"的先例,照抄 `cabinet/domain/ports/user-directory.ts`**:
 *   端口声明在**消费方**模块(这里是 agent),实现由**组装根 `src/index.ts`**
 *   把 cabinet 的 `listByUser` 包一层粘进来。
 *   §7.1 写死了:**agent 不 import cabinet 模块,模块间仍零 import,依赖图仍无环。**
 *
 * 为什么值得留这道缝:agent 要「用你已有的产品来配色」,就必须读得到衣橱;
 * 但为了读一份清单去 import 一个模块,是把模块边界换了三行代码。
 *
 * ★ **下面的形状用原始类型重写,一个 cabinet 的类型都不借。**
 *   这不是形式主义:`UserDirectory` 也是收 `(userId: string) => Promise<boolean>`
 *   而不是 user 模块的 `User` 实体。**一旦借了 cabinet 的 `CosmeticAttribute`,
 *   这道缝就白留了**——cabinet 改那个类型,agent 会被动跟着改。
 *   端口只暴露消费方**真正需要**的字段,重复几行结构比借一个类型便宜。
 */
/** 用户自定义的特性(标签 + 值),与 cabinet 侧同构但独立声明(见文件头)。 */
export interface CabinetAttribute {
  /** 特性名,如「色号」。 */
  label: string;
  /** 特性值,如「#420 豆沙」。 */
  value: string;
}

/**
 * 衣橱条目的只读快照。
 * `id` / `userId` / 时间戳**都不要**——agent 只需要「叫什么、有哪些特性」,
 * 拿到 id 反而会诱使它去调不属于它的写接口。
 */
export interface CabinetItemSnapshot {
  name: string;
  attributes: readonly CabinetAttribute[];
}

export interface CosmeticReader {
  listByUser(userId: string): Promise<CabinetItemSnapshot[]>;
}
