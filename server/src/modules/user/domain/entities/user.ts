/**
 * domain/entities/user.ts —— 用户账号实体(值对象/最小模型)。
 * 空壳模块:目前只有账号本身的最小字段,不做登录态/偏好建模。
 * 未来扩展点(先注释,别把空壳路走死):
 *  - 皮肤/场合偏好(skinType/skinTone/常用 occasion 预设) → 上传时预填 brief
 *  - 已拥有化妆品清单(owned products) → 供 recommendations 模块「缺什么补什么」
 *  - 妆容历史归属:JobRecord 加可选 userId(「我的妆造间」)——见模块 README 接缝
 */
export interface User {
  /** 用户唯一标识(UUID)。 */
  id: string;
  /** 展示昵称(轻量身份,本轮无密码)。 */
  nickname: string;
  /** 建档时间(ISO 8601)。 */
  createdAt: string;
}
