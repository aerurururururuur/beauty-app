/**
 * domain/entities/user.ts —— 用户账号实体(值对象/最小模型)。
 * 账号 = 昵称(身份) + 密码凭据(哈希,永不存明文)+ 建档时间。
 * 密码哈希是由 PasswordHasher 端口产出的自描述字符串(salt 已内嵌),
 * 领域层只当作不透明凭据搬运,不做校验也不解析——校验属密码校验器的事。
 *
 * ★ **形状不在本文件**:`User` 由 `schemas/entities/user.ts` 的 `userSchema` 推导
 *   (`UserRow`),本文件只放那个工厂。§4.1:同一个形状只有一份定义。
 *   别在这里补 `id: string` 之类的字段声明 —— 那是第二份定义,而且它会**盖过** schema:
 *   字段改了 schema 没改这里,编译不报错,只在写盘时悄悄丢。
 *
 * 本文件**没有类**:账号没有需要「当前状态 / 归属」才判得了的规则,
 * 昵称唯一性属「需要跨记录事实」(§5 表第三行,归持久层,见 register-user.ts 的注释),
 * 凭据核对要经 `PasswordHasher` 端口(是用例的编排,不是实体的纯判定)。
 * 没有行为可挂的类只会是一层脚手架(§3)。
 *
 * 未来扩展点(先注释,别把当前形状走死):
 *  - 皮肤/场合偏好(skinType/skinTone/常用 occasion 预设) → 上传时预填 brief
 *  - 已拥有化妆品清单:已拍板**不塞进档案**,归 cabinet 衣橱(roadmap §9)
 *  - 妆容历史归属:JobRecord 加可选 userId(「我的妆造间」)——见模块 README 接缝
 *  - 登录态:本轮只做「账号 + 密码」的核对,不签发 token / 不建会话
 */
import type { UserRow } from '../schemas/index.js';

/** 账号实体。字段的含义与约束写在 `schemas/entities/user.ts` 的对应格上。 */
export type User = UserRow;

function nowIso(): string {
  return new Date().toISOString();
}

/** 建一个已带凭据的新账号(id 由调用方生成;createdAt 取当前时刻)。 */
export function createUser(id: string, nickname: string, passwordHash: string): User {
  return { id, nickname, passwordHash, createdAt: nowIso() };
}
