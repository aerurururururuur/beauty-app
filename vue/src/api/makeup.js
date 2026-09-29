/**
 * api/makeup.js —— 「场景美妆镜」制作台的传输层。
 *
 * ✏️ 2026-09-29:**底层换成了对话 agent 那条会话链**。此前它打的是 `POST /api/jobs`
 *   那条表单流水线,而那个模块已经删掉了——现在全项目**只有一条出图路径**:
 *
 *     开会话(带 brief) + 传照片 + 发一句话 → 轮询会话 → 确认生成 → 出图
 *
 * ★ **函数本身没在这里重写一遍**:`api/agent.js` 里那五个都是现成的
 *   (`startAgentSession` / `uploadAgentPhoto` / `sendAgentMessage` /
 *   `fetchAgentSession` / `confirmAgentRender` / `renderImageHref`)。
 *   本文件只做**编排**——把"表单一次填完"这件事翻译成那几步。
 *   两份各写一遍请求,迟早只会改一份(同 `agent.js` 对 `confirmAgentRender` 的态度)。
 *
 * ⚠️ **本文件也没有 mock 分支**,理由与 `api/agent.js` 逐字相同(见它文件头):
 *   服务端的确认出图是一条**真实会花钱**的 HTTP 路由,在浏览器里复刻一份假流水线,
 *   复刻出来的既不是那条路由、也不检验那条循环。所以 `VITE_USE_MOCK=true` 时
 *   这条链**明确不可用**,而不是给一个假结果。
 */
import {
  confirmAgentRender,
  fetchAgentSession,
  renderImageHref,
  sendAgentMessage,
  startAgentSession,
  uploadAgentPhoto
} from './agent'

export { renderImageHref }

/**
 * 表单那句话。
 *
 * ★ **它是纯文本,不承担"把 brief 说给模型听"的职责**——brief 已经随开会话
 *   (`startAgentSession({ userId, brief })`)直接进了会话,模型看得到结构化字段。
 *   这句只是让对话有一个开头,顺带触发一整轮(循环要有用户消息才跑)。
 *   ⚠️ 别在这里把 brief 复述一遍:那会和结构化那份**互相矛盾**,
 *      而模型同时看到两份时信哪一份是不确定的。
 */
const OPENING_TEXT = '按我填的需求给我定一套妆。'

/**
 * 建会话 → 传照片 → 发一句话。返回**第一次会话视图**。
 *
 * 三步顺序不能换:照片必须在循环跑之前挂上,否则模型这一轮会以
 * 「你还没传照片」开头,而用户明明刚传了。
 *
 * ⚠️ 这不是"任务提交",是**把表单那条路接进对话**:提交之后仍然要用户在
 * 出图那条消息上点一次「确认生成」才会花钱(红线 §7.4)。
 */
export async function submitMakeupForm({ userId, portraitFile, brief = {} }) {
  const created = await startAgentSession({ userId, brief })
  const sessionId = created.sessionId

  await uploadAgentPhoto({ sessionId, userId, file: portraitFile })
  return sendAgentMessage({ sessionId, userId, text: OPENING_TEXT })
}

/** 读一次会话视图(轮询用)。会话不属于这个用户时后端报 404(不区分,免得能被枚举)。 */
export async function fetchMakeupSession({ sessionId, userId }) {
  return fetchAgentSession({ sessionId, userId })
}

/** ★ 出图——这条链上唯一会花钱的一次调用(转发,理由见 `api/agent.js`)。 */
export async function confirmMakeupRender({ sessionId, userId }) {
  return confirmAgentRender({ sessionId, userId })
}
