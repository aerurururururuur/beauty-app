# modules/cabinet/presentation —— 表现层

`controllers/cabinet.controller.ts` —— 四个端点，`src/app.ts` 挂在 `/api` 前缀下：

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /cabinet/items` | 新增 → **201** `CosmeticItemView`；用户不存在 → 404；超上限 → 409 |
| `GET /cabinet/items?userId=` | 列表 → **200** `{ items: [...] }`；用户不存在 → 404 |
| `PATCH /cabinet/items/:id` | 修改 → **200** `CosmeticItemView`；不存在/不属于你 → 404 |
| `DELETE /cabinet/items/:id?userId=` | 删除 → **204** 无响应体；不存在/不属于你 → 404 |

- **现状**：已实现并接线。控制器很薄——把 `request.body` / `request.query` / `request.params` 原样交给用例
  （校验行为在 domain/validator 与用例里），不做业务判断。
- **归属走查询串或请求体，不由路径表达**：`GET` / `DELETE` 用 `?userId=`（DELETE 尤其不能指望请求体，
  不少客户端与代理会把它丢掉）；`POST` / `PATCH` 用请求体。
- **错误码 → HTTP**：复用 `shared/presentation/error-handler` 的**唯一映射表**，新增错误码去那里补，
  别在别处再映射。`CABINET_ITEM_NOT_FOUND` = 404（「不存在」与「不属于你」共用），`CABINET_FULL` = 409。
- **请求形状**：只有 JSON 标量与小数组、没有文件，故不走 multipart；`body` / `query` 缺失时给 `{}`，
  让校验器统一报 `VALIDATION_ERROR`（而不是框架 400）。
- **若将来加登录态**：`userId` 改从 token/cookie 解析、不再信任客户端传值，改动只在本层与用例入参。
