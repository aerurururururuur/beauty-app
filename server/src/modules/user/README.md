# modules/user —— 用户账号（空壳 · 未 wire）

用户系统起点。目前**只建账号模型与仓库契约**：`User` 实体 + `UserRepository` 端口已立，无实现、无端点、未接入 `src/index.ts`（与 `weather` / `recommendations` 同款空壳）。做不做登录鉴权仍未定，本壳先把「账号本身」的形状钉住。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/user.ts` | `User`：`{ id, nickname, createdAt }` 最小模型（未来扩展点先注释不建模） |
| `domain/ports/user-repository.ts` | `UserRepository` 端口：`save(user)` / `findById(id)`（契约先立，实现后补） |
| `index.ts` | public barrel：导出 `User` / `UserRepository` 类型 + `createUserModule` |
| `compose.ts` | `createUserModule()` → `{ repository: null }`（**未实现也未接入**） |
| `application/presentation/infrastructure/` | 空层（各 1 个 README 说明将来放什么） |

## 依赖 / 被依赖

- 依赖：无（纯 TypeScript，不碰框架 / IO）。
- 被依赖：暂无（未接入 `src/index.ts`；将来由组合根装配，跨模块只经 `index.ts` barrel）。

## 现状与接缝（将来怎么接）

- **现状**：账号/仓库契约已立，无实现无端点。**零行为**——别指望它当前能干什么。
- **接缝 ①（妆容任务归属用户）**：给 `JobRecord` / `JobView` 加可选 `userId`，提交妆容任务时带上身份 →「我的妆造间」历史。**本轮不动 jobs**，只在做时改 `jobs` 的 schema/实体/DTO 三处成套。
- **接缝 ②（账号用例/端点）**：注册/改档案用例放 `application`，`POST /api/users` 等放 `presentation`（本轮无端点、无错误码、无 HTTP 映射）。
- **接缝 ③（皮肤偏好/已拥有品）**：skinType/skinTone/常用 occasion 预设与已拥有品清单，将来并入用户档案，喂给上传预填与 `recommendations`——字段扩展先见 `domain/entities/user.ts` 注释。
- **红线**：登录鉴权若做，密码必须哈希、不存明文；现场演示只用授权人物/演示账号，不做真实用户数据留存。
