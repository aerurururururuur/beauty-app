/**
 * domain/schemas/entities/user.ts —— 账号入参的「形状/契约」(zod,无行为)。
 *
 * ★ §4.2:这里只答「这是什么结构」——是字符串、`.strict()`。
 *   昵称与密码的**长度上下限**、用户 id 的**格式正则**是**业务规则**,
 *   一律在 `domain/validators/user.validator.ts`,与它们的错误文案同处一地。
 *   留在这里的只有:类型、`.strict()`。
 *
 * 这里不做动作、不写 refine/transform。
 */
import { z } from 'zod';

/** 账号凭据形状:注册与登录同形(见 validator 里为何仍分开命名语义)。 */
export const credentialsSchema = z
  .object({
    nickname: z.string(),
    password: z.string(),
  })
  .strict();

/** 路径参数 :id 的形状。 */
export const userIdSchema = z.string();

/**
 * ★ **落盘行的形状**(`dataDir/users/users.json` 里的一条)。
 *
 * 与上面那条入参 schema 不是一回事:凭据进的是**明文**,盘上留的是**哈希**,
 * `id` / `createdAt` 入参里也没有 —— 这个形状与入参没有一格是对得上的,别把两者合并。
 *
 * ★ `passwordHash` 是 `PasswordHasher` 产出的**自描述、不透明**串(salt 已内嵌):
 *   这里只查「是字符串」,不解析、不校验格式 —— 换一个哈希实现不该动 schema
 *   (端口契约见 `ports/password-hasher.ts`)。
 *
 * ⚠️ 这里**只有形状**:昵称长度、id 格式是规则,在 validator 里(§4.2)。
 *   读出口不重跑那一套 —— 盘上的数据是本服务自己写下去的,拿入参规则回溯校验,
 *   只会在某天收紧一条上限后让旧账号整个读不出来。
 */
export const userSchema = z
  .object({
    /** 用户唯一标识(UUID)。 */
    id: z.string(),
    /** 展示昵称,同时是登录身份(全库唯一,见 `UserRepository.findByNickname`)。 */
    nickname: z.string(),
    /** 密码凭据(哈希,不含明文);由 `PasswordHasher` 产出、只由它校验。 */
    passwordHash: z.string(),
    /**
     * 「我的」页上那一句自我介绍。上限在 validator(`MAX_BIO`)。
     * ★ **可选**是为了 2026-10-01 之前落盘的行照样读得出来;没写过就是没有这一格,不是空串。
     */
    bio: z.string().optional(),
    /**
     * 头像图片的 mime(`image/jpeg` 等)。**有这一格 ⟺ 有头像** —— 字节在
     * `<dataDir>/users/avatars/<id>.<ext>`,这里不存 URL(对外那条由视图层拼)。
     */
    avatarMime: z.string().optional(),
    /** 建档时间(ISO 8601)。 */
    createdAt: z.string(),
  })
  .strict();

/**
 * 改资料入参:只改传来的字段(与 `personaUpdateSchema` 同款的部分更新)。
 * ★ 两格都是**字符串** —— 头像是 dataURL 或空串(本模块不接 multipart),不是文件。
 * ★ 三态:不给 = 不动;`''` = **清空**;有字 = 改。
 */
export const userProfileSchema = z
  .object({
    bio: z.string().optional(),
    avatar: z.string().optional(),
  })
  .strict();

/** 落盘表的形状:`{ [userId]: UserRow }`。 */
export const userTableSchema = z.record(z.string(), userSchema);

/** 通过形状校验的账号凭据(仍需清洗,见 validator)。 */
export type CredentialsRaw = z.output<typeof credentialsSchema>;
/** 通过形状校验的改资料入参(仍需清洗,见 validator)。 */
export type UserProfileRaw = z.output<typeof userProfileSchema>;
/** 通过校验后的用户 id(字符串)。 */
export type UserIdScalar = z.output<typeof userIdSchema>;
/** 一条账号记录(落盘行)。★ 领域实体 `User` 就是它,见 `domain/entities/user.ts`。 */
export type UserRow = z.output<typeof userSchema>;
