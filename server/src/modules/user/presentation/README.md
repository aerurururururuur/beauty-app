# modules/user/presentation —— 表现层

本层放「对外入口/HTTP 适配」。

- **现状**：空（空壳模块）。user 尚无任何端点——本轮**不新增错误码 / HTTP 映射 / 路由**。
- **将来放什么**：`POST /api/users`(建档) 等账号相关端点；若做鉴权，登录态入口（token/cookie）与守卫也在此层。
- **接线**：实现后在 `src/app.ts`(web shell) 挂载路由，错误码 → HTTP 复用 `shared/presentation/error-handler` 的单一映射（新增错误码去那里补，别在别处再映射）。
