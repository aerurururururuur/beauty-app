/**
 * domain/ports/password-hasher.ts —— 密码凭据端口(本模块持契约)。
 * 领域层不认识 scrypt/argon2,只认识「给我明文 → 还我不透明凭据」与「核对」两个动作;
 * 具体算法与盐的存放方式全部封在 infrastructure/crypto 里(可换实现,业务层不感知)。
 * 红线:落库的永远只有 hash() 的产物,明文密码不落盘、不进日志、不回显。
 */
export interface PasswordHasher {
  /** 把明文密码转成可落库的凭据(自带随机盐,同一明文两次结果不同)。 */
  hash(plain: string): Promise<string>;
  /** 核对明文与已落库凭据是否匹配;凭据格式非法时返回 false,不抛异常。 */
  verify(plain: string, encoded: string): Promise<boolean>;
}
