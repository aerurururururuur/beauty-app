/**
 * domain/ports/look-cover-store.ts —— 档案封面字节的存取端口。
 *
 * ★ **本模块不 import assets 模块**:端口声明在这里,实现由**组装根**桥到
 *   `assets` 的 `ArtifactStore`(`putLook` / `resolveLook` / `removeLook`)。
 * ★★ 字节必须落在 `look-covers/` 这个**新根**上,别挪进 `inputs/` 或 `results/`
 *   —— 那两个区每小时被孤儿清扫删一次。理由见模块 README。
 *
 * ⚠️ 端口**只回路径/MIME,不回流**:建流是 I/O,归表现层(§2)。
 */
import type { ResolvedImage } from '../../../shared/index.js';

export interface LookCoverStore {
  /** 把源图**复制**成 `lookId` 名下的封面。★ 复制,不是引用(源图受会话 TTL 管)。 */
  save(lookId: string, sourceFilePath: string, mimeType: string): Promise<void>;
  /** 解析封面;没有返回 `null`。 */
  resolve(lookId: string): Promise<ResolvedImage | null>;
  /** 删掉 `lookId` 名下的封面。**幂等**,删不存在的不算错。 */
  remove(lookId: string): Promise<void>;
}
