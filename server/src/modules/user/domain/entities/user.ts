/**
 * domain/entities/user.ts —— 用户账号实体(值对象/最小模型)。
 * 账号 = 昵称(身份) + 密码凭据(哈希,永不存明文)+ 建档时间。
 * 密码哈希是由 PasswordHasher 端口产出的自描述字符串(salt 已内嵌),
 * 领域层只当作不透明凭据搬运,不做校验也不解析——校验属密码校验器的事。
 * 未来扩展点(先注释,别把当前形状走死):
 *  - 皮肤/场合偏好(skinType/skinTone/常用 occasion 预设) → 上传时预填 brief
 *  - 已拥有化妆品清单(owned products) → 供 recommendations 模块「缺什么补什么」
 *  - 妆容历史归属:JobRecord 加可选 userId(「我的妆造间」)——见模块 README 接缝
 *  - 登录态:本轮只做「账号 + 密码」的核对,不签发 token / 不建会话
 */
export interface User {
  /** 用户唯一标识(UUID)。 */
  id: string;
  /** 展示昵称,同时是登录身份(全库唯一,见 UserRepository.findByNickname)。 */
  nickname: string;
  /** 密码凭据(哈希,不含明文);由 PasswordHasher 产出、只由它校验。 */
  passwordHash: string;
  /** 建档时间(ISO 8601)。 */
  createdAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 建一个已带凭据的新账号(id 由调用方生成;createdAt 取当前时刻)。 */
export function createUser(id: string, nickname: string, passwordHash: string): User {
  return { id, nickname, passwordHash, createdAt: nowIso() };
}
