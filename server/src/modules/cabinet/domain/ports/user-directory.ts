/**
 * domain/ports/user-directory.ts —— 「这个 userId 存在吗」的端口。
 *
 * ★ 这是本模块唯一与 user 模块有关的接缝,但**本模块不 import user 模块**:
 *   端口声明在这里,实现由**组装根**(src/index.ts)把 user 模块的 getUser 包一层粘进来。
 *   模块之间只经各自 public barrel 协作,不为了少写几行破例。
 *
 * 为什么值得留这道缝:没有它,衣橱可以存下指向不存在用户的条目,
 * 而推荐模块按 userId 查"已拥有品"时就会拿到一堆孤儿。
 */
export interface UserDirectory {
  /** 用户是否存在。 */
  exists(userId: string): Promise<boolean>;
}
