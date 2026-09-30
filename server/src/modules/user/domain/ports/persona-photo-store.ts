/**
 * domain/ports/persona-photo-store.ts —— 人设照片**字节**的存放端口。
 *
 * ★★ **不能复用 `assets` 的 `ArtifactStore`**:它落在 `inputs/<id>/<kind>/` 下,而
 * `PurgeExpiredSessions.sweepOrphans()` 会扫 `inputs/`+`results/` 下**无会话认领的 id 并真删** ——
 * 人设照片落进去就是**一小时后用户的脸自己没了**,日志那行还写着"清掉了 N 个无会话认领的目录"。
 * 所以住自己的目录(`<dataDir>/personas/photos/`),与 24 小时 TTL 无关。
 *
 * ★ 端口只认「id + mime + 字节」,不认路径/扩展名(那是实现的记账细节)。
 * **`mime` 由调用方从行里带来** —— 行是唯一真源。
 */
export interface PersonaPhotoStore {
  /**
   * 写入(覆盖)一份字节。★ 实现**必须**先清掉这个 id 名下已有的字节:
   * 换照片时 mime 可能变(jpeg → png),旧文件不删就在盘上留一份永远没人读也没人删的脸。
   */
  save(personaId: string, mime: string, bytes: Buffer): Promise<void>;
  /**
   * 读回字节。⚠️ 行里是 `kind:'file'` 而字节不在 = **不变量被打破**(盘被人动过):
   * 抛普通 `Error`(500),不是 404 甩锅客户端。
   */
  read(personaId: string, mime: string): Promise<Buffer>;
  /** 删掉这个 id 名下的字节。**幂等**:没有就不动。 */
  remove(personaId: string): Promise<void>;
}
