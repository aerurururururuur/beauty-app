# modules/user —— 用户账号（已接线）

> ★ **本模块内部一律叫「昵称」；但对外 message 用前端页面上的词「桃妆 ID」/「桃妆账号」。**
> 只换用户看得见的那几句 message，`nickname` / 本 README 全篇**照旧**。
> 缘由：`domain/validators/user.validator.ts` 文件头、`vue/AGENTS.md` §7.3。

账号 = **昵称（登录身份，唯一）+ 密码**。提供三个能力：注册建档、登录核对、按 id 查档案。
密码只以 **scrypt 凭据**落盘（每条独立随机盐），明文永不落库、不进日志、不回视图。

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
| `index.ts` / `compose.ts` | public barrel / `createUserModule({ dataDir })` |

## 依赖 / 被依赖

- 依赖：`shared`（`AppError` / `ErrorCode`）、`node:crypto`、zod。不碰任何出图模块。
- 被依赖：`src/index.ts` 组装、`src/app.ts` 挂 `/api` 路由。

## 关键决策与它们的代价

- **存储是 JSON 单文件**（不是数据库）：账号量级小、演示单进程够用，也符合 roadmap §13 红线 5（不引 PostgreSQL / 云存储）。
  代价要说清楚：**全表读-改-写**，并发注册会互相覆盖；昵称唯一靠「先查后写」，**没有数据库级唯一约束**，竞态下能写出两个同昵称。
  要补的话，实现一个新的 `UserRepository` 在 `compose.ts` 换掉即可——用例、校验、路由、测试都不用动（Node ≥22 可用零依赖的 `node:sqlite`）。
- **错误码不区分「账号不存在」与「密码错」**：都回 `INVALID_CREDENTIALS` / 401，避免逐昵称枚举已注册账号。
- **登录不签发 token**：够演示用；要加登录态就在 `AuthenticateUser` 里补签发，核对逻辑不动。

## 接缝（将来）

- ~~**任务归属用户**：`JobRecord` / `JobView` 加可选 `userId` →「我的妆造间」历史~~
  ✏️ 2026-09-29:**这条接缝的两个前提都没了**——`jobs` 模块已删。现在的等价物是 agent 会话，
  而 `AgentSessionView` **本来就带 `userId`**（会话一直就归属用户，取会话还按它判归属）。
  要「我的妆造间」历史，入口是**枚举会话**，不是给一条任务记录补字段。
- **偏好并入档案**：skinType / skinTone / 常用 occasion 预设 → 喂上传预填（字段扩展点见 `domain/entities/user.ts` 注释）。**已拥有品不在档案里**——它归 `cabinet` 衣橱（roadmap §9）。
- **改密 / 注销 / 找回**：新用例放 `application/usecases/`，`UserRepository` 已有 `save` 可覆盖写。

## 红线

密码必须哈希、不存明文；现场演示只用授权人物 / 演示账号，不做真实用户数据留存。
