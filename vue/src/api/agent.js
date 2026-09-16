import api, { API_BASE } from './index'

/**
 * 对话 agent 的 HTTP 调用。
 * 契约见 server/src/modules/agent/README.md「端点」一节:
 *   POST /agent/sessions            201 会话视图
 *   GET  /agent/sessions/:id        200 会话视图(?userId=)
 *   POST /agent/sessions/:id/messages  200 本轮视图(turn view)
 *   POST /agent/sessions/:id/photo     200 会话视图(multipart:face + userId)
 *   POST /agent/sessions/:id/render    ★ 200 本轮视图 —— 全项目唯一会花钱的入口
 *   GET  /agent/sessions/:id/renders/:seq   200 图片字节(?userId=)
 *
 * 归属靠显式传 userId(后端本轮不签发 token、不建会话),与 cabinet 一致。
 *
 * ★★ **本文件是全项目唯一没有 mock 分支的 api 模块,这是有意的。**
 *   其余五个模块都写着 `if (useMock()) return (await import('./mock')).xxx(...)`,
 *   因为它们在浏览器里有一份形状逐字段一致的假后端。对话这条路**没有**:
 *   它的状态在服务端一个真实的 `messages[]` 上,而服务端的**确认出图**
 *   是一条真实的、会花钱的 HTTP 路由——在浏览器里复刻一份,复刻出来的既不是
 *   那条路由、也不检验那条循环,只会让"看起来能用"与"真的能用"分不清。
 *   所以 `VITE_USE_MOCK=true` 时对话页**明确显示不可用**,而不是给一个假对话。
 *   (见 `pages/AgentView.vue` 顶部那道判断。)
 *
 * ⚠️ **它也不透出会话内容**:服务端刻意不返回 `messages[]`(见
 *   `application/mapping/turn-view.mapper.ts` 文件头)。所以刷新之后能恢复的是
 *   **妆面 / 有没有照片 / 已出的图 / 待确认框**,而不是聊天原文。
 */

/**
 * 对话请求的超时(毫秒)。
 *
 * ★ **必须单独给,不能用实例缺省那 30 秒**——三条理由,第三条是硬的:
 *   ① 服务端单轮墙钟预算是 **60 秒**(`agent-loop.ts` 的 `DEFAULT_TURN_TIMEOUT_MS`),
 *      30 秒会在服务端还正常工作时先把连接掐掉;
 *   ② 出图那几秒发生在 `render` 那次请求**内部的工具执行里**,而循环的 deadline
 *      只在每次迭代开头检查,所以单轮可以略微超过 60 秒;
 *   ③ ★ **掐掉 `render` 请求退不了钱**——图已经出了、会话已经记下了,
 *      前端却只能报"请求失败"。所以客户端的超时必须**严格大于**服务端的最坏情况:
 *      **宁可多等,不可错报。**
 *   90 = 60 秒预算 + 出图 + 网络与 JSON 的余量。
 *   ⚠️ 它与 `DEFAULT_TURN_TIMEOUT_MS` **是一对,要一起改**。
 */
export const AGENT_TIMEOUT_MS = 90000

/**
 * 一句话的长度上限(字)。**与后端 `sendMessageSchema` 的 `MAX_AGENT_TEXT` 同值。**
 * 前端先挡一道只是省一次白跑的 422;真正的把关在后端(两处要一起改)。
 */
export const MAX_AGENT_TEXT = 1000

/** 这几条都走同一份超时(理由见 `AGENT_TIMEOUT_MS`)。 */
const longRequest = { timeout: AGENT_TIMEOUT_MS }

/** 开一个会话 → 会话视图(新会话里一条消息都没有)。 */
export async function startAgentSession({ userId }) {
  return api.post('/agent/sessions', { userId }, longRequest)
}

/**
 * 读一次会话视图。刷新页面后靠它接回上下文。
 * 会话不存在 / 不属于这个用户 → 后端**报同一个 404**(不区分,免得能被枚举)。
 */
export async function fetchAgentSession({ sessionId, userId }) {
  return api.get(`/agent/sessions/${encodeURIComponent(sessionId)}`, {
    params: { userId },
    ...longRequest
  })
}

/** 发一句话,跑一整轮(可能调工具)→ 本轮视图(含 `stopReason` 与 `events`)。 */
export async function sendAgentMessage({ sessionId, userId, text }) {
  return api.post(
    `/agent/sessions/${encodeURIComponent(sessionId)}/messages`,
    { userId, text },
    longRequest
  )
}

/**
 * 上传本人照片(multipart,字段 `face` + `userId`)→ 会话视图。
 * ★ 照片**不进对话历史**,只存盘;服务端另往历史里补一句「我传了一张本人的正面照片。」
 *   而那句话**不透出到视图**——所以气泡里那句由前端自己补(见 `stores/agent.js`)。
 */
export async function uploadAgentPhoto({ sessionId, userId, file }) {
  const form = new FormData()
  form.append('face', file)
  form.append('userId', userId)
  return api.post(`/agent/sessions/${encodeURIComponent(sessionId)}/photo`, form, longRequest)
}

/**
 * ★ **出图**——全项目唯一会真的花钱的一次调用。
 *
 * 它**一个出图参数都不传**:要出的就是用户在屏幕上看到的那一套,而那一套已经在会话里了。
 *
 * ✏️ **2026-09-16:这条路由有两个入口,前端一个都不用区分**——
 *   ① 模型提了请求、在等用户点头(界面上那条消息由 `pendingRender` 摆出来);
 *   ② 模型一次都没提,用户点的是**界面按状态自己摆**的那条(`renderOffer`)。
 *   两个都由服务端按会话状态分派,请求体**逐字相同**。
 *   ★ 所以这里**不新增函数、不新增路由**:同样的东西写两份,迟早只会改一份。
 *
 * 后端回 **422** 时有三个真实原因(都是"这一次这个动作不成立"):
 *   ① 没有妆面;② 没有照片;③ 上一轮欠着的**不是**出图请求(那是"崩在中间"的畸形状态)。
 *   message 本身就是人话,调用方**不按 code 分支**,重新拉一次会话视图即可
 *   (见 `stores/agent.js` 的 `confirmRender`)。★ 还有一种是并发连点:同一个会话
 *   正在出图时也回 422("正在出图")——那是服务端的进程内锁,`AGENT.md` §7.1 有记。
 */
export async function confirmAgentRender({ sessionId, userId }) {
  return api.post(`/agent/sessions/${encodeURIComponent(sessionId)}/render`, { userId }, longRequest)
}

/**
 * 成品图的资源地址。
 * 视图里的 `renders[].url` 是**路径式**的(`/agent/sessions/<id>/renders/<seq>`),
 * 所以要像 `makeup.js` 的 `resultImageHref()` 那样补上 `API_BASE`。
 *
 * ★ **还要补 `?userId=`**:取图那条路由靠**查询串**判归属(`GET` 不指望请求体)。
 *   代价是那个 URL 会进浏览器历史与缓存——已知,记在交付说明里。
 */
export function renderImageHref(url, userId) {
  if (!url) return ''
  const base = /^https?:/.test(url) ? url : `${API_BASE}${url}`
  return `${base}${base.includes('?') ? '&' : '?'}userId=${encodeURIComponent(userId || '')}`
}
