# modules/looks/infrastructure —— 基础设施层

只实现本模块 `domain/ports` 的契约。

- **现状**：本层**只有记录**的实现 ——
  - `json/look-repository.ts` —— `dataDir/looks/items.json` 一张小表 `{ [lookId]: LookRow }`，
    读-改-写 + tmp/rename 原子写（与 cabinet 的仓库同款）。
    按 userId 查要扫全表：单账号上限 100 版、演示量级远没到需要索引。
    `remove` 对不存在的 id 是**幂等**的（不写盘也不抛）。读出口过 `parseLookTable`（§7.2），
    不拿 `as` 硬说形状。
  - **`UserDirectory` / `RenderSource` / `LookCoverStore` 三个端口在这里没有实现** ——
    前两个由**组装根**（`src/index.ts`）分别包 user 的 `getUser` 与 agent 的 `GetRender`
    提供；封面字节由组装根桥到 `assets` 的 `ArtifactStore`（`putLook` / `resolveLook` /
    `removeLook`，落 `dataDir/look-covers/<lookId>/`）。
- **⚠️ 这一层不管封面字节**：记录目录 `looks/` 与字节目录 `look-covers/` 是**两个平级目录**，
  刻意分开，免得有人把记录目录整个枚举时又撞上封面。
- **换实现**：SQLite / 别的存储都新写一个文件 + 在 `looks/compose.ts` 换一行，端口契约与用例不动。
  换到有唯一约束或有并发保障的存储时，把「先查后写」的上限与归属判断下沉到仓库层兜底。
- **注意**：写入是「读当前文件 → 改内存 → 整表写回」，同一进程内并发写会互相覆盖；
  换存储是修这个的唯一出路，别在这一层加锁来掩盖它。
