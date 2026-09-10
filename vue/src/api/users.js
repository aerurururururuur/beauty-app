import api from './index'
import { useMock } from './use-mock'

/**
 * 账号 HTTP 调用(后端 user 模块,已存在,本轮不新增端点)。
 *   POST /users        注册 → 201 UserView { id, nickname, createdAt }
 *   POST /users/login  登录 → 200 UserView
 *
 * ★ 安全红线:密码只在**本次请求体内**出现一次,不落 localStorage、不进 store、
 *   不写日志。后端只存 scrypt 凭据、明文永不回视图,也不签发 token——
 *   所以前端拿到 UserView 后,除了 id/nickname 之外没有任何"凭证"可以保存。
 *   这不是登录态,只是"这次演示用的是哪个账号"。
 */

/** 注册:昵称 2–32 字,密码 6–128 位(与后端校验一致)。 */
export async function registerUser({ nickname, password }) {
  if (useMock()) return (await import('./mock')).mockLoginUser({ nickname })
  return api.post('/users', { nickname, password })
}

/** 登录:昵称或密码不对时后端报 401,拦截器已把 message 解成可读文案。 */
export async function loginUser({ nickname, password }) {
  if (useMock()) return (await import('./mock')).mockLoginUser({ nickname })
  return api.post('/users/login', { nickname, password })
}
