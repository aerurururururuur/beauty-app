# modules/user/presentation —— 表现层

`controllers/users.controller.ts` —— 三个端点，`src/app.ts` 挂在 `/api` 前缀下：

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /users` | 注册 → **201** `UserView`；重名 → 409 |
| `POST /users/login` | 登录核对 → **200** `UserView`；不符 → 401 |
| `GET /users/:id` | 查档案 → **200** `UserView`；不存在 → 404 |

- **现状**：已实现并接线。控制器很薄——把 `request.body` 原样交给用例（校验行为在 domain/validator 与用例里），不做业务判断。
- **错误码 → HTTP**：复用 `shared/presentation/error-handler` 的**唯一映射表**，新增错误码去那里补，别在别处再映射。
- **请求形状**：账号只收 JSON 标量、没有文件，故不走 multipart；`body` 缺失时给 `{}`，让校验器统一报 `VALIDATION_ERROR`。
- **登录态若要做**：token/cookie 的入口与守卫也放本层；签发逻辑在 `application` 的 `AuthenticateUser`。
