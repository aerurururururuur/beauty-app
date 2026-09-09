/**
 * api/mock.js —— 演示模式的假后端。
 * 不联网即复刻真实 HTTP 契约(JobView),使前端可离线完整体验。
 * 判定/风格/调色与 server 的 mock 适配器同源:按 brief.occasion(或自由文字关键词)
 * 选场合,再按 brief.skinTone 调色板——呼应「按真实肤色、不默认浅肤色审美」。
 */

/** 演示模式开关:未配置或非 'false' 时走 mock。 */
export function useMock() {
  return import.meta.env.VITE_USE_MOCK !== 'false'
}

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

// ---------------- 场合判定(与 server mock-scene-analyzer 同源) ----------------
const KEYWORD_RULES = [
  { keywords: ['面试', '终面', '求职', '复试'], label: 'interview' },
  { keywords: ['上台', '演讲', '答辩', '路演', '主持', '汇报'], label: 'stage' },
  { keywords: ['约会', '相亲', '烛光'], label: 'date' },
  { keywords: ['见家长', '家长'], label: 'family' },
  { keywords: ['上班', '通勤', '日常', '开会', '客户'], label: 'daily' }
]

const OCC = {
  interview: { cn: '面试', style: '正式得体 · 哑光大地色', direction: '正式得体 · 哑光大地色,眉眼利落显精神', tags: ['正式', '哑光', '大地色', '利落'], base: { 唇: [188, 118, 122], 颊: [214, 150, 130], 眼影: [166, 128, 104] } },
  date: { cn: '约会', style: '温柔水光 · 粉调提气色', direction: '温柔提气色 · 粉调水光,亲和自然', tags: ['温柔', '粉调', '水光', '亲和'], base: { 唇: [214, 132, 138], 颊: [244, 178, 168], 眼影: [210, 156, 158] } },
  stage: { cn: '上台', style: '上台高显色 · 立体哑光', direction: '上台醒目 · 哑光高显色,轮廓立体、镜头友好', tags: ['舞台', '高显色', '哑光', '立体'], base: { 唇: [178, 66, 84], 颊: [226, 130, 108], 眼影: [122, 88, 120] } },
  family: { cn: '见家长', style: '温婉自然 · 豆沙提气色', direction: '温婉得体 · 自然提气色,亲切耐看', tags: ['温婉', '自然', '提气色', '耐看'], base: { 唇: [198, 128, 132], 颊: [228, 168, 150], 眼影: [186, 150, 142] } },
  daily: { cn: '日常', style: '自然伪素颜 · 通透百搭', direction: '日常百搭 · 通透自然伪素颜', tags: ['日常', '通透', '伪素颜', '自然'], base: { 唇: [212, 142, 144], 颊: [232, 176, 160], 眼影: [188, 170, 168] } }
}

/** 肤色档 → 色板校正(与 server mock-engine 一致):浅向白提亮、深向黑加深,medium 基准。 */
const TONE_MIX = { light: 0.22, light_medium: 0.1, medium: 0, tan: -0.08, deep: -0.16 }
const DEFAULT_TONE = 'medium'

function detectScene(brief) {
  const text = `${brief?.sceneText || ''}`.toLowerCase()
  if (brief?.occasion && OCC[brief.occasion]) {
    const o = OCC[brief.occasion]
    return { label: brief.occasion, direction: o.direction, tags: o.tags, confidence: 0.92, source: 'mock' }
  }
  const hit = KEYWORD_RULES.find((r) => r.keywords.some((k) => text.includes(k)))
  if (hit) {
    const o = OCC[hit.label]
    return { label: hit.label, direction: o.direction, tags: o.tags, confidence: 0.72, source: 'mock' }
  }
  const daily = OCC.daily
  return { label: 'daily', direction: daily.direction, tags: daily.tags, confidence: text ? 0.4 : 0.3, source: 'mock' }
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
  const o = OCC[label] || OCC.daily
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
  const isOccasion = !!brief?.occasion && !!OCC[brief.occasion]
  const cn = isOccasion ? OCC[brief.occasion].cn : brief?.sceneText ? '自定义需求' : (OCC[scene.label]?.cn || scene.label)
  const basisParts = []
  if (brief?.occasion) basisParts.push(`场合:${OCC[brief.occasion].cn}`)
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

  const scene = detectScene(rec.brief)
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
