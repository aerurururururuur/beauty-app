/**
 * modules/looks/compose.ts —— 组合根。
 * 把持久化(JsonLookRepository)与两个**外来的端口实现**装到四个用例上:
 *   · `userExists` —— 由 src/index.ts 把 user 模块的 getUser 包一层传进来;
 *   · `renders`    —— 由 src/index.ts 把 agent 的 GetRender 收窄后传进来(见 src/look-renders.ts);
 *   · `covers`     —— 由 src/index.ts 桥到 assets 的 ArtifactStore(`putLook`/`resolveLook`/`removeLook`)。
 * 换存储只在这里换实现,业务层不感知。
 *
 * ★ 后两个端口是**必填**的,不是可选:少接一个就会让"保存"这条路静默地保存不了
 *   (或存下一个没有字节可读的档案),那正是本仓判死的那种假开关。
 */
import path from 'node:path';
import { AddLook } from './application/usecases/add-look.js';
import { ListLooks } from './application/usecases/list-looks.js';
import { ReadLookCover } from './application/usecases/read-look-cover.js';
import { RemoveLook } from './application/usecases/remove-look.js';
import { JsonLookRepository } from './infrastructure/json/look-repository.js';
import type { LookCoverStore } from './domain/ports/look-cover-store.js';
import type { LookRepository } from './domain/ports/look-repository.js';
import type { RenderSource } from './domain/ports/render-source.js';
import type { UserDirectory } from './domain/ports/user-directory.js';

export interface LooksModuleOptions {
  /** 数据根目录绝对路径;档案表落在其下 looks/ 子目录(items.json)。 */
  dataDir: string;
  /** 校验归属账号是否存在。由组装根包 user 模块的 getUser 传进来。 */
  userExists: (userId: string) => Promise<boolean>;
  /** 「把某次会话的第 n 张成品图给我」。由组装根包 agent 的 GetRender 传进来。 */
  renders: RenderSource;
  /** 封面字节的存取。由组装根桥到 assets 的 ArtifactStore。 */
  covers: LookCoverStore;
}

export interface LooksModuleServices {
  items: LookRepository;
  users: UserDirectory;
  renders: RenderSource;
  covers: LookCoverStore;
  addLook: AddLook;
  listLooks: ListLooks;
  removeLook: RemoveLook;
  readLookCover: ReadLookCover;
}

export function createLooksModule(options: LooksModuleOptions): LooksModuleServices {
  const items: LookRepository = new JsonLookRepository(path.join(options.dataDir, 'looks'));
  const users: UserDirectory = { exists: options.userExists };
  const { renders, covers } = options;

  const addLook = new AddLook({ items, users, renders, covers });
  const listLooks = new ListLooks({ items, users });
  const removeLook = new RemoveLook({ items, covers });
  const readLookCover = new ReadLookCover({ items, covers });

  return { items, users, renders, covers, addLook, listLooks, removeLook, readLookCover };
}
