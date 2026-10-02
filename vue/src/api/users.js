import api, { API_BASE } from './index'

/**
 * 账号 HTTP 调用(后端 user 模块)。
 *   POST  /users              注册 → 201 UserView
 *   POST  /users/login        登录 → 200 UserView
 *   GET   /users/:id          回读档案 → 200 UserView(「我的」页拿它)
 *   PATCH /users/:id          改资料(简介 / 头像的部分更新)→ 200 UserView
 *   GET   /users/:id/avatar   头像字节;没设过 → 404
 *
 * `UserView` = `{ id, nickname, bio, avatarUrl, avatarSource, createdAt }`。
 * ★ **`bio` / `avatarUrl` 恒在**(没有就是 `''`):`undefined` 会让 `<textarea>`/`<img>` 在 Vue 里
 *   变成非受控,而那是**静默**的坏法(同人设的 `notes`)。
 *
 * ★ 字段名对不上是这里的全部要点:桃妆登录页收的是「桃妆 ID」,后端那个字段叫
 *   `nickname`。两边是**同一个东西的两个名字**,映射只写在这一处——
 *   换名字时改这里,不要去改后端的 schema,也不要在 store 或页面里各拼一次。
 *   后端对 nickname 的约束是 2–32 字(太短/太长会 422,message 已是人话)。
 *
 * ★ 安全红线:密码只在**本次请求体内**出现一次,不落 localStorage、不进 store、
 *   不写日志。后端只存 scrypt 凭据、明文永不回视图,也不签发 token——
 *   所以前端拿到 UserView 后,除了 id/nickname 之外没有任何"凭证"可以保存。
 *   这不是登录态,只是"这次用的是哪个账号"。
 */

/** 「个人简介」上限(字)。★ 后端也有一份(`user.validator.ts` 的 `MAX_BIO`),改一处要改两处。 */
export const MAX_BIO = 60

/**
 * 头像进 `<img :src>` 的地址(没有头像时是空串)。
 * ★ 后端给的是 `/users/<id>/avatar`(**不含 `/api`**):裸路径会被 Vite 当成 SPA 路由、
 *   回 index.html ⇒ 破图且**不报错**,所以前缀必须在这里补。
 */
export function avatarSrc(profile) {
  if (!profile || profile.avatarSource !== 'stored') return ''
  return `${API_BASE}${profile.avatarUrl || ''}`
}

/** 注册:桃妆 ID 与密码同提交。 */
export async function registerUser({ taozhuangId, password }) {
  const nickname = String(taozhuangId ?? '').trim()
  return api.post('/users', { nickname, password })
}

/**
 * 登录:ID 或密码不对时后端报 401,拦截器已把 message 解成可读文案
 * (「账号或密码不对」——刻意不区分是哪一个,免得能被枚举)。
 */
export async function loginUser({ taozhuangId, password }) {
  const nickname = String(taozhuangId ?? '').trim()
  return api.post('/users/login', { nickname, password })
}

/** 回读档案。★ 只读 `id` —— 昵称以后端那份为准,本机存的那份只是"上次是谁"的线索。 */
export async function fetchProfile({ userId } = {}) {
  return api.get(`/users/${encodeURIComponent(userId)}`)
}

/**
 * 改资料。★ `avatar` **三态**:不传 = 不动;`''` = 删头像;dataURL = 换一张。
 *   调用方必须分清「没改」与「清空」——把"没传"当成"清空"会在用户只改简介时**顺手删掉他的头像**。
 */
export async function updateProfile({ userId, bio, avatar } = {}) {
  const body = {}
  if (bio !== undefined) body.bio = bio
  if (avatar !== undefined) body.avatar = avatar
  return api.patch(`/users/${encodeURIComponent(userId)}`, body)
}
