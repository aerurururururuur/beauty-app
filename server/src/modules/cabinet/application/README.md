# modules/cabinet/application —— 应用层

放「衣橱用例」：`usecases/add-cosmetic.ts`、`list-cosmetics.ts`、`update-cosmetic.ts`、`remove-cosmetic.ts`，
外加 `mapping/cosmetic-item-view.mapper.ts`（实体 → 对外视图）。

- **现状**：四个用例都已实现并接线。
- **写法**：用例只做编排——调 `domain/validators` 校验入参、经端口（`CosmeticRepository` / `UserDirectory`）
  读写，自己不写校验规则、不认识 HTTP、不知道存储是 JSON 还是别的。
- **归属校验在这里，不在仓库里**：`update` / `remove` 都把 `item.userId !== input.userId`
  翻成 `CABINET_ITEM_NOT_FOUND`（而非 403），并且**在写之前就抛**——越权请求不改动任何数据。
  `CosmeticRepository` 端口刻意不承担归属判断，好让实现保持成纯粹的存储。
- **排序是应用层的决定**：`ListCosmetics` 按 `createdAt` 升序、同刻用 `id` 兜底，
  这样列表顺序不依赖仓库返回顺序（换存储也不会变）。
- **上限 / 存在性这类「先查后写」的检查**放在用例里，演示期单进程够用；真并发要下沉到仓库实现。
- **加新用例**：改推荐联动、批量导入、幂等去重都放这里；跨模块要用到的类型经 `../index.ts` 导出。
- **别做**：别在这里 import user 模块（要问用户就问 `UserDirectory` 端口），别绕过 `toCosmeticItemView` 直接回实体。
