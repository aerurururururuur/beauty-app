/**
 * infrastructure/crypto/scrypt-password-hasher.ts —— PasswordHasher 的 scrypt 实现。
 * 凭据是自描述字符串 `scrypt$<salt-base64>$<key-base64>`:盐随凭据一起落盘,
 * 每个账号一条独立随机盐,同一明文两次哈希结果不同(防彩虹表 / 撞库批量比对)。
 *
 * 为什么是 scrypt 而不是 argon2:后者要装原生依赖,而 node 内置 scrypt 是同一档的
 * 内存硬 KDF,零依赖(等价替换只需在 user/compose.ts 换一个实现)。
 * 明文密码只在本文件的函数栈里存在,不落盘、不进日志、不进任何返回值。
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';

/** 盐长度(字节)。 */
const SALT_BYTES = 16;
/** 派生密钥长度(字节)。 */
const KEY_BYTES = 64;
/** 凭据方案前缀(将来换算法时的分叉依据)。 */
const SCHEME = 'scrypt';

/** scrypt 回调版 → Promise 版(比 promisify 更好带类型)。 */
function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await scryptAsync(plain, salt, KEY_BYTES);
    return `${SCHEME}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(plain: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 3 || parts[0] !== SCHEME) return false;
    const salt = Buffer.from(parts[1]!, 'base64');
    const expected = Buffer.from(parts[2]!, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;
    // 用期望值的长度派生,保证两侧等长;比较走定时安全,别用 === 漏时序。
    const actual = await scryptAsync(plain, salt, expected.length);
    return timingSafeEqual(actual, expected);
  }
}
