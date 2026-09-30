import api, { API_BASE } from './index'
import { SKIN_TONE_FROM_BACKEND } from './design'
import { featureLabel } from './kb/features'
import { skinToneById } from './kb/skintones'

/**
 * api/personas.js —— 人设库的数据层(2026-09-30 起在服务端,不再是 localStorage)。
 * ★ 照片也存服务端、**没有 TTL**;离开浏览器只有两条路:建档/换照片随 JSON,`/form` 出图时作 multipart `face`。
 * ★ 每个函数都要 `userId`:后端不签发 token,归属不匹配一律 404。
 * ★ 缩图理由从「localStorage 配额」换成「一次 JSON 请求体积」(服务端 1 MiB 字节 / 2 MiB dataURL);
 *   拿不到 canvas 时**原样返回原图**,那种会被 422 掉。★ **不加 mock 分支**(后端不起就打不通)。
 */

/** 「补充说明」那一格的字数上限(字)。★ 后端也有一份(`persona.validator.ts` 的 `MAX_NOTES`),改一处要改两处。 */
export const MAX_NOTES = 200

/** 人设照片送上去之前会缩到这个长边(px)。调大 = 更清晰但请求更大。 */
const PHOTO_MAX_EDGE = 640
/** 缩放后的 JPEG 质量。0.82 在「看得出是谁」和「够小」之间。 */
const PHOTO_QUALITY = 0.82

/** 旧版本地数据的两把键。**只用于删除**(2026-09-30 数据搬到服务端),不再读它们。 */
const LEGACY_PERSONA_KEY = 'tz:personas:'
const LEGACY_SEED_KEY = 'tz:personas:seedv:'

/**
 * 「关系」的**预置选项**:存英文 id,显示这三个中文词。
 * ★ 2026-09-30 起它**不再是白名单** —— 用户能自己填关系的原话(「同事」「继母」),
 *   这里只剩"页面上先摆哪几个 chip"。服务端那三个 id 由 `server/test/persona-vocabulary.test.ts` 对表钉住。
 */
export const RELATIONS = [
  { id: 'self', label: '本人' },
  { id: 'family', label: '家人' },
  { id: 'friend', label: '朋友' },
]

const RELATION_LABEL = Object.fromEntries(RELATIONS.map((r) => [r.id, r.label]))

/**
 * 人设卡要展示的派生字段与照片地址,统一在这里补。
 * ★ 派生字段(`relationName`/`skinToneName`/`skinToneHex`/`featureNames`)**由前端算** —— hex/中文档名只有前端 kb 有。
 * ★ `photoSource: 'stored'` 时**必须补 `API_BASE` 与 `?userId=`**:裸 `/personas/<id>/photo` 会被 Vite
 *   当前端路由吃掉,`<img>` 变破图且**不报错**。`'static'` 是 `public/` 下的种子图,原样用。
 * ★ `customTones` 传账号自建那几档(服务端 `skinTones`)。缺省 `[]` 只给写路径用:它们紧接着就重取列表。
 */
export function decoratePersona(p, userId, customTones = []) {
  const tone = skinToneById(p.skinTone) || customTones.find((t) => t.id === p.skinTone) || null
  const stored = p.photoSource === 'stored'
  return {
    ...p,
    photoUrl: stored
      ? `${API_BASE}${p.photoUrl}?userId=${encodeURIComponent(userId)}`
      : p.photoUrl || '',
    // ★ 认不出的关系显示**原话**:回落成 `'本人'` 会把「同事」显示成「本人」,还不报错。
    relationName: RELATION_LABEL[p.relation] || p.relation,
    skinToneName: tone ? tone.name : '未定档',
    skinToneHex: tone ? tone.hex : '',
    // ★ 同一个理由:认不出的特征显示**原话**(自己加的那条去掉分组前缀),不许静默丢掉。
    featureNames: (p.features || []).map(featureLabel),
  }
}

/* --------------------------- 照片缩放 --------------------------- */

/**
 * 把选的照片缩到长边 ≤640 的 JPEG dataURL。**本机处理。**
 * 拿不到 canvas 时**原样返回** —— 宁可被服务端挡回来,也不要静默换成空字符串。
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

/**
 * 某个账号的全部人设(已补展示字段)+ 它自建的那几档肤色。
 * `canAnalyzeFace` = **这个部署有没有读脸能力**,由服务端在列表里一起给。★ 别在前端再推一遍。
 * ★ `skinTones` **只有自建档**,预置那 8 档在前端 kb 里 —— 合起来看 `stores/personas.js` 的 `allSkinTones`。
 */
export async function getPersonas({ userId } = {}) {
  const res = await api.get('/personas', { params: { userId } })
  const skinTones = res.skinTones || []
  return {
    personas: (res.personas || []).map((p) => decoratePersona(p, userId, skinTones)),
    skinTones,
    canAnalyzeFace: Boolean(res.canAnalyzeFace),
  }
}

/* --------------------------- 自建肤色档 --------------------------- */

/**
 * 建一档自己的肤色(名字 + 颜色)。**整账号共用一份小库**,不跨账号。
 * ★ 上限由服务端把关(超了 409),这里不预判。
 */
export async function createSkinTone({ userId, name, hex } = {}) {
  return api.post('/personas/tones', { userId, name, hex })
}

/**
 * 删一档自建肤色。
 * ★ 本账号还有任何一份人设在用它 ⇒ 服务端 **409**,那句中文原样上屏 —— 别在这里先删了再报错。
 */
export async function removeSkinTone({ userId, id = '' } = {}) {
  await api.delete(`/personas/tones/${encodeURIComponent(id)}`, { params: { userId } })
  return { removed: true }
}

/* --------------------------- 写 --------------------------- */

/** 新建一份人设。`photo` 是可省的 dataURL(不传就是没有照片)。id 与 `createdAt` 都由**服务端**生成。 */
export async function createPersona({ userId, photo, ...fields } = {}) {
  const body = { userId, ...fields, ...(photo !== undefined ? { photo } : {}) }
  const created = await api.post('/personas', body)
  return decoratePersona(created, userId)
}

/**
 * 改一份人设;只改传来的字段。
 * ★ `photo` 三态各是一次不同请求:不传 = 不动;`''` = 删照片;dataURL = 换一张。调用方必须分清「没改」与「清空」。
 */
export async function updatePersona({ userId, id = '', ...patch } = {}) {
  const updated = await api.patch(`/personas/${encodeURIComponent(id)}`, { userId, ...patch })
  return decoratePersona(updated, userId)
}

/** 删一份人设。服务端连它的照片字节一起删。 */
export async function removePersona({ userId, id = '' } = {}) {
  await api.delete(`/personas/${encodeURIComponent(id)}`, { params: { userId } })
  return { removed: true }
}

/* --------------------------- 读脸 --------------------------- */

/**
 * 让服务端读一次脸,**给一个建议肤色档**。
 * ★★ **会花钱**(一次多模态调用):调用点只有问卷页那个按钮,**用户点了才发** —— 别在 `onMounted`/`watch` 里顺手调。
 * ★ `canAnalyzeFace` 为 false 时**一个建议都不显示、界面上不许出现「AI」**,**绝不**回落本地哈希。
 * ★ 回的档已从后端 id(`warm_beige`)翻成展示档(`yellow-2`);**翻不出来就回空**(不猜),页面显示「未定档」。
 * ★ 结果只有一格 `skinTone`:**没有特征、没有置信度**。
 */
export async function analyzePersonaFace({ userId, photo } = {}) {
  const res = await api.post('/personas/analyze', { userId, photo })
  const backendId = String(res?.skinTone || '')
  return { skinTone: SKIN_TONE_FROM_BACKEND[backendId] || '' }
}

/* --------------------------- 旧数据 --------------------------- */

/**
 * 删掉这台机器上那份旧的人设数据(**一次性收尾,不是迁移**)。
 * ★ 只能在**服务端列表成功之后**调(拉不到列表就动本机数据 = 在网络故障里抹掉用户唯一那份脸)。
 *   调用点在 `stores/personas.js` 的 `load()` 里,就在 await 之后。
 */
export function clearLocalPersonas(userId) {
  try {
    localStorage.removeItem(`${LEGACY_PERSONA_KEY}${userId}`)
    localStorage.removeItem(`${LEGACY_SEED_KEY}${userId}`)
  } catch {
    /* 隐私模式 / 存储不可用:本来就没有旧数据可删 */
  }
}
