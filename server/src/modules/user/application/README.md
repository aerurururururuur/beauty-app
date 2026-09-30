# modules/user/application —— 应用层

两截，同属一个模块。

**账号**：`usecases/register-user.ts`（注册）、`authenticate-user.ts`（登录核对）、`get-user.ts`（查档案），
外加 `user-view.ts`（实体 → 对外视图，凭据在这一步剥掉）。

**人设库**（✏️ 2026-09-30）：`usecases/{list,create,update,remove}-persona.ts`、
`read-persona-photo.ts`（取字节，先过归属守卫）、`analyze-persona-face.ts`（调 `FaceReader`，
**不落库、不翻译成前端档**），外加 `persona-view.ts`（行 → 视图，补 `photoUrl` / `photoSource`）。

- **播种在 `ListPersonas` 里**（读时修复）：按 `seeded.json` 里记的版本号补缺失的种子，
  已有的与用户自建的一律不动。别挪到 `CreatePersona`——还没列表过的账号也得看见种子。

- **现状**：已实现并接线。
- **写法**：用例只做编排——调 `domain/validators` 校验入参、经端口(`UserRepository` / `PasswordHasher`)读写，
  自己不写校验规则、不认识 scrypt、不认识 HTTP。明文密码只在用例方法栈内存在，哈希完即丢。
- **加新用例**：改密 / 注销 / 偏好更新都放这里；跨模块要用到的类型经 `../index.ts` 导出。
- **别做**：别在这里签发 token、别把 `passwordHash` 带进返回值（对外一律经 `toUserView`）。
