# modules/user/infrastructure —— 基础设施层

本层放「用户仓库/凭据存储的具体实现」。

- **现状**：空。`UserRepository` 契约已立（`domain/ports/user-repository.ts`），实现未写。
- **将来放什么**：JSON 落盘仓库（仿 `jobs/infrastructure/json/job-repository.ts` 的临时文件 + rename 原子写）；若做密码登录，密码哈希（如 argon2/scrypt）不落明文，存 hash + salt。
- **接线**：实现后在 `user/compose.ts` 返回实例、`src/index.ts` 接入。
