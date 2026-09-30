import api from './index'
import { useMock } from './use-mock'

/**
 * 化妆包(用户自己的化妆品清单)HTTP 调用。
 * 契约见 server/README.md:
 *   POST   /cabinet/items             201 CosmeticItemView
 *   GET    /cabinet/items?userId=     200 { items: [...] }
 *   DELETE /cabinet/items/:id?userId= 204(无响应体)
 *
 * ★ 后端还有第 4 条 `PATCH /cabinet/items/:id`,**这里刻意没有对应的函数**:
 *   桃妆没有任何界面能改一条已有条目的名称或特性。镜像一个没人调的端点 = 多养一份
 *   永不执行的形状(与后端删掉「没有抛出点的错误码」是同一条判据),将来真做
 *   「改名」时照后端 schema 现加即可,不必先摆着。
 *
 * 归属靠显式传 userId(后端本轮不签发 token、不建会话)。
 * 删若归属不符,后端报 CABINET_ITEM_NOT_FOUND(404)——不区分「不存在」与
 * 「不属于你」,前端照常按错误提示处理即可。
 *
 * 本文件不吞错、也不编数据:校验类错误(名称超长、特性重名等)由后端给出中文
 * message,经 api/index.js 的拦截器解包成 Error.message,直接展示给用户最准确。
 * ★ 那几句 message 用的是**页面上的词**(「我的化妆包」「桃妆 ID」),不是后端的
 *   领域词(「衣橱」「昵称」)——这是刻意对齐过的,见 server 那两个 validator 的文件头。
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

/** 删除:204 无响应体。userId 走查询串(DELETE 带 body 会被不少代理丢掉)。 */
export async function removeCosmetic({ id, userId }) {
  if (useMock()) return (await import('./mock')).mockRemoveCosmetic({ id, userId })
  await api.delete(`/cabinet/items/${encodeURIComponent(id)}`, { params: { userId } })
}
