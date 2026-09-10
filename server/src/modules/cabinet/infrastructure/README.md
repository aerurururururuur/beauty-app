# modules/cabinet/infrastructure —— 基础设施层

只实现本模块 `domain/ports` 的契约。

- **现状**：
  - `json/cosmetic-repository.ts` —— `dataDir/cabinet/items.json` 一张小表 `{ [id]: CosmeticItem }`，
    读-改-写 + tmp/rename 原子写（与 user 的仓库同款）。
    按 userId 查要扫全表：单用户上限 100 件、演示量级远没到需要索引。
    `remove` 对不存在的 id 是**幂等**的（不写盘也不抛）。
  - `UserDirectory` 没有这里的实现——它的实现由**组装根**（`src/index.ts`）把 user 模块的
    `getUser` 包一层提供（见 `../domain/ports/user-directory.ts`）。
- **换实现**：SQLite / 别的存储都新写一个文件 + 在 `cabinet/compose.ts` 换一行，端口契约与用例不动。
  若换到有唯一约束或有并发保障的存储，把「先查后写」的件数上限与归属判断下沉到仓库层兜底。
- **注意**：整个仓库的写入是「读当前文件 → 改内存 → 整表写回」，同一进程内并发写会互相覆盖；
  换存储是修这个的唯一出路，别在这一层加锁来掩盖它。
