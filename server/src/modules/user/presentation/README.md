# modules/user/presentation —— 表现层

`users.controller.ts`（请求 → 用例）+ `routes/users.route.ts`（路径登记）—— 三个端点，`src/app.ts` 挂在 `/api` 前缀下：

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /users` | 注册 → **201** `UserView`；重名 → 409 |
| `POST /users/login` | 登录核对 → **200** `UserView`；不符 → 401 |
| `GET /users/:id` | 查档案 → **200** `UserView`；不存在 → 404 |

人设库那 6 条（✏️ 2026-09-30），在 `personas.controller.ts` + `routes/personas.route.ts`：

| 方法 & 路径 | 说明 |
| --- | --- |
| `GET /personas?userId=` | 列表 → **200** `{ personas, canAnalyzeFace }` |
| `POST /personas` | 建档 → **201** `PersonaView`（播种之外的用户自建） |
| `PATCH /personas/:id` | 改 → **200** `PersonaView`；换照片/删照片旧字节一起删 |
| `DELETE /personas/:id?userId=` | 删 → **204**，连照片字节 |
| `GET /personas/:id/photo?userId=` | 图片字节（走 `<img>`，不走 axios） |
| `POST /personas/analyze` | ★ **会花钱**；只在注入读脸端口时注册 |

- ★ **`analyze` 那条由 deps 决定注册**（`VISION_ANALYZER=off` ⇒ 404，`canAnalyzeFace: false`）。
  照 `agent.route.ts` 的写法：`...(deps.analyzeFace ? { analyzeFace } : {})`。
- ★ **归属不符回 404、不回 403**（`PERSONA_NOT_FOUND` 与「不存在」共用一个码，不外泄存在性）。
- ⚠️ **`photo` 用 `''` 表示「删掉照片」**，与今天 `updatePersona` 的语义一致。

- **现状**：已实现并接线。控制器很薄——把 `request.body` 原样交给用例（校验行为在 domain/validator 与用例里），不做业务判断。
- **错误码 → HTTP**：复用 `shared/presentation/error-handler` 的**唯一映射表**，新增错误码去那里补，别在别处再映射。
- **请求形状**：账号只收 JSON 标量、没有文件，故不走 multipart；`body` 缺失时给 `{}`，让校验器统一报 `VALIDATION_ERROR`。
- **登录态若要做**：token/cookie 的入口与守卫也放本层；签发逻辑在 `application` 的 `AuthenticateUser`。
