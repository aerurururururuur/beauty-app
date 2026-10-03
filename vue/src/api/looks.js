import api, { API_BASE } from './index'

/**
 * 我的妆容档案 HTTP 调用。契约见 server/src/modules/looks/presentation/README.md:
 *   POST   /looks                    201 LookView
 *   GET    /looks?userId=            200 { items: [...] }(按存下来的时间倒序)
 *   DELETE /looks/:id?userId=        204(无响应体)
 *   GET    /looks/:id/cover?userId=  200 图片字节
 *
 * ★ 四条都有真的调用点:「保存到我的妆容档案」(ResultView)、`/looks` 列表、
 *   每张卡上的「删掉」、以及列表里每张封面。**别再加只镜像后端、没人调的端点**。
 *
 * 归属靠显式传 userId(后端本轮不签发 token)。
 * 保存时若这次生成的图已经找不到了(会话 24h 到期被清 / 后端重启过),
 * 后端报 LOOK_COVER_UNAVAILABLE(404)——那句 message 已经是给人看的,原样展示。
 *
 * ⚠️ 存进档案的带妆图**不随 24h 删除**,会一直留在服务端直到用户自己删掉这一版。
 */

/** 列表:LookView[](后端用 { items } 包一层,取里层数组)。 */
export async function listLooks({ userId }) {
  const res = await api.get('/looks', { params: { userId } })
  return res?.items || []
}

/**
 * 把这一版妆容存进档案:回 LookView(含后端生成的 id 与 coverUrl)。
 * ★ 方案那几格(body 里的 styleName / steps / palette…)就是 `/result` 上正在展示的那一套,
 *   原样带给后端存档;前端不在这里编任何一格。
 */
export async function saveLook(body) {
  return api.post('/looks', body)
}

/** 删一版:204 无响应体。userId 走查询串(DELETE 带 body 会被不少代理丢掉)。 */
export async function removeLook({ id, userId }) {
  await api.delete(`/looks/${encodeURIComponent(id)}`, { params: { userId } })
}

/**
 * 封面的资源地址。视图里的 `coverUrl` 是**路径式**的(`/looks/<id>/cover`),所以要补 `API_BASE`;
 * 后端靠**查询串**判归属,所以还要补 `?userId=`(同 `renderImageHref`)。
 */
export function lookCoverHref(url, userId) {
  if (!url) return ''
  const base = /^https?:/.test(url) ? url : `${API_BASE}${url}`
  return `${base}${base.includes('?') ? '&' : '?'}userId=${encodeURIComponent(userId || '')}`
}
