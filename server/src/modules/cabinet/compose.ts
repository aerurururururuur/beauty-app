/**
 * modules/cabinet/compose.ts —— 组合根。
 * 把持久化(JsonCosmeticRepository)、归属校验(UserDirectory)与四个用例装起来,
 * 由 src/index.ts 注入 web shell。换存储只在这里换实现,业务层不感知。
 */
import path from 'node:path';
import { AddCosmetic } from './application/usecases/add-cosmetic.js';
import { ListCosmetics } from './application/usecases/list-cosmetics.js';
import { RemoveCosmetic } from './application/usecases/remove-cosmetic.js';
import { UpdateCosmetic } from './application/usecases/update-cosmetic.js';
import { JsonCosmeticRepository } from './infrastructure/json/cosmetic-repository.js';
import type { CosmeticRepository } from './domain/ports/cosmetic-repository.js';
import type { UserDirectory } from './domain/ports/user-directory.js';

export interface CabinetModuleOptions {
  /** 数据根目录绝对路径;衣橱表落在其下 cabinet/ 子目录(items.json)。 */
  dataDir: string;
  /**
   * 校验归属用户是否存在。
   * ★ 由**组装根**把 user 模块的 getUser 包一层传进来——本模块不 import user 模块,
   *   跨模块粘合只在 src/index.ts 发生(见 domain/ports/user-directory.ts)。
   */
  userExists: (userId: string) => Promise<boolean>;
}

export interface CabinetModuleServices {
  items: CosmeticRepository;
  users: UserDirectory;
  addCosmetic: AddCosmetic;
  listCosmetics: ListCosmetics;
  updateCosmetic: UpdateCosmetic;
  removeCosmetic: RemoveCosmetic;
}

export function createCabinetModule(options: CabinetModuleOptions): CabinetModuleServices {
  const items: CosmeticRepository = new JsonCosmeticRepository(
    path.join(options.dataDir, 'cabinet'),
  );
  const users: UserDirectory = { exists: options.userExists };

  const addCosmetic = new AddCosmetic({ items, users });
  const listCosmetics = new ListCosmetics({ items, users });
  const updateCosmetic = new UpdateCosmetic(items);
  const removeCosmetic = new RemoveCosmetic(items);

  return { items, users, addCosmetic, listCosmetics, updateCosmetic, removeCosmetic };
}
