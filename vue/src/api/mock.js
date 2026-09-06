/**
 * api/mock.js —— 演示模式的假后端。
 * 不联网即复刻真实 HTTP 契约（JobView），使前端可离线完整体验。
 * 视觉与后端 mock 引擎保持一致：场景规则 / 风格色板 / 叠加区几何照搬 server 的 mock 实现。
 */

/** 演示模式开关：未配置或非 'false' 时走 mock。 */
export function useMock() {
  return import.meta.env.VITE_USE_MOCK !== 'false'
}

export const DEMO_PORTRAIT = '/demo/demo-photo.svg'
export const DEMO_SCENERY = '/demo/scenery.svg'
export const DEMO_SCENE_TEXT = '雪景 冷调 清透 薄雾'

// ---------------- 场景识别（与 server mock-scene-analyzer 同源） ----------------
const RULES = [
  { keywords: ['雪', '冰川', '极光', 'snow'], label: 'snow', direction: '清透冷调 · 雾面服帖', tags: ['冷调', '清透', '雾面', '低饱和'] },
  { keywords: ['海', '沙滩', '海岛', '泳', 'beach'], label: 'beach', direction: '元气橘粉 · 水光清透', tags: ['暖调', '水光', '元气', '橘粉'] },
  { keywords: ['红叶', '枫', '秋', '银杏', 'red'], label: 'red-leaf', direction: '枫叶暖调 · 提升气色', tags: ['暖调', '枫叶红', '显气色'] },
  { keywords: ['城市', '都市', '夜景', '霓虹', '街头', 'city'], label: 'city', direction: '冷调都市 · 眉眼利落', tags: ['冷调', '轻烟熏', '哑光'] },
  { keywords: ['沙漠', '戈壁', '沙丘', 'desert'], label: 'desert', direction: '大地暖棕 · 哑光修容', tags: ['暖调', '大地色', '哑光'] },
  { keywords: ['山', '森林', '草原', '湖', '瀑布', 'mountain'], label: 'mountain', direction: '裸感自然 · 轻雾透光', tags: ['自然', '裸感', '透光'] }
]

const UNKNOWN = { label: 'unknown', direction: '自然日常 · 百搭', tags: ['日常', '自然'], confidence: 0.3, source: 'mock' }

export const SCENE_CN = {
  snow: '雪景',
  beach: '海边',
  'red-leaf': '红叶之秋',
  city: '都市夜景',
  desert: '沙漠',
  mountain: '山野',
  unknown: '未识别场景'
}

function detectScene(sceneText, sceneName) {
  const text = `${sceneText || ''} ${sceneName || ''}`.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      return {
        label: rule.label,
        direction: rule.direction,
        tags: rule.tags,
        confidence: sceneText ? 0.72 : 0.5,
        source: 'mock'
      }
    }
  }
  return { ...UNKNOWN, source: 'mock' }
}

// ---------------- 风格 / 色板 / 叠加区（与 server mock-engine 同源） ----------------
const ZONE_LAYOUT = [
  { role: '唇', anchor: { x: 0.5, y: 0.47 }, size: { w: 0.26, h: 0.13 }, opacity: 0.8, blur: 12 },
  { role: '颊', anchor: { x: 0.66, y: 0.6 }, size: { w: 0.17, h: 0.1 }, opacity: 0.28, blur: 22 },
  { role: '颊', anchor: { x: 0.34, y: 0.6 }, size: { w: 0.17, h: 0.1 }, opacity: 0.28, blur: 22 },
  { role: '眼影', anchor: { x: 0.42, y: 0.38 }, size: { w: 0.16, h: 0.05 }, opacity: 0.18, blur: 8 },
  { role: '眼影', anchor: { x: 0.58, y: 0.38 }, size: { w: 0.16, h: 0.05 }, opacity: 0.18, blur: 8 }
]

const PALETTES = {
  snow: { 唇: [230, 178, 186], 颊: [246, 198, 190], 眼影: [198, 190, 214] },
  beach: { 唇: [236, 132, 108], 颊: [248, 160, 128], 眼影: [224, 168, 116] },
  'red-leaf': { 唇: [196, 74, 62], 颊: [212, 120, 98], 眼影: [190, 118, 78] },
  city: { 唇: [172, 72, 96], 颊: [198, 122, 122], 眼影: [94, 92, 116] },
  desert: { 唇: [168, 96, 62], 颊: [202, 142, 100], 眼影: [152, 112, 82] },
  mountain: { 唇: [210, 140, 140], 颊: [222, 170, 160], 眼影: [162, 152, 152] },
  unknown: { 唇: [204, 120, 130], 颊: [226, 170, 160], 眼影: [182, 162, 162] }
}

const STYLE_NAME = {
  snow: '清透冷调 · 柔雾玫瑰',
  beach: '元气橘粉 · 水光感',
  'red-leaf': '枫叶暖调 · 显气色',
  city: '冷调都市 · 轻烟熏',
  desert: '大地暖棕 · 哑光修容',
  mountain: '裸感自然 · 透光',
  unknown: '自然日常 · 百搭'
}

const REFS = {
  snow: ['雪景清透妆 · 冷调底妆', '冷感粉调腮红晕染', '水润透亮唇妆示例'],
  beach: ['海边元气橘粉妆', '水光感高光点缀', '夏日清透腮红示例'],
  'red-leaf': ['秋日枫叶眼妆', '复古红棕唇色', '暖调腮红修容示例'],
  city: ['都市轻烟熏眼妆', '冷调裸色唇妆', '夜景灯光下哑光底妆示例'],
  desert: ['沙漠大地色眼影', '暖棕修容与晒伤腮红', '哑光蜜桃唇妆示例'],
  mountain: ['山野裸感伪素颜妆', '透光高光与清透底妆', '豆沙色日常唇妆示例'],
  unknown: ['百搭日常淡妆', '自然提气色腮红', '通勤豆沙唇妆示例']
}
const REF_FALLBACK = REFS.unknown

function buildLook(label) {
  const l = PALETTES[label] ? label : 'unknown'
  const palette = PALETTES[l]
  const zones = ZONE_LAYOUT.map((z) => ({ ...z, rgb: palette[z.role] }))
  return {
    engine: 'mock',
    style: STYLE_NAME[l],
    palette: [
      { role: '唇', rgb: palette['唇'] },
      { role: '颊', rgb: palette['颊'] },
      { role: '眼影', rgb: palette['眼影'] }
    ],
    zones,
    note: '骨架演示：产物为本人照片原图，妆容由前端按 look.preview 以 CSS 叠加预览。'
  }
}

function buildReferences(label) {
  const list = REFS[label] || REF_FALLBACK
  return list.map((title, i) => ({
    id: `ref-${label}-${i + 1}`,
    title,
    license: '骨架示例条目 · 接入真实来源后须标注授权条款',
    sourceUrl: `https://example.com/makeup-reference/${label}/${i + 1}`
  }))
}

function buildResultText(scene, look) {
  const cn = SCENE_CN[scene.label] || '该场景'
  const analysis = `识别到「${cn}」，方向为${scene.direction}`
  const explain =
    `据「${cn}」的氛围，选配「${look.style}」妆容。` +
    `将 ${look.palette.map((p) => p.role).join('、')} 等色以低饱和、柔雾的方式叠于对应五官区域，清透不突兀，整体贴合场景气质。`
  const tips = [
    '妆容风格：' + look.style,
    '主判定：' + scene.direction,
    '骨架演示：接真实引擎后，本页将展示把妆容直接渲染到照片上的成品图'
  ]
  return { analysis, explain, tips }
}

// ---------------- 假任务流水线（异步推进，轮询可见） ----------------
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
    // 页面刷新后的未知任务：回放一个已完成的示例任务，便于直连结果页
    jobs.set(id, { id, startedAt: Date.now() - DONE_AT - 50, sceneText: DEMO_SCENE_TEXT, sceneName: DEMO_SCENERY })
  }
  return jobs.get(id)
}

/** 建任务：立刻返回 {id,status:'queued',progress:0,step:'queued'}（形状同 POST /jobs）。 */
export async function mockCreateJob({ sceneFiles = [], sceneText = '' } = {}) {
  const id = `mock-${++seq}`
  const sceneName = sceneFiles[0]?.name || DEMO_SCENERY
  const text = (sceneText || DEMO_SCENE_TEXT).trim()
  jobs.set(id, { id, startedAt: Date.now(), sceneText: text, sceneName })
  await sleep(80)
  return { id, status: 'queued', progress: 0, step: 'queued' }
}

/** 轮询任务：返回与 GET /jobs/:id 同形状的 JobView。 */
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
      sceneText: rec.sceneText
    }
  }

  const scene = detectScene(rec.sceneText, rec.sceneName)
  if (elapsed >= STEP_AT[1].at) view.scene = scene
  if (elapsed >= STEP_AT[2].at) view.references = buildReferences(scene.label)
  if (elapsed >= STEP_AT[3].at) {
    const look = buildLook(scene.label)
    view.result = {
      engine: 'mock',
      resultUrl: null, // mock：结果图即本人照片，前端用 look 做 CSS 叠加
      scene,
      look,
      references: view.references,
      ...buildResultText(scene, look)
    }
  }
  return view
}
