# modules/cabinet —— 衣橱（用户自己的化妆品）

用户录下**自己已有的化妆品**：一件 = 名称 + **自定义特性**（标签/值），按 `userId` 归属。
这是 roadmap §9「用户『已拥有产品』从哪来」的答案——将来做平价推荐时，按 `userId` 经 `listByUser`
拿这份清单，做「缺什么补什么：优先已有品，缺的推平价线」。（§9 原有的空壳模块已删，见那节的墓碑。）

**本轮不做**：化妆品拍照识别（红线 §13-5）、条目的图片/保质期、公开分享。
也**没有登录态**：归属 `userId` 由客户端显式传（与 user 模块「不签发 token」一致），
改/删一律校验归属。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/cosmetic-item.ts` | `CosmeticItem{ id, userId, name, attributes[], createdAt, updatedAt? }` + 工厂 + `MAX_ITEMS_PER_USER` |
| `domain/schemas/cosmetic-item.ts` | 形状：新增/修改入参、条目 id、归属查询 + 全部长度与条数常量 |
| `domain/validators/cosmetic-item.validator.ts` | 行为：trim、拒控制字符、**标签去重**、上下限、「修改至少要给一个字段」 |
| `domain/validators/validate.ts` | 本模块的 `zodIssuesMessage` 拷贝（与 jobs / user / weather 同款） |
| `domain/ports/cosmetic-repository.ts` | `CosmeticRepository`：`save` / `findById` / `listByUser` / `remove`（**不含**归属判断） |
| `domain/ports/user-directory.ts` | `UserDirectory`：`exists(userId)`——本模块唯一与 user 有关的接缝 |
| `domain/api/cosmetic-item-view.ts` | ★ 对外契约 `CosmeticItemView` / `CosmeticListView` |
| `application/usecases/` | `AddCosmetic` / `ListCosmetics` / `UpdateCosmetic` / `RemoveCosmetic` |
| `application/mapping/cosmetic-item-view.mapper.ts` | 实体 → 视图（特性是新建对象，不共享引用） |
| `infrastructure/json/cosmetic-repository.ts` | 衣橱表落 `dataDir/cabinet/items.json`（tmp + rename 原子写） |
| `presentation/controllers/cabinet.controller.ts` | `POST` / `GET` / `PATCH` / `DELETE /cabinet/items…` |
| `index.ts` / `compose.ts` | public barrel / `createCabinetModule({ dataDir, userExists })` |

## 依赖 / 被依赖

- 依赖：`shared`（`AppError` / `ErrorCode`）、`node:crypto`(randomUUID)、zod。**不 import user 模块**。
- 被依赖：`src/index.ts` 组装（并把 user 的 `getUser` 包成 `userExists` 粘进来）、`src/app.ts` 挂 `/api` 路由。

## 关键决策与它们的代价

- **特性是完全自定义的「标签 + 值」，不给枚举**。用户写什么就存什么（只 trim），
  系统没资格替用户规范用词。
  **代价要说清楚**：§9 的「缺什么补什么」因此拿不到稳定的「品类」锚点——将来做推荐时没法
  可靠判断「你已经有唇部了」。这是拿录入自由度换来的，不是遗漏。
  **缓解**：前端的快捷标签 chip（品类 / 色号 / 质地）在不强制的前提下引导多数人用这几个词，
  于是推荐**有一条可依赖的约定标签**可用。这是约定，不是枚举。
- **`attributes` 是有序数组而非 `Record<string,string>`**：保留录入顺序（UI 直接渲染）、
  重复标签的存在性判断更明确、避开对象键的隐式去重。
- **改/删归属不符报 `CABINET_ITEM_NOT_FOUND` / 404，不报 403**：不泄露「这条存在但不属于你」。
  无守卫前提下这是最低成本的正确性；测试专门盯着「报错之余**原数据一个字没动**」。
- **独立模块，不塞进 user 档案**：衣橱是有自己生命周期的 CRUD 资源（增删改、逐条排序、
  以后可能要图片/保质期），塞进 user 会撑大 `User` 实体和它的 JSON 单表。
  §9 真正需要的只是「按 userId 查已拥有品」这个能力，`listByUser` 就是那个接缝。
- **存储是 JSON 单文件**、上限 `MAX_ITEMS_PER_USER = 100`：单表整表读改写，没上限的话
  演示时反复添加会越写越慢。件数上限是**按人**算的。竞态窗口同 user 模块：真并发要下沉到
  仓库实现兜底（端口契约不变）。

## 接缝（将来）

- **平价同款推荐**（曾是空壳模块 `recommendations`，2026-09-10 删除）：要做时在 `src/index.ts`
  把 `cabinet` 的 `listByUser`（或经路由的 `listCosmetics`）注入即可——推荐真正需要的
  只是「按 userId 查已拥有品」这一个能力，而它已经在这儿了。**端口形状要重新声明**，
  别照搬删掉的那份（见 roadmap §9 留下的设计约束）。
- **条目图片 / 保质期 / 使用频率**：加在 `CosmeticItem` 上，注意同步 schema / 视图 / 仓库迁移。
- **幂等去重**（同名同特性不重复录入）：属用例层判断，端口不动。

## 红线

- 本轮**不做化妆品拍照识别**（红线 5）。
- 归属不符一律 404，不区分「不存在」与「不属于你」。
- 衣橱数据是用户自己的账本：不静默丢、不静默改（重复标签宁可报错也不覆盖）。
