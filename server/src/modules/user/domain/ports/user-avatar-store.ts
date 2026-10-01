/**
 * domain/ports/user-avatar-store.ts —— 账号头像**字节**的存放端口。
 * 与 `persona-photo-store.ts` 同形(实现也是同一份 `FilePhotoStore`),分开命名是因为
 * 读的人要一眼看出「这两个 id 空间不共用目录」——头像落 `<dataDir>/users/avatars/`。
 *
 * ★ 端口只认「id + mime + 字节」,不认路径/扩展名(那是实现的记账细节)。
 * **`mime` 由调用方从行里带来** —— 行是唯一真源。
 */
export interface UserAvatarStore {
  /**
   * 写入(覆盖)一份字节。★ 实现**必须**先清掉这个 id 名下已有的字节:
   * 换头像时 mime 可能变(jpeg → png),旧文件不删就在盘上留一份永远没人读也没人删的图。
   */
  save(userId: string, mime: string, bytes: Buffer): Promise<void>;
  /**
   * 读回字节。⚠️ 行里是 `kind:'file'` 而字节不在 = **不变量被打破**(盘被人动过):
   * 抛普通 `Error`(500),不是 404 甩锅客户端。
   */
  read(userId: string, mime: string): Promise<Buffer>;
  /** 删掉这个 id 名下的字节。**幂等**:没有就不动。 */
  remove(userId: string): Promise<void>;
}
