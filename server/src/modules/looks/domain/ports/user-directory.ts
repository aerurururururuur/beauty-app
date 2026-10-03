/**
 * domain/ports/user-directory.ts —— 「这个 userId 存在吗」的端口。
 *
 * ★ 这是本模块唯一与 user 模块有关的接缝,但**本模块不 import user 模块**:
 *   端口声明在这里,实现由**组装根**(src/index.ts)把 user 模块的 getUser 包一层粘进来。
 *   模块之间只经各自 public barrel 协作(cabinet 的同名端口逐字同款,各持一份)。
 *
 * 为什么值得留这道缝:没有它,档案可以存下指向不存在账号的记录,
 * 而账号一删,这些档案就成了谁也打不开、谁也删不掉的孤儿。
 */
export interface UserDirectory {
  /** 账号是否存在。 */
  exists(userId: string): Promise<boolean>;
}
