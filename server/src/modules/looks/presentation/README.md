# modules/looks/presentation —— 表现层

`looks.controller.ts`（请求 → 用例）+ `routes/looks.route.ts`（路径登记）—— 四个端点，
`src/app.ts` 挂在 `/api` 前缀下：

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /looks` | 存一版 → **201** `LookView`；账号不存在 → 404；超上限 → 409；源图已不在 → 404 |
| `GET /looks?userId=` | 列出自己的档案 → **200** `{ items: [...] }`（按 `createdAt` 倒序）；账号不存在 → 404 |
| `DELETE /looks/:id?userId=` | 删一版 → **204** 无响应体；不存在 / 不属于你 → 404 |
| `GET /looks/:id/cover?userId=` | 封面字节 → **200** 图片；不存在 / 不属于你 → 404；记录在但字节读不到 → 404 |

- **现状**：已实现并接线。控制器很薄——把 `request.body` / `request.query` / `request.params`
  原样交给用例（校验行为在 domain/validator 与用例里），不做业务判断。
- **归属走查询串**（`GET` / `DELETE` / 取封面用 `?userId=`）：DELETE 尤其不能指望请求体，
  不少客户端与代理会把它丢掉。
- **错误码 → HTTP**：复用 `shared/presentation/error-handler` 的**唯一映射表**，新增错误码去那里补。
  `LOOK_NOT_FOUND` = 404（「不存在」与「不属于你」共用），`LOOK_FULL` = 409，
  `LOOK_COVER_UNAVAILABLE` / `LOOK_COVER_NOT_FOUND` = 404（两句不同的话，见模块 README）。
- **只有封面那条发字节**：控制器里 `createReadStream(image.filePath)` + `reply.type(image.mimeType)`
  （同 agent 的渲染路由）。★ 另外带 `cache-control: private, no-store` —— 档案能被用户删掉，
  缓存里的图不该活得比它久；agent 那条没这条，因为它本来就受会话 TTL 管。
- **请求形状**：三条 JSON 端点只有标量与小数组，不走 multipart；`body` / `query` 缺失时给 `{}`，
  让校验器统一报 `VALIDATION_ERROR`（而不是框架 400）。
- **若将来加登录态**：`userId` 改从 token/cookie 解析、不再信任客户端传值，改动只在本层与用例入参。
