# modules/user —— 用户账号 + 人设库（已接线）

> ★ **本模块内部一律叫「昵称」；但对外 message 用前端页面上的词「桃妆 ID」/「桃妆账号」。**
> 只换用户看得见的那几句 message，`nickname` / 本 README 全篇**照旧**。
> 缘由：`domain/validators/user.validator.ts` 文件头、`vue/AGENTS.md` §7.3。

两件事，同属一个聚合边界：

1. **账号** = 昵称（登录身份，唯一）+ 密码。提供三个能力：注册建档、登录核对、按 id 查档案。
   密码只以 **scrypt 凭据**落盘（每条独立随机盐），明文永不落库、不进日志、不回视图。
2. **人设库**（`/personas` 那一族，✏️ 2026-09-30 落地）。一份人设 = 挂在账号下的一张脸：
   名字 / 关系 / 肤色档 / 面部特征 / **照片**。它在这里而不是单开一个模块，
   理由见下「关键决策」第 1 条。

**本轮不做**：登录态（不签发 token、不建会话）——登录通过只表示「这组账号密码成立」，前端拿 `id` 自己存；
也不做多机同步 / 找回密码 / 改密 / 注销。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/user.ts` | `User{ id, nickname, passwordHash, createdAt }` + `createUser` 工厂 |
| `domain/ports/user-repository.ts` | `UserRepository`：`save` / `findById` / `findByNickname` |
| `domain/ports/password-hasher.ts` | `PasswordHasher`：`hash` / `verify`（领域不认识 scrypt） |
| `domain/schemas/entities/user.ts` | 形状：凭据（昵称/密码都是字符串）、用户 id——**只有类型与 `.strict()`** |
| `domain/validators/user.validator.ts` | 行为：长度上下限与五个常量（`MAX_NICKNAME_RAW`…）、用户 id 的格式正则、清洗昵称（trim）、拒控制字符、`VALIDATION_ERROR`（§4.2：规则与文案同处一地） |
| `domain/schemas/api/user-view.ts` | ★ 对外契约 `UserView`——**不含 passwordHash** |
| `application/usecases/` | `RegisterUser` / `AuthenticateUser` / `GetUser` |
| `application/user-view.ts` | 实体 → 视图（凭据在此剥掉，别绕开它直接回实体） |
| `infrastructure/json/user-repository.ts` | 账号表落 `dataDir/users/users.json`（tmp + rename 原子写） |
| `infrastructure/crypto/scrypt-password-hasher.ts` | scrypt 凭据 `scrypt$<salt>$<key>`，核对走定时安全比较 |
| `presentation/users.controller.ts` + `presentation/routes/users.route.ts` | `POST /users` · `POST /users/login` · `GET /users/:id` |
| `index.ts` / `compose.ts` | public barrel / `createUserModule({ dataDir, faceReader? })` |

### 人设库那半边（✏️ 2026-09-30 新增）

| 路径 | 内容 |
| --- | --- |
| `domain/entities/persona.ts` | `Persona` 类（`Object.assign` 收行）+ 归属守卫 `assertOwnedBy`（不属于 ⇒ `PERSONA_NOT_FOUND`） |
| `domain/entities/persona-seeds.ts` | 5 份示例人设 + `PERSONA_SEED_VERSION`。★ 从旧前端**逐字**搬来 |
| `domain/schemas/entities/persona.ts` | 行形状；`photo` 是三态判别联合（`none` / `seed` / `file`）。★ **`skinTone` / `features` 只查形状、不查成员**，理由写在文件头 |
| `domain/validators/persona.validator.ts` | 规则与中文文案：名字长度、关系白名单、dataURL 的 mime 白名单与 1 MiB 上限、`features` 去重与条数、`至少要修改一项` |
| `domain/ports/persona-repository.ts` | `listByUser` / `findById` / `save` / `remove` / `seedVersion` / `markSeeded` |
| `domain/ports/persona-photo-store.ts` | 照片字节的存/读/删（`save` / `read` / `remove`） |
| `domain/ports/face-reader.ts` | ★ **读脸端口**（本模块的词：收 dataURL、回**后端**档 id）。**不引 makeup 的任何类型** |
| `application/persona-view.ts` | 行 → `PersonaView`（补 `photoUrl` / `photoSource`）。★ 中文派生字段**不在这里**，在前端 `decoratePersona` |
| `application/usecases/{list,create,update,remove}-persona.ts` | 四个用例；**播种在 `ListPersonas` 里**（读时修复） |
| `application/usecases/read-persona-photo.ts` | 取字节（先过归属守卫） |
| `application/usecases/analyze-persona-face.ts` | 调端口、原样转手。**不落库、不翻译成前端档** |
| `infrastructure/json/persona-repository.ts` | `dataDir/personas/personas.json` + `seeded.json`，平坦表、读出口过解析器、tmp + rename |
| `infrastructure/file-system/persona-photo-store.ts` | 字节落 `dataDir/personas/photos/<id>.<ext>`。**换照片/删照片时旧字节一起删** |
| `presentation/personas.controller.ts` + `presentation/routes/personas.route.ts` | 6 条；★ `analyze` 那条**由 deps 是否存在决定注册** |

## 依赖 / 被依赖

- 依赖：`shared`（`AppError` / `ErrorCode`）、`node:crypto`、zod。**人设库不碰 `makeup`**——
  它只说 `FaceReader` 这个自己声明的端口，真适配器在 `src/index.ts` 里接。
- 被依赖：`src/index.ts` 组装、`src/app.ts` 挂 `/api` 路由。

## 关键决策与它们的代价

- **存储是 JSON 单文件**（不是数据库）：账号量级小、演示单进程够用，也符合 roadmap §13 红线 5（不引 PostgreSQL / 云存储）。
  代价要说清楚：**全表读-改-写**，并发注册会互相覆盖；昵称唯一靠「先查后写」，**没有数据库级唯一约束**，竞态下能写出两个同昵称。
  要补的话，实现一个新的 `UserRepository` 在 `compose.ts` 换掉即可——用例、校验、路由、测试都不用动（Node ≥22 可用零依赖的 `node:sqlite`）。
- **错误码不区分「账号不存在」与「密码错」**：都回 `INVALID_CREDENTIALS` / 401，避免逐昵称枚举已注册账号。
- **登录不签发 token**：够演示用；要加登录态就在 `AuthenticateUser` 里补签发，核对逻辑不动。

人设库那半边（✏️ 2026-09-30）：

- **做在 `user` 里，不单开模块**：人设是挂在账号下的一张脸，归属校验直接用本模块的
  `UserRepository`，省掉 `cabinet` 那种 `user-directory` 端口。代价：本模块实体数量翻倍。
- ★ **行里存前端档 id（`yellow-2`），不存后端那套（`warm_beige`）**：两套词像、**色值逐条不同**，
  存哪一套决定用户看到什么颜色；而 `hex`/`desc` 只有前端有。代价：**后端不能拿 `SKIN_TONES`
  校验 `skinTone`**（会 422 掉合法人设），那一格只查形状，一致性交给
  `test/persona-vocabulary.test.ts`。
- ★ **照片落 `<dataDir>/personas/photos/`，不走 `assets` 的 `ArtifactStore`**：那东西落在
  `inputs/` 下，而 `PurgeExpiredSessions` 会真删无会话认领的 id——落进去的脸一小时后自己就没了。
  代价：字节要自己管（换照片 / 删人设时**必须自己删旧的**）。
- **照片走 JSON body 里的 dataURL，不接 multipart**：前端手上从来是 `shrinkPhoto` 出的 dataURL，
  没有 `File`；且 multipart 解析器住在 `agent/presentation/`，跨模块 import 违规。
  代价：上限**分两处**（validator 的 1 MiB + 路由 `bodyLimit`），**只改一个得到的是 413**。
- **播种记在 `personas/seeded.json`（`{ [userId]: 版本号 }`）**：没有这张表，
  用户把 5 份种子全删光后，`personas.json` 和一个从没播种过的新账号长得一模一样，
  于是「删掉的种子下次列表自己回来」。升版本只补缺失的种子 id。

## 接缝（将来）

- ~~**任务归属用户**：`JobRecord` / `JobView` 加可选 `userId` →「我的妆造间」历史~~
  ✏️ 2026-09-29:**这条接缝的两个前提都没了**——`jobs` 模块已删。现在的等价物是 agent 会话，
  而 `AgentSessionView` **本来就带 `userId`**（会话一直就归属用户，取会话还按它判归属）。
  要「我的妆造间」历史，入口是**枚举会话**，不是给一条任务记录补字段。
- **偏好并入档案**：skinType / skinTone / 常用 occasion 预设 → 喂上传预填（字段扩展点见 `domain/entities/user.ts` 注释）。**已拥有品不在档案里**——它归 `cabinet` 衣橱（roadmap §9）。
- **改密 / 注销 / 找回**：新用例放 `application/usecases/`，`UserRepository` 已有 `save` 可覆盖写。

## 红线

密码必须哈希、不存明文；现场演示只用授权人物 / 演示账号。

✏️ 2026-09-30：此处原写「不做真实用户数据留存」——**人设库落地后这句不再成立**。
人设照片存 `<dataDir>/personas/photos/`，**没有 TTL**，只有用户自己删掉那份人设才消失
（与 agent 会话照片那条「24h 真删」是两套口径）。所以文案不许说「不上传 / 只在这台浏览器里」，
也不许说「已加密」。
