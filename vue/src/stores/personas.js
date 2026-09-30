import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getFeatureTags, getSkinTones } from '@/api/design'

/**
 * 人设库(形象库)store。★ 数据在服务端(2026-09-30 起,此前是 localStorage)。
 * ★ 每个动作都要带 `userId`(由页面从 user store 传进来);旧的本机数据由 `load()` 在列表成功之后删掉。
 * ★ 建档草稿走 `draft`:内存一份给页面用,sessionStorage 一份防刷新——**只在本次会话内存活**,
 *   建档成功或中途退出就清掉。照片最终落到服务端那一步在 `create()` 里。
 */

/** 草稿键。与源站同名,便于对照;不带 userId——它是「正在建的那一份」,还没归属。 */
const DRAFT_KEY = 'tz:persona-draft'

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * ★★ `@/api/personas` **必须惰性引入**:它是 axios 模块,而本 store 在首屏链上
 *   (`stores/user.js` 静态引它),静态引 = 把 axios 拽进首屏包(§6.3)。
 */
function personasApi() {
  return import('@/api/personas')
}

export const usePersonasStore = defineStore('personas', () => {
  const userId = ref('')
  const list = ref([])
  const busy = ref(false)
  /**
   * 这个部署有没有读脸能力。★ **由服务端在列表里一起给**,前端不自己推。
   * 为 `false` 时(缺省配置)界面上**一个「AI」字都不该出现**,也不摆读脸按钮。
   */
  const canAnalyzeFace = ref(false)
  /** 读脸请求进行中。★ 单独一格,不复用 `busy`——那个会同时禁掉「建档」按钮并改它的文案。 */
  const analyzing = ref(false)
  const error = ref('')

  /** 建档草稿:`{ photo, photoName }`,`photo` 是缩小后的 dataURL。 */
  const draft = ref(readDraft())

  /**
   * 人脸知识库:肤色 8 档、面部特征 6 组,问卷页与详情页共用。
   * ★ `getFeatureTags()` 回的是 `{ groups, features }`,这里拆成两个字段(`FeaturePicker` 要的是分开的两份)。
   * ★ 来自 `kb/`(纯数据),所以 `@/api/design` 可以静态引。
   */
  const skinTones = getSkinTones()
  const featureKb = getFeatureTags()
  const featureGroups = featureKb.groups
  const featureList = featureKb.features

  /** 本账号自建的那几档肤色(服务端 `GET /personas.skinTones`)。★ 预置那 8 档**不在这里**。 */
  const customTones = ref([])

  const personas = computed(() => list.value)
  /** 选择器要摆的**全部**档位:预置 8 档 + 自建。★ 页面一律用这个,别直接用 `skinTones`。 */
  const allSkinTones = computed(() => [...skinTones.map((t) => ({ ...t, custom: false })), ...customTones.value.map((t) => ({ ...t, custom: true }))])

  async function guard(fn) {
    busy.value = true
    error.value = ''
    try {
      return await fn()
    } catch (e) {
      // ★ 服务端那几句 message 已经是给人看的中文(api/index.js 的解包拦截器取的就是它),
      //   这里原样用,不按 code 分支、不自己编映射表(§3 第 2 条)。
      error.value = e?.message || '保存失败，请稍后再试'
      return null
    } finally {
      busy.value = false
    }
  }

  /**
   * 把列表与自建档一起收下来。**四处写路径共用** —— 只更 `list` 会把自建档落下,
   * 于是删掉一档之后它还留在选择器里(点下去 422,而界面看不出为什么)。
   */
  async function pull(api, id) {
    const res = await api.getPersonas({ userId: id })
    list.value = res.personas
    customTones.value = res.skinTones || []
    canAnalyzeFace.value = res.canAnalyzeFace
    return res
  }

  /**
   * 读某个账号的全部人设。
   * ★ 异步:调用方(五个页面)**必须 `await` 之后再读 `getById`**,否则首帧是空列表,
   *   `FormView` / 详情页会把用户静默踢回人设库。
   */
  async function load(nextUserId) {
    userId.value = nextUserId
    return guard(async () => {
      const api = await personasApi()
      await pull(api, nextUserId)
      // ★ 拉到了才删本机旧数据:拉不到就不许动它(那可能只是这次网络不通)。
      api.clearLocalPersonas(nextUserId)
      return list.value
    })
  }

  function getById(id) {
    return list.value.find((p) => p.id === id) || null
  }

  /** 退出登录时清空。★ 这里存的是**脸**,不清会比化妆包更糟(见 api/personas.js 文件头)。 */
  function reset() {
    userId.value = ''
    list.value = []
    customTones.value = []
    canAnalyzeFace.value = false
    analyzing.value = false
    error.value = ''
    draft.value = {}
    clearDraft()
  }

  /* ----------------------------- 建档草稿 ----------------------------- */

  /**
   * 收下用户选的照片:先缩到长边 ≤640 的 JPEG 再存(原图会被服务端挡回来)。
   * ★ 缩放失败时 `shrinkPhoto` 原样返回,这里也不拦 —— 宁可大一点被挡,也别悄悄把照片变空。
   */
  async function putDraftPhoto(file) {
    return guard(async () => {
      const api = await personasApi()
      const photo = await api.shrinkPhoto(file)
      draft.value = { photo, photoName: file?.name || '' }
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft.value))
      } catch {
        /* 存不进 sessionStorage 也不影响本页流程,内存里那份还在 */
      }
      return photo
    })
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* 隐私模式忽略 */
    }
  }

  /**
   * 只缩图,**不碰草稿**。人设详情的「换一张照片」用它 —— 那张照片属于**已有**档案,
   * 借建档草稿那条路会覆盖掉用户正在建的另一份。
   */
  async function shrinkOnly(file) {
    const api = await personasApi()
    return guard(() => api.shrinkPhoto(file))
  }

  /**
   * 让服务端读一次脸,**给一个建议肤色档**。★ **会花钱**。
   * ★ 调用点必须在**用户点了按钮**那一下(不在任何 `onMounted` 里),且只在 `canAnalyzeFace` 为真时发。
   * ★ 回的是 `{ skinTone }`,**只有肤色**;翻不出档位时是空串,由页面显示「未定档」(绝不猜)。
   */
  async function analyze(photo = draft.value.photo) {
    if (analyzing.value) return null
    const api = await personasApi()
    analyzing.value = true
    error.value = ''
    try {
      return await api.analyzePersonaFace({ userId: userId.value, photo: photo || '' })
    } catch (e) {
      error.value = e?.message || '读脸失败，请稍后再试'
      return null
    } finally {
      analyzing.value = false
    }
  }

  /* ----------------------------- 增删改 ----------------------------- */

  /**
   * 建档。★ 失败时 `error` 是服务端那句人话(照片太大 / 人设库满了 / 网络不通),这里不吞 ——
   *   建档"成功"而库里没有那一份是这条链最坏的形状。
   */
  async function create(payload) {
    return guard(async () => {
      const api = await personasApi()
      const persona = await api.createPersona({ userId: userId.value, ...payload })
      await pull(api, userId.value)
      clearDraft()
      draft.value = {}
      return persona
    })
  }

  async function update(id, patch) {
    return guard(async () => {
      const api = await personasApi()
      const persona = await api.updatePersona({ userId: userId.value, id, ...patch })
      await pull(api, userId.value)
      return persona
    })
  }

  async function remove(id) {
    return guard(async () => {
      const api = await personasApi()
      await api.removePersona({ userId: userId.value, id })
      await pull(api, userId.value)
      return true
    })
  }

  /* --------------------------- 自建肤色档 --------------------------- */

  /**
   * 建一档自己的肤色(名字 + 颜色)。**整账号共用一份小库**,没有单独的列表接口 —— 建完重取列表。
   * ★ 名字太长 / 已满 20 档 ⇒ 服务端 409 或 422,`error` 里那句中文原样上屏。
   */
  async function addTone(name, hex) {
    return guard(async () => {
      const api = await personasApi()
      const tone = await api.createSkinTone({ userId: userId.value, name, hex })
      await pull(api, userId.value)
      return tone
    })
  }

  /**
   * 删一档自建肤色。★ 本账号还有任何一份人设在用它 ⇒ 服务端 **409**,这里**不先摘掉它**(摘了就是骗人)。
   */
  async function removeTone(id) {
    return guard(async () => {
      const api = await personasApi()
      await api.removeSkinTone({ userId: userId.value, id })
      await pull(api, userId.value)
      return true
    })
  }

  return {
    userId,
    busy,
    error,
    draft,
    personas,
    canAnalyzeFace,
    analyzing,
    skinTones,
    allSkinTones,
    featureGroups,
    featureList,
    load,
    getById,
    reset,
    putDraftPhoto,
    shrinkOnly,
    clearDraft,
    analyze,
    create,
    update,
    remove,
    addTone,
    removeTone,
  }
})
