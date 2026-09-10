# modules/user/infrastructure —— 基础设施层

只实现本模块 `domain/ports` 的契约。

- **现状**：
  - `json/user-repository.ts` —— `dataDir/users/users.json` 一张小表 `{ [id]: User }`，读-改-写 + tmp/rename 原子写。
    与 jobs 的「一实体一文件」不同：按昵称查号要扫全表，单文件省掉翻目录，账号量级远没到需要索引。
  - `crypto/scrypt-password-hasher.ts` —— 凭据 `scrypt$<salt-base64>$<key-base64>`，16 字节随机盐、64 字节派生密钥，
    核对用 `timingSafeEqual`。选 scrypt 而非 argon2：Node 内置、零原生依赖，同一档的内存硬 KDF。
- **换实现**：SQLite / 别的哈希算法都新写一个文件 + 在 `user/compose.ts` 换一行，端口契约与用例不动。
  若换到有唯一约束的存储，把昵称唯一性从「用例先查后写」下沉到仓库层兜底（并发下更稳）。
- **红线**：明文密码不落盘、不进日志；落盘的凭据盐必须随凭据存储（否则无法核对）。
