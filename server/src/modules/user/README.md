# modules/user —— 用户账号（已接线）

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
| `domain/schemas/user.ts` | 形状：凭据（昵称/密码的字符串与长度上界）、用户 id 格式 + 长度常量 |
| `domain/validators/user.validator.ts` | 行为：清洗昵称（trim）、长度夹逼、拒控制字符、`VALIDATION_ERROR` |
| `domain/api/user-view.ts` | ★ 对外契约 `UserView`——**不含 passwordHash** |
| `application/usecases/` | `RegisterUser` / `AuthenticateUser` / `GetUser` |
| `application/mapping/user-view.mapper.ts` | 实体 → 视图（凭据在此剥掉，别绕开它直接回实体） |
| `infrastructure/json/user-repository.ts` | 账号表落 `dataDir/users/users.json`（tmp + rename 原子写） |
| `infrastructure/crypto/scrypt-password-hasher.ts` | scrypt 凭据 `scrypt$<salt>$<key>`，核对走定时安全比较 |
| `presentation/controllers/users.controller.ts` | `POST /users` · `POST /users/login` · `GET /users/:id` |
| `index.ts` / `compose.ts` | public barrel / `createUserModule({ dataDir })` |

## 依赖 / 被依赖

- 依赖：`shared`（`AppError` / `ErrorCode`）、`node:crypto`、zod。不碰 jobs / recommendations。
- 被依赖：`src/index.ts` 组装、`src/app.ts` 挂 `/api` 路由。

## 关键决策与它们的代价

- **存储是 JSON 单文件**（不是数据库）：账号量级小、演示单进程够用，也符合 roadmap §12 红线 5（不引 PostgreSQL / 云存储）。
  代价要说清楚：**全表读-改-写**，并发注册会互相覆盖；昵称唯一靠「先查后写」，**没有数据库级唯一约束**，竞态下能写出两个同昵称。
  要补的话，实现一个新的 `UserRepository` 在 `compose.ts` 换掉即可——用例、校验、路由、测试都不用动（Node ≥22 可用零依赖的 `node:sqlite`）。
- **错误码不区分「账号不存在」与「密码错」**：都回 `INVALID_CREDENTIALS` / 401，避免逐昵称枚举已注册账号。
- **登录不签发 token**：够演示用；要加登录态就在 `AuthenticateUser` 里补签发，核对逻辑不动。

## 接缝（将来）

- **任务归属用户**：`JobRecord` / `JobView` 加可选 `userId` →「我的妆造间」历史（需同改 jobs 的 schema / 实体 / DTO 三处）。**本轮未动 jobs**。
- **偏好并入档案**：skinType / skinTone / 常用 occasion 预设、已拥有品清单 → 喂上传预填与 `recommendations`（字段扩展点见 `domain/entities/user.ts` 注释）。
- **改密 / 注销 / 找回**：新用例放 `application/usecases/`，`UserRepository` 已有 `save` 可覆盖写。

## 红线

密码必须哈希、不存明文；现场演示只用授权人物 / 演示账号，不做真实用户数据留存。
