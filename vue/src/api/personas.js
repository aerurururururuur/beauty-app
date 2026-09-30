import { FEATURE_LIBRARY, featureById } from './kb/features'
import { SKIN_TONES, skinToneById } from './kb/skintones'

/**
 * api/personas.js —— 人设库(形象库)的数据层。
 *
 * ★★ **后端没有这些人设端点**,`VITE_USE_MOCK` 对它无效。数据落在**本机浏览器**,
 *    换台机器就看不到——页面文案必须如实这么说,不许讲成「已同步到你的账号」。
 *
 *    一个「人设」= 一张照片 + 一份面诊档案(肤色档 + 面部特征 + 关系)。
 *
 * ── 为什么每个函数都要 userId(改签名前读这段) ────────────────────────────
 *
 * 存储键是 `tz:personas:<userId>`,**按账号分开**。这不是洁癖:
 * 人设里存的是**脸的正面照**,如果所有账号共用一把键,那么在共用的电脑上
 * 「A 退出、B 登录」之后,B 打开人设库看到的是 **A 的脸**。
 * 名字一样难查,而后果是不可逆的泄漏——所以宁可每个调用点多传一个参数。
 *
 * ── 照片存哪、存多大 ──────────────────────────────────────────────────
 *
 * 照片以 dataURL 存进 localStorage,和档案在同一个键下。这是产品要求(脸模要能复用),
 * 但**原图直存一定会出事**:手机照片转 base64 常有 3–6 MB,而 localStorage 的配额
 * 通常只有 5 MB——第一张照片就可能 `QuotaExceededError`。
 * 更糟的是它**不抛到界面上**:`setItem` 抛出、调用方没接,建档"成功"、刷新后人没了,
 * 正是本仓最怕的「假开关」。所以三道防线,一道都不能省:
 *   1. `shrinkPhoto()` —— 存之前先缩到长边 ≤640 的 JPEG(q0.82),典型 40–90 KB;
 *   2. `writePersonas()` **不吞异常** —— 存不下就抛,由 store 变成一句人话给用户看;
 *   3. 种子人设的照片是 `public/` 下的静态 SVG,不占 dataURL 那份配额。
 *
 * ⚠️ 与旧版前端的一条已知差异:旧版红线是「本人照片即用即删、一律不落盘」。
 *    人设库这条**故意不同**——它的功能就是「把一张脸存下来反复用」。
 *    代价是**这张脸留在本机浏览器里**,所以:照片不经任何网络、不上传,
 *    且存储按账号隔离(见上)。
 */

const PERSONA_KEY_PREFIX = 'tz:personas:'
const SEED_KEY_PREFIX = 'tz:personas:seedv:'
/** 种子版本:每次新增示例人设时 +1,读取时会把缺失的种子补齐,老用户也能看到新人设。 */
const PERSONA_SEED_VERSION = 3

/** 人设照片存进 localStorage 前会缩到这个长边(px)。调大 = 更清晰但更快撞配额。 */
const PHOTO_MAX_EDGE = 640
/** 缩放后的 JPEG 质量。0.82 在「看得出是谁」和「够小」之间。 */
const PHOTO_QUALITY = 0.82

/**
 * 种子人设:首次使用时给几份示例,免得空库无从下手。
 * ★ 照片走 `public/assets/img/` 下的静态 SVG(绝对路径),**不是** dataURL——
 *   静态资源不进 localStorage 配额,种子再多也吃不掉配额。
 */
const SEED_PERSONAS = [
  {
    id: 'ps-self',
    name: '我的形象',
    relation: 'self',
    photoUrl: '',
    skinTone: 'yellow-1',
    features: ['eye-single', 'face-round', 'skin-combo'],
    createdAt: '2026-09-20T10:00:00.000Z',
  },
  {
    id: 'ps-mom',
    name: '妈妈',
    relation: 'family',
    photoUrl: '',
    skinTone: 'yellow-2',
    features: ['eye-drop', 'lip-lines', 'skin-dry'],
    createdAt: '2026-09-22T10:00:00.000Z',
  },
  {
    id: 'ps-friend',
    name: '闺蜜的形象',
    relation: 'friend',
    photoUrl: '',
    skinTone: 'cool-fair',
    features: ['eye-up', 'face-oval'],
    createdAt: '2026-09-25T10:00:00.000Z',
  },
  {
    id: 'ps-colleague',
    name: '同事小敏',
    relation: 'friend',
    photoUrl: '/assets/img/ph-colleague.svg',
    skinTone: 'pink-fair',
    features: ['eye-deep', 'face-oval', 'skin-dry'],
    createdAt: '2026-09-26T10:00:00.000Z',
  },
  {
    id: 'ps-sister',
    name: '姐姐',
    relation: 'family',
    photoUrl: '/assets/img/ph-sister.svg',
    skinTone: 'olive',
    features: ['eye-up', 'face-long', 'skin-combo'],
    createdAt: '2026-09-27T10:00:00.000Z',
  },
]

/* --------------------------- 存储 --------------------------- */

/** localStorage 不可用(隐私模式)时退回内存:本次会话内仍可用,只是刷新后不保留。 */
const memStore = {}
const storage =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: (k) => (k in memStore ? memStore[k] : null),
        setItem: (k, v) => {
          memStore[k] = String(v)
        },
        removeItem: (k) => {
          delete memStore[k]
        },
      }

const personaKey = (userId) => `${PERSONA_KEY_PREFIX}${userId}`
const seedKey = (userId) => `${SEED_KEY_PREFIX}${userId}`

/** 把种子里已存列表还没有的 id 补进去;已有的不动、用户自建的也不动。 */
function migrateSeeds(stored) {
  const have = new Set(stored.map((p) => p.id))
  const missing = SEED_PERSONAS.filter((p) => !have.has(p.id))
  return missing.length ? [...stored, ...missing] : stored
}

function readPersonas(userId) {
  try {
    const raw = storage.getItem(personaKey(userId))
    if (raw) {
      const list = JSON.parse(raw)
      if (String(storage.getItem(seedKey(userId))) !== String(PERSONA_SEED_VERSION)) {
        const next = migrateSeeds(list)
        storage.setItem(personaKey(userId), JSON.stringify(next))
        storage.setItem(seedKey(userId), String(PERSONA_SEED_VERSION))
        return next
      }
      return list
    }
  } catch {
    /* 数据损坏时回落种子 */
  }
  storage.setItem(personaKey(userId), JSON.stringify(SEED_PERSONAS))
  storage.setItem(seedKey(userId), String(PERSONA_SEED_VERSION))
  return [...SEED_PERSONAS]
}

/**
 * ★ 这里**故意不 catch**。存不下(配额满 / 隐私模式)必须让调用方知道,
 *   否则建档看起来成功了、刷新后人没了——正是本仓最怕的假开关。
 *   由 store 把这里抛出的错变成一句人话给用户看。
 */
function writePersonas(userId, list) {
  storage.setItem(personaKey(userId), JSON.stringify(list))
}

/**
 * 「关系」这组枚举的**唯一真源**:存的是英文 id,显示的是这三个中文词。
 *
 * ★ 三个用途都从这里取,谁也别再抄一份:
 *   1. 页面上的关系选项(问卷建档页与详情改档页用的是同一组按钮);
 *   2. `decoratePersona` 补出来的 `relationName`;
 *   3. `createPersona` / `updatePersona` 校验传进来的 id 合不合法。
 *   三份各抄一半的后果是**静默漂移**——改了一处,另一处照旧显示旧词,而且不报错。
 */
export const RELATIONS = [
  { id: 'self', label: '本人' },
  { id: 'family', label: '家人' },
  { id: 'friend', label: '朋友' },
]

const RELATION_LABEL = Object.fromEntries(RELATIONS.map((r) => [r.id, r.label]))
/** 合法 id 的清单,给下面两个校验用。 */
const RELATION_IDS = RELATIONS.map((r) => r.id)

/** 人设卡要展示的派生字段(关系名 / 肤色档名 / 特征名列表),统一在这里补,页面不再各算一次。 */
function decoratePersona(p) {
  const tone = skinToneById(p.skinTone)
  return {
    ...p,
    relationName: RELATION_LABEL[p.relation] || '本人',
    skinToneName: tone ? tone.name : '未定档',
    skinToneHex: tone ? tone.hex : '',
    featureNames: (p.features || []).map(featureById).filter(Boolean).map((f) => f.name),
  }
}

/* --------------------------- 照片缩放 --------------------------- */

/**
 * 把用户选的照片缩到长边 ≤640 的 JPEG dataURL,再交给 localStorage。**本机处理,不上传。**
 *
 * 拿不到 canvas(老浏览器 / 非图片)时**原样返回**——宁可存大一点,
 * 也不要因为缩放失败就悄悄把人设照片换成空字符串(那会是一条静默的错)。
 */
export async function shrinkPhoto(file) {
  const dataUrl = await readAsDataUrl(file)
  if (typeof document === 'undefined') return dataUrl
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height))
    if (scale >= 1) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
  } catch {
    return dataUrl
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('这张照片读不出来，换一张试试'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

/* --------------------------- 读 --------------------------- */

/** 某个账号的全部人设(已补肤色名 / 特征名)。 */
export function getPersonas({ userId } = {}) {
  return readPersonas(userId).map(decoratePersona)
}

/** 单份人设;找不到返回 null(调用方负责回人设库,别在页面上留空壳)。 */
export function getPersona({ userId, id = '' } = {}) {
  const p = readPersonas(userId).find((x) => x.id === id) || null
  return p ? decoratePersona(p) : null
}

/* --------------------------- 写 --------------------------- */

/**
 * 新建一份人设。
 * ★ 未知肤色档回落**空**(不是「随便挑一档」)、未知特征**直接丢**——
 *   不能因为用户传了个没收录的 id 就给他安一个他没选的肤色。
 */
export function createPersona({ userId, ...payload } = {}) {
  const persona = {
    id: `ps-${Date.now().toString(36)}`,
    name: String(payload.name || '').trim() || '未命名人设',
    relation: RELATION_IDS.includes(payload.relation) ? payload.relation : 'self',
    photoUrl: payload.photoUrl || '',
    skinTone: skinToneById(payload.skinTone) ? payload.skinTone : '',
    features: (payload.features || []).filter((fid) => featureById(fid)),
    createdAt: new Date().toISOString(),
  }
  const list = readPersonas(userId)
  list.unshift(persona)
  writePersonas(userId, list)
  return decoratePersona(persona)
}

/** 改一份人设;只改传来的字段。找不到返回 null。 */
export function updatePersona({ userId, id = '', ...patch } = {}) {
  const list = readPersonas(userId)
  const idx = list.findIndex((x) => x.id === id)
  if (idx < 0) return null
  const next = { ...list[idx] }
  if ('name' in patch) next.name = String(patch.name || '').trim() || next.name
  if ('relation' in patch && RELATION_IDS.includes(patch.relation)) next.relation = patch.relation
  if ('photoUrl' in patch) next.photoUrl = patch.photoUrl || ''
  if ('skinTone' in patch) next.skinTone = skinToneById(patch.skinTone) ? patch.skinTone : next.skinTone
  if ('features' in patch) next.features = (patch.features || []).filter((fid) => featureById(fid))
  list[idx] = next
  writePersonas(userId, list)
  return decoratePersona(next)
}

/** 删一份人设。 */
export function removePersona({ userId, id = '' } = {}) {
  writePersonas(
    userId,
    readPersonas(userId).filter((x) => x.id !== id)
  )
  return { removed: true }
}

/* --------------------------- 面诊建议 --------------------------- */

/**
 * 根据照片给一组**建议**肤色档与特征标签,供问卷页预填。
 *
 * ★ 它叫「建议」不叫「判定」,因为照片有色差——问卷页必须允许用户改,
 *   界面文案也要说清这一点,不能把这里的结果当成定论。
 *
 * 实现按 dataURL 哈希取一组**稳定的**结果:同一张照片每次给同一份建议
 * (这是「看起来分析过」与「每次刷新都变脸」的分界线)。
 * 接真后端时换成 POST 一张图即可,调用方不用改。
 */
export function analyzePortrait({ image = '' } = {}) {
  let hash = 0
  const s = String(image)
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  const tonePool = SKIN_TONES.map((t) => t.id)
  const featPool = FEATURE_LIBRARY.map((f) => f.id)
  return {
    skinTone: tonePool[hash % tonePool.length],
    features: [featPool[hash % featPool.length], featPool[(hash >> 4) % featPool.length]].filter(
      (v, i, arr) => arr.indexOf(v) === i
    ),
    confidence: 0.82,
  }
}
