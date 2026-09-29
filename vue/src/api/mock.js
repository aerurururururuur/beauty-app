/**
 * api/mock.js —— 演示模式的假后端。
 * 不联网即复刻真实 HTTP 契约(UserView / CosmeticItemView),使前端可离线体验
 * 账号与衣橱那两屏。
 *
 * ✏️ 2026-09-29:**假任务流水线整段删掉了**(`mockCreateJob` / `mockGetJob` /
 *   `STEP_AT` 时间轴 / 它的场合判定、风格文案、色板、参考图与解读那几组辅助)。
 *   表单那条路已经改走 agent 会话链,而**对话链刻意没有 mock 分支**
 *   (理由写在 `api/agent.js` 文件头:确认出图是一条真实会花钱的路由,
 *   在浏览器里复刻一份只会让"看起来能用"和"真的能用"分不清)。
 *   所以 `VITE_USE_MOCK=true` 时出图那条链**明确不可用**,不再有假结果可回放。
 *   ⚠️ 这里的 `occCn` / `TONE_MIX` / `buildLook` 等**不要再加回来**:
 *      它们复刻的是已经删掉的 `jobs` 流水线的口径,与引擎现在的算法无关。
 *
 * 开关 `useMock` 在 `./use-mock.js`(那儿小,能被首屏链安全引用);
 * 本文件请**只经 `await import('./mock')` 惰性引用**,别静态 import 进首屏链。
 */

export const DEMO_PORTRAIT = '/demo/demo-photo.svg'
// ---------------- 账号(演示模式) ----------------
/**
 * 演示模式下**不校验密码**——没有后端就没有 scrypt,也没有凭据表;
 * 这里刻意不存明文密码、不做"假登录校验",免得给人"前端也算了密码"的错觉。
 * 昵称只用来推一个稳定的假 userId(见下),好让衣橱数据在同一昵称下刷新不丢。
 */
export async function mockLoginUser({ nickname = '' } = {}) {
  await sleep(120)
  return { id: stableUserId(nickname), nickname, createdAt: new Date().toISOString() }
}

/** 昵称 → 稳定的假 userId:同一昵称每次得到同一个 id,衣橱才能对上同一份数据。 */
function stableUserId(nickname) {
  let h = 0
  for (const ch of nickname) h = (h * 31 + (ch.codePointAt(0) || 0)) >>> 0
  return `mock-user-${h.toString(16)}`
}

// ---------------- 衣橱(演示模式) ----------------
/**
 * 用 localStorage 存一份,复刻后端「落盘后重启还在」的行为——
 * 纯前端演示时刷新页面不该把用户刚录的化妆品弄丢。仅演示模式走这条路。
 */
const CABINET_KEY = 'beauty-app.mock-cabinet'

function readCabinet() {
  try {
    const raw = localStorage.getItem(CABINET_KEY)
    const table = raw ? JSON.parse(raw) : null
    return table && typeof table === 'object' ? table : {}
  } catch {
    return {} // 隐私模式 / 脏数据:退回空表,不让演示崩
  }
}

function writeCabinet(table) {
  try {
    localStorage.setItem(CABINET_KEY, JSON.stringify(table))
  } catch {
    /* 写不进去就算了,本次会话内仍可用 */
  }
}

function newItemId() {
  return globalThis.crypto?.randomUUID?.() || `mock-item-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

export async function mockListCosmetics({ userId }) {
  await sleep(140)
  const list = readCabinet()[userId] || []
  // 与后端一致:按建档时间升序
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
}

export async function mockAddCosmetic({ userId, name, attributes = [] }) {
  await sleep(160)
  const table = readCabinet()
  const item = {
    id: newItemId(),
    userId,
    name: String(name ?? '').trim(),
    attributes: attributes.map((a) => ({ label: String(a.label).trim(), value: String(a.value).trim() })),
    createdAt: new Date().toISOString()
  }
  table[userId] = [...(table[userId] || []), item]
  writeCabinet(table)
  return item
}

export async function mockUpdateCosmetic(id, { userId, name, attributes }) {
  await sleep(160)
  const table = readCabinet()
  const list = table[userId] || []
  const idx = list.findIndex((i) => i.id === id)
  if (idx < 0) throw new Error('找不到这条化妆品')
  const next = {
    ...list[idx],
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(attributes !== undefined
      ? { attributes: attributes.map((a) => ({ label: String(a.label).trim(), value: String(a.value).trim() })) }
      : {}),
    updatedAt: new Date().toISOString()
  }
  list[idx] = next
  table[userId] = list
  writeCabinet(table)
  return next
}

export async function mockRemoveCosmetic({ id, userId }) {
  await sleep(120)
  const table = readCabinet()
  table[userId] = (table[userId] || []).filter((i) => i.id !== id)
  writeCabinet(table)
}
