# modules/looks/application —— 应用层

放档案用例：`usecases/add-look.ts`、`list-looks.ts`、`remove-look.ts`、`read-look-cover.ts`，
外加 `look-view.ts`（实体 → 对外视图）。

- **现状**：四个用例都已实现并接线。
- **写法**：用例只做编排——调 `domain/validators` 校验入参、经端口（`LookRepository` /
  `UserDirectory` / `RenderSource` / `LookCoverStore`）读写，自己不写校验规则、不认识 HTTP。
- **`AddLook` 的顺序就是诚实性**（文件头有逐条）：校验 → 账号存在 → 幂等 → 上限 →
  **解析源图（解析不到就抛，此时盘上什么都没写）** → 复制字节 → 写记录。
  第 ⑤ 步必须在第 ⑥ 步之前，否则会在没有清扫器兜底的 `look-covers/` 下漏下没人认领的字节。
  写记录失败时**尽力**清掉刚复制的字节再抛原错误。
- **`RemoveLook` 先删字节、再删记录**：字节删失败时记录还在，用户能再删一次；顺序反了
  字节就永远漏在盘上。
- **归属校验走实体的 `assertOwnedBy`**（不是在这里重写 if）：不符报 `LOOK_NOT_FOUND`（非 403）。
- **排序是应用层的决定**：`ListLooks` 按 `createdAt` **倒序**、同刻用 `id` 兜底
  （与 cabinet 的正序故意相反，理由见模块 README）。
- **`ReadLookCover` 不静默回落**：记录在、字节读不到 ⇒ `console.warn` + `LOOK_COVER_NOT_FOUND`
  （同 `GetRender` 的规矩）。
- **加新用例**：重选出图、从档案继续编辑都放这里；跨模块要用到的类型经 `../index.ts` 导出。
- **别做**：别在这里 import agent / assets（要图就问 `RenderSource`、要字节就问 `LookCoverStore`），
  别绕过 `toLookView` 直接回实体。
