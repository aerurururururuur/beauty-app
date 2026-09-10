import api from './index'
import { useMock } from './use-mock'

/**
 * 衣橱(用户自己的化妆品清单)HTTP 调用。
 * 契约见 server/README.md:
 *   POST   /cabinet/items             201 CosmeticItemView
 *   GET    /cabinet/items?userId=     200 { items: [...] }
 *   PATCH  /cabinet/items/:id         200 CosmeticItemView
 *   DELETE /cabinet/items/:id?userId= 204(无响应体)
 *
 * 归属靠显式传 userId(后端本轮不签发 token、不建会话)。
 * 改/删若归属不符,后端报 CABINET_ITEM_NOT_FOUND(404)——不区分「不存在」与
 * 「不属于你」,前端照常按错误提示处理即可。
 *
 * 本文件不吞错、也不编数据:校验类错误(名称超长、特性重名等)由后端给出中文
 * message,经 api/index.js 的拦截器解包成 Error.message,直接展示给用户最准确。
 */

/** 列表:CosmeticItemView[](后端用 { items } 包一层,取里层数组)。 */
export async function listCosmetics({ userId }) {
  if (useMock()) return (await import('./mock')).mockListCosmetics({ userId })
  const res = await api.get('/cabinet/items', { params: { userId } })
  return res?.items || []
}

/** 新增:回 CosmeticItemView(含后端生成的 id)。 */
export async function addCosmetic({ userId, name, attributes = [] }) {
  if (useMock()) return (await import('./mock')).mockAddCosmetic({ userId, name, attributes })
  return api.post('/cabinet/items', { userId, name, attributes })
}

/**
 * 修改:name / attributes 至少给一个。
 * 只把**真要改的字段**放进 body——后端把「两个都不给」当空操作直接拒掉
 * (见 cabinet/domain/validators/cosmetic-item.validator.ts)。
 */
export async function updateCosmetic(id, { userId, name, attributes }) {
  const body = { userId }
  if (name !== undefined) body.name = name
  if (attributes !== undefined) body.attributes = attributes
  if (useMock()) return (await import('./mock')).mockUpdateCosmetic(id, body)
  return api.patch(`/cabinet/items/${encodeURIComponent(id)}`, body)
}

/** 删除:204 无响应体。userId 走查询串(DELETE 带 body 会被不少代理丢掉)。 */
export async function removeCosmetic({ id, userId }) {
  if (useMock()) return (await import('./mock')).mockRemoveCosmetic({ id, userId })
  await api.delete(`/cabinet/items/${encodeURIComponent(id)}`, { params: { userId } })
}
