# modules/looks —— 我的妆容档案（用户生成过的妆容）

> ★ **本模块内部一律叫 `look`；对外文案用前端页面上的词「我的妆容档案」，归属人叫「桃妆账号」。**
> 只换用户看得见的那几句 message，标识符 / 文件名 / 本 README 全篇**照旧**。
> 缘由同 `cabinet`（`domain/validators/look.validator.ts` 文件头）。
> ⚠️ 别"为了统一"顺着这个把模块重命名一遍。

存下用户**生成过的**妆容：一版 = **复制过来的封面图** + 那一版的方案（场景 / 风格 / 步骤 /
色板 / 产品）+ 归属账号。与 `cabinet` 是两件事：衣橱是"我有什么化妆品"，档案是"我生成过什么妆"。

`/result` 上的「保存到我的妆容档案」写这里，`/looks` 读这里，`/mine` 的档案卡只显示**套数**。

**本轮不做**：分享 / 公开 / 点赞 / 重新出图。也**没有登录态**：归属 `userId` 由客户端显式传
（与 cabinet、user 一致），改 / 删 / 取封面一律校验归属。

## ★★ 两条必须先懂的约束

### 1. 为什么封面必须**复制字节**，不能存 `sessionId + seq` 引用

- 渲染图是 `DATA_DIR/results/<sessionId>/r<seq>/result.<ext>` 上的真文件；会话有 **24h 空闲 TTL**，
  到点 `artifacts.removeAll()` **递归删掉**输入照片与全部渲染图。
- `SessionStore` **只有内存实现**，进程重启即丢；且**没有会话列表接口**，过去的会话无法枚举。
- ⇒ 存引用的话，某天那条引用会**静默指空** —— 界面照常、200、日志干净，只有图不见了。
  那是本仓头号 bug 的形状。所以 `AddLook` 把字节**复制**到档案自己的目录。

### 2. 封面字节必须落在新根 `look-covers/`，**不能**放进 `inputs/` 或 `results/`

agent 的 `sweepOrphans()` **每小时跑一次、不看 TTL**：它调 `ArtifactStore.listIds()`，
**立刻删掉任何没有活会话认领的 id**。所以：

- 封面目录 `DATA_DIR/look-covers/<lookId>/cover.<ext>`，与 `inputs/`、`results/` 平级。
- ★★ **`listIds()` 一个字都不能改**（它只枚举 `inputs/` 与 `results/`）。往它里面加一个区域
  = 让 agent 的清扫去删那个区域，每小时一次、静默。那条不变量写在
  `assets/infrastructure/file-system/artifact-store.ts` 的方法上方。

### ⚠️ 隐私口径（对外要说白，不许含糊）

agent 那条「照片与产物 24h 真删」的承诺**不覆盖档案**：存进档案的带妆图会**一直留在盘上**，
直到用户自己删这一版（或删掉整份档案）。`/looks` 页面上要明说这一点。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/look.ts` | `Look` 类（字段由 schema 声明合并而来）+ `assertOwnedBy` + 工厂 + `isSameSource` + `MAX_ITEMS_PER_USER = 100` + 三个错误工厂 |
| `domain/schemas/entities/look.ts` | 形状：`createLookSchema`（入参，**不收** `id`/`createdAt`/`coverMime`）、`lookSchema`（落盘行）、`lookTableSchema`、`lookIdSchema`、`ownerQuerySchema`（**只有类型、`.strict()`、`optional()`**） |
| `domain/validators/look.validator.ts` | 行为 + **全部长度与条数常量**、id 与归属 id 的格式正则、trim、拒控制字符、`seq` 正整数、`parseLookTable`（§4.2：规则与文案同处一地） |
| `domain/ports/look-repository.ts` | `LookRepository`：`save` / `findById` / `listByUser` / `remove`（**不含**归属判断） |
| `domain/ports/user-directory.ts` | `UserDirectory`：`exists(userId)` —— 唯一与 user 有关的接缝 |
| `domain/ports/render-source.ts` | `RenderSource`：`resolve(sessionId, seq, userId)` → 路径 + MIME **或 `null`**（拿不到就回 null，不抛） |
| `domain/ports/look-cover-store.ts` | `LookCoverStore`：`save` / `resolve` / `remove`（字节的复制 / 解析 / 真删） |
| `domain/schemas/api/look-view.ts` | ★ 对外契约 `LookView` / `LookListView`（比落盘行多一个 `coverUrl`、少一个 `coverMime`） |
| `application/usecases/` | `AddLook` / `ListLooks` / `RemoveLook` / `ReadLookCover` |
| `application/look-view.ts` | 实体 → 视图（每一格都是新对象，嵌套数组也复制） |
| `infrastructure/json/look-repository.ts` | 档案表落 `dataDir/looks/items.json`（tmp + rename 原子写） |
| `presentation/looks.controller.ts` + `presentation/routes/looks.route.ts` | `POST` / `GET` / `DELETE /looks…` + `GET /looks/:id/cover` |
| `index.ts` / `compose.ts` | public barrel / `createLooksModule({ dataDir, userExists, renders, covers })` |

## 依赖 / 被依赖

- 依赖：`shared`（`AppError` / `ErrorCode` / `ResolvedImage`）、`node:crypto`、`node:fs`(表现层建流)、zod。
  **不 import agent，也不 import assets** —— 跨模块粘合只在 `src/index.ts` 发生。
- 被依赖：`src/index.ts` 组装、`src/app.ts` 挂 `/api` 路由。

## 关键决策与它们的代价

- **封面复制字节**：代价是每条档案占一张真图的盘；换来的是它**不随 24h TTL 消失**，
  且 `/looks` 在进程重启后照样能显示（见上面约束 1）。
- **保存必须已有出图**：`AddLook` 第 ⑤ 步解析不到源图就抛 `LOOK_COVER_UNAVAILABLE`，
  **此时盘上什么都没写**。前端也据此把按钮置灰 —— 不摆一个点下去必失败的按钮。
- **幂等**：同 `(sessionId, seq)` 已存在则直接回那条。理由具体：重存多半是双击 / 刷新后重按，
  新建一条会让档案里出现两版一模一样的妆容。
- **删除顺序是先字节后记录**（同 purge）：字节删失败时记录还在，用户能再删一次；
  反过来先删记录，字节就永远漏在盘上 —— `look-covers/` **没有清扫器**兜底。
- **列表倒序**（`createdAt` 降序）：与 cabinet 的正序**故意相反** —— 衣橱是流水账，
  档案是"最近生成的那版最有用"。
- **两个封面错误码是分开的**：`LOOK_COVER_UNAVAILABLE`（**存**的时候源图没了，印在一条
  根本不存在的档案上）与 `LOOK_COVER_NOT_FOUND`（档案**在**、字节读不到）。合成一个会让其中
  一句变假话。两个都有抛出点，都不是假开关。
- **`sceneId` 允许空串**：刷新后的 `/result` 上推不出它，如实留空，不造假；
  `sceneName` 用 `session.brief.occasion` 兜底（刷新后仍有效）。
- **归还不符报 `LOOK_NOT_FOUND` / 404，不报 403**：「不存在」与「不属于你」共用，不泄露存在性。
- **存储是 JSON 单文件**、上限 `MAX_ITEMS_PER_USER = 100`：单表整表读改写，没上限会越写越慢。
  竞态窗口同 cabinet：真并发要下沉到仓库实现兜底（端口契约不变）。

## 接缝（将来）

- **重新出图 / 拿档案继续编辑**：`LookView` 里已经带着方案那几格，够重建一次出图请求；
  但**别拿它当会话**——档案没有会话 id 可用（那正是它要解决的问题）。
- **封面换成用户重选的那张**：`LookCoverStore.save` 已经能从任意源文件复制，
  加一条用例即可，端口不动。
- **迁移到带索引的存储**：换 `infrastructure/` 的实现 + 在 `compose.ts` 换一行。

## 红线

- 归属不符一律 404，不区分「不存在」与「不属于你」。
- 档案数据是用户自己的账本：不静默丢、不静默改。
- **别把 `look-covers/` 加进 `ArtifactStore.listIds()`** —— 一句话就能删光所有人的档案。
- 别让封面字节与记录脱节：写入时先字节后记录，删除时先字节后记录。
