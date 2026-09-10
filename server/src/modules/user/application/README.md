# modules/user/application —— 应用层

放「账号用例」：`usecases/register-user.ts`（注册）、`authenticate-user.ts`（登录核对）、`get-user.ts`（查档案），
外加 `mapping/user-view.mapper.ts`（实体 → 对外视图，凭据在这一步剥掉）。

- **现状**：已实现并接线。
- **写法**：用例只做编排——调 `domain/validators` 校验入参、经端口(`UserRepository` / `PasswordHasher`)读写，
  自己不写校验规则、不认识 scrypt、不认识 HTTP。明文密码只在用例方法栈内存在，哈希完即丢。
- **加新用例**：改密 / 注销 / 偏好更新都放这里；跨模块要用到的类型经 `../index.ts` 导出。
- **别做**：别在这里签发 token、别把 `passwordHash` 带进返回值（对外一律经 `toUserView`）。
