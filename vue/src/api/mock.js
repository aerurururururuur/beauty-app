/**
 * api/mock.js —— 演示模式的假后端。
 * 不联网即复刻真实 HTTP 契约(JobView / UserView / CosmeticItemView),使前端可离线完整体验。
 * 判定与 server 的 mock 适配器**同源**:场合判定直调 `@scene-rules` 里那个纯函数
 * (就是 `MockSceneAnalyzer` 调的同一个人),不再在本文件抄一份关键词表。
 * 风格文案 + 色板仍按 brief.skinTone 调——呼应「按真实肤色、不默认浅肤色审美」。
 *
 * 开关 `useMock` 在 `./use-mock.js`(那儿小,能被首屏链安全引用);
 * 本文件请**只经 `await import('./mock')` 惰性引用**,别静态 import 进首屏链。
 */

import { SCENE_RULES, describeScene } from '@scene-rules'

export const DEMO_PORTRAIT = '/demo/demo-photo.svg'
/** 刷新结果页时的回放示例任务简报。 */
const DEMO_BRIEF = {
  occasion: 'interview',
  sceneText: '正式终面 · 干练得体',
  skinType: 'combination',
  skinTone: 'medium',
  dress: '西装 · 藏青',
  weather: { condition: '晴', temperatureC: 24, humidityPct: 45, uvIndex: 3 }
}

// ---------------- 场合判定:直接调后端的单一源,不再自己抄一份 ----------------
// `describeScene` 就是 `MockSceneAnalyzer` 调的那个纯函数(经 vite alias `@scene-rules`
// 直读 server/src/modules/shared/domain/scene-rules.ts)。此前这里抄了一整套
// 关键词表 + 方向 + 标签,改后端忘了改前端时,浏览器 mock 模式会**静默**给出另一个答案。
// 现在两侧逐字一致,包括自由文字的修饰词叠加。

/** 场合英文 label → 中文名。单一源同上;认不出就原样回显,不编一个中文名。 */
function occCn(label) {
  return SCENE_RULES[label]?.cn || label
}

/** 肤色档 → 色板校正(与 server mock-engine 一致):浅向白提亮、深向黑加深,medium 基准。 */
const TONE_MIX = { light: 0.22, light_medium: 0.1, medium: 0, tan: -0.08, deep: -0.16 }
const DEFAULT_TONE = 'medium'

/**
 * 场合 → 基准风格文案 + 基准色板(与 server mock-engine 的 STYLES 同源)。
 *
 * ⚠️ **这份仍是拷贝,是知情的**:色板属于**上妆引擎的实现细节**,不是场合语义,
 * 所以没有并进 `@scene-rules`(那会让 shared 里躺一份「将来换真引擎就没人用」的死数据)。
 * 正确的清理时机是接真实引擎时——由 MockEngine 导出快照,而不是在这里再抄一遍。
 * 已记进 roadmap §4 待办。
 */
const ENGINE_SPECS = {
  interview: { style: '正式得体 · 哑光大地色', base: { 唇: [188, 118, 122], 颊: [214, 150, 130], 眼影: [166, 128, 104] } },
  date: { style: '温柔水光 · 粉调提气色', base: { 唇: [214, 132, 138], 颊: [244, 178, 168], 眼影: [210, 156, 158] } },
  stage: { style: '上台高显色 · 立体哑光', base: { 唇: [178, 66, 84], 颊: [226, 130, 108], 眼影: [122, 88, 120] } },
  family: { style: '温婉自然 · 豆沙提气色', base: { 唇: [198, 128, 132], 颊: [228, 168, 150], 眼影: [186, 150, 142] } },
  daily: { style: '自然伪素颜 · 通透百搭', base: { 唇: [212, 142, 144], 颊: [232, 176, 160], 眼影: [188, 170, 168] } }
}

// ---------------- 风格 / 色板 / 叠加区(与 server mock-engine 同源) ----------------
const ZONE_LAYOUT = [
  { role: '唇', anchor: { x: 0.5, y: 0.47 }, size: { w: 0.26, h: 0.13 }, opacity: 0.8, blur: 12 },
  { role: '颊', anchor: { x: 0.66, y: 0.6 }, size: { w: 0.17, h: 0.1 }, opacity: 0.28, blur: 22 },
  { role: '颊', anchor: { x: 0.34, y: 0.6 }, size: { w: 0.17, h: 0.1 }, opacity: 0.28, blur: 22 },
  { role: '眼影', anchor: { x: 0.42, y: 0.38 }, size: { w: 0.16, h: 0.05 }, opacity: 0.18, blur: 8 },
  { role: '眼影', anchor: { x: 0.58, y: 0.38 }, size: { w: 0.16, h: 0.05 }, opacity: 0.18, blur: 8 }
]

function mixWith(c, towardWhite) {
  const target = towardWhite >= 0 ? 255 : 0
  const f = Math.abs(towardWhite)
  return [c[0], c[1], c[2]].map((v) => Math.round(v + (target - v) * f))
}

/** 选场合基准风格并按肤色档校正色板。 */
function specFor(label, tone) {
  const o = ENGINE_SPECS[label] || ENGINE_SPECS.daily
  const mix = TONE_MIX[tone] ?? TONE_MIX[DEFAULT_TONE]
  const base = o.base
  const palette = {
    唇: mixWith(base['唇'], mix),
    颊: mixWith(base['颊'], mix),
    眼影: mixWith(base['眼影'], mix)
  }
  return { style: o.style, palette }
}

function buildLook(label, tone) {
  const { style, palette } = specFor(label, tone)
  const zones = ZONE_LAYOUT.map((z) => ({ ...z, rgb: palette[z.role] }))
  return {
    engine: 'mock',
    style,
    skinTone: tone,
    palette: [
      { role: '唇', rgb: palette['唇'] },
      { role: '颊', rgb: palette['颊'] },
      { role: '眼影', rgb: palette['眼影'] }
    ],
    zones,
    note: '骨架演示:产物为本人照片原图,妆容按 look.zones 由前端 CSS 叠加预览;真实像素渲染在 roadmap W2 替换。'
  }
}

// ---------------- 参考素材(自绘示意,授权诚实;红线:不抓网络图) ----------------
const REFS = {
  interview: ['正式面试妆 · 哑光大地色(参考)', '低饱和豆沙唇妆(参考)', '眉目利落的通勤妆示范(参考)'],
  date: ['约会温柔粉调妆(参考)', '水光感腮红晕染(参考)', '暖调玫瑰唇妆示范(参考)'],
  stage: ['上台演讲 · 哑光高显色底妆(参考)', '立体眉眼轮廓示范(参考)', '镜头友好唇色示范(参考)'],
  family: ['见家长 · 温婉得体妆(参考)', '自然提气色腮红(参考)', '豆沙调温柔唇妆示范(参考)'],
  daily: ['日常通勤百搭淡妆(参考)', '自然伪素颜底妆示范(参考)', '通勤豆沙唇妆(参考)']
}

function buildReferences(label) {
  const list = REFS[label] || REFS.daily
  return list.map((title, i) => ({
    id: `ref-${label}-${i + 1}`,
    title,
    license: '自绘演示素材 · 正式稿替换为可授权来源并回填授权信息',
    sourceUrl: ''
  }))
}

// ---------------- 结果文案(与 server narration 主题一致) ----------------
const TYPE_STRATEGY = {
  dry: '偏干肌先滋润打底,选滋润服帖粉质',
  oily: '偏油肌优先控油持妆,雾面质感并做好定妆',
  combination: '混合肌重点 T 区控油 + 两颊保湿',
  sensitive: '敏感肌精简步骤、选温和配方',
  neutral: '中性肌质地随喜好,通透妆感即可'
}

function buildResultText(scene, look, brief) {
  const isOccasion = !!brief?.occasion && !!SCENE_RULES[brief.occasion]
  const cn = isOccasion ? occCn(brief.occasion) : brief?.sceneText ? '自定义需求' : occCn(scene.label)
  const basisParts = []
  if (brief?.occasion) basisParts.push(`场合:${occCn(brief.occasion)}`)
  if (brief?.sceneText?.trim()) basisParts.push(`需求:${brief.sceneText.trim()}`)
  const basis = basisParts.join(' / ') || cn

  const analysis = `识别为「${basis}」→ 妆容方向:${scene.direction}${
    scene.tags.length ? `(${scene.tags.join(' / ')})` : ''
  }。`

  const explainParts = [`为「${cn}」场合选配「${look.style}」妆容。`]
  if (brief?.skinTone) explainParts.push(`按你的肤色档选色板——不为「显白」牺牲素颜真实度。`)
  if (brief?.skinType) explainParts.push(`${brief.skinType === 'combination' ? '混合' : TYPE_STRATEGY[brief.skinType]}肤质适配:${TYPE_STRATEGY[brief.skinType]}。`)
  if (brief?.dress?.trim()) explainParts.push(`穿搭主色「${brief.dress.trim()}」与妆容呼应,整体利落不抢镜。`)
  explainParts.push(`由 mock 引擎生成,前端按 look.zones 以 CSS 叠加预览。`)
  const explain = explainParts.join('')

  const tips = []
  tips.push(brief?.skinType ? `${TYPE_STRATEGY[brief.skinType]},现场更耐看` : '底妆薄透为主,重要场合前在自然光下检查一次妆面')
  tips.push(brief?.dress?.trim() ? `穿搭主色为「${brief.dress.trim()}」,唇颊选同类色相最得体` : '这套妆容走低饱和同类色,与多数正式穿搭都能搭')
  const w = brief?.weather
  if (w) {
    const bits = []
    if (w.uvIndex >= 3) bits.push('紫外线偏强,记得防晒打底')
    if ((w.humidityPct ?? 50) >= 60) bits.push('湿度偏高,定妆别省')
    if (w.temperatureC >= 28) bits.push('高温易脱妆,选持妆型妆效更稳')
    tips.push(bits.length ? bits.join(';') : `按当日天气(${w.condition || '温和'})调整持妆策略即可`)
  } else {
    tips.push('出门前对照当日天气定妆')
  }

  return { analysis, explain, tips }
}

// ---------------- 假任务流水线(异步推进,轮询可见) ----------------
const DONE_AT = 2600 // ms
const STEP_AT = [
  { at: 0, status: 'queued', step: 'queued', progress: 0 },
  { at: 500, status: 'running', step: 'scene_understand', progress: 20 },
  { at: 1200, status: 'running', step: 'reference_gather', progress: 40 },
  { at: 2100, status: 'running', step: 'makeup_generate', progress: 70 },
  { at: DONE_AT, status: 'done', step: 'store_result', progress: 100 }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const jobs = new Map()
let seq = 0

function ensure(id) {
  if (!jobs.has(id)) {
    // 页面刷新后的未知任务:回放一个已完成的示例任务,便于直连结果页
    jobs.set(id, { id, startedAt: Date.now() - DONE_AT - 50, brief: { ...DEMO_BRIEF } })
  }
  return jobs.get(id)
}

/** 建任务:立刻返回 {id,status:'queued',progress:0,step:'queued'}(形状同 POST /jobs)。 */
export async function mockCreateJob({ sceneFiles = [], brief = {} } = {}) {
  const id = `mock-${++seq}`
  const recBrief = { ...brief }
  if (!recBrief.weather) recBrief.weather = { ...DEMO_BRIEF.weather }
  jobs.set(id, { id, startedAt: Date.now(), brief: recBrief, sceneName: sceneFiles[0]?.name || null })
  await sleep(80)
  return { id, status: 'queued', progress: 0, step: 'queued' }
}

/** 轮询任务:返回与 GET /jobs/:id 同形状的 JobView。 */
export async function mockGetJob(id) {
  await sleep(160)
  const rec = ensure(id)
  const elapsed = Date.now() - rec.startedAt
  const idx = STEP_AT.findIndex((s, i) => {
    const next = STEP_AT[i + 1]
    return elapsed >= s.at && (!next || elapsed < next.at)
  })
  const cur = STEP_AT[Math.max(0, idx)]

  const view = {
    id: rec.id,
    status: cur.status,
    progress: cur.progress,
    step: cur.step,
    error: null,
    inputs: {
      faceName: rec.faceName || '本人照片',
      sceneNames: rec.sceneName ? [rec.sceneName] : [],
      brief: rec.brief
    }
  }

  // 与后端 MockSceneAnalyzer 调的是同一个纯函数(单一源 @scene-rules)。
  const scene = describeScene(rec.brief)
  if (elapsed >= STEP_AT[1].at) view.scene = scene
  if (elapsed >= STEP_AT[2].at) view.references = buildReferences(scene.label)
  if (elapsed >= STEP_AT[3].at) {
    const tone = rec.brief?.skinTone || DEFAULT_TONE
    const look = buildLook(scene.label, tone)
    view.result = {
      engine: 'mock',
      resultUrl: null, // mock:结果图即本人照片,前端用 look 做 CSS 叠加
      scene,
      look,
      references: view.references,
      ...buildResultText(scene, look, rec.brief)
    }
  }
  return view
}

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
