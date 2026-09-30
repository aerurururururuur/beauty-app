import api from './index'
import { useMock } from './use-mock'

/**
 * 账号 HTTP 调用(后端 user 模块)。
 *   POST /users        注册 → 201 UserView { id, nickname, createdAt }
 *   POST /users/login  登录 → 200 UserView
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

/** 注册:桃妆 ID 与密码同提交。 */
export async function registerUser({ taozhuangId, password }) {
  const nickname = String(taozhuangId ?? '').trim()
  if (useMock()) return (await import('./mock')).mockLoginUser({ nickname })
  return api.post('/users', { nickname, password })
}

/**
 * 登录:ID 或密码不对时后端报 401,拦截器已把 message 解成可读文案
 * (「账号或密码不对」——刻意不区分是哪一个,免得能被枚举)。
 */
export async function loginUser({ taozhuangId, password }) {
  const nickname = String(taozhuangId ?? '').trim()
  if (useMock()) return (await import('./mock')).mockLoginUser({ nickname })
  return api.post('/users/login', { nickname, password })
}
