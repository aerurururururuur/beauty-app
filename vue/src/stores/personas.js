import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api/personas'
import { getFeatureTags, getSkinTones } from '@/api/design'

/**
 * 人设库(形象库)store。
 *
 * ★ 数据在**本机浏览器**里,按账号分开存(`api/personas.js` 的键是 `tz:personas:<userId>`)。
 *   所以本 store 的每个动作都要带 `userId`——它由页面从 user store 传进来,
 *   别在这里从别处偷一个。「为什么必须按账号分」见 api/personas.js 文件头。
 *
 * ★ 建档流程跨两页(上传照片 → 面诊问卷),照片走 `draft`:
 *   内存里存一份给页面用,sessionStorage 里存一份防刷新——**它只在本次会话内存活**,
 *   建档成功或用户中途退出就清掉,不留底。
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

export const usePersonasStore = defineStore('personas', () => {
  const userId = ref('')
  const list = ref([])
  const busy = ref(false)
  const error = ref('')

  /** 建档草稿:`{ photo, photoName }`,`photo` 是缩小后的 dataURL。 */
  const draft = ref(readDraft())

  /**
   * 人脸知识库:肤色 8 档、面部特征 6 组。问卷页与详情页共用同一份。
   * ★ `getFeatureTags()` 回的是一整个 `{ groups, features }`,这里**拆成两个字段**再导出:
   *   直接叫 `featureTags` 会让人以为它是一组标签,而 `FeaturePicker` 要的是分开的两份。
   */
  const skinTones = getSkinTones()
  const featureKb = getFeatureTags()
  const featureGroups = featureKb.groups
  const featureList = featureKb.features

  const personas = computed(() => list.value)
  const count = computed(() => list.value.length)

  /** 照片存不下时 `setItem` 抛的是浏览器的英文异常,不能直接甩给用户。 */
  function humanize(e) {
    const name = e?.name || ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(e?.message || '')) {
      return '本机存储空间不够了。换一张小一点的照片，或先删掉几份旧人设再试。'
    }
    return e?.message || '保存失败，请稍后再试'
  }

  async function guard(fn) {
    busy.value = true
    error.value = ''
    try {
      return await fn()
    } catch (e) {
      error.value = humanize(e)
      return null
    } finally {
      busy.value = false
    }
  }

  /** 读某个账号的全部人设。进人设库 / 首页「我的脸模」模块时调。 */
  function load(nextUserId) {
    userId.value = nextUserId
    list.value = api.getPersonas({ userId: nextUserId })
  }

  function getById(id) {
    return list.value.find((p) => p.id === id) || null
  }

  /** 退出登录时清空。★ 这里存的是**脸**,不清会比化妆包更糟(见 api/personas.js 文件头)。 */
  function reset() {
    userId.value = ''
    list.value = []
    error.value = ''
    draft.value = {}
    clearDraft()
  }

  /* ----------------------------- 建档草稿 ----------------------------- */

  /**
   * 收下用户选的照片:先缩到长边 ≤640 的 JPEG 再存(原图会撑爆 localStorage 配额)。
   * ★ 缩放失败时 `shrinkPhoto` 原样返回,这里也不拦——宁可存大一点,
   *   也不要因为缩放出错就悄悄把人设照片变空。
   */
  async function putDraftPhoto(file) {
    return guard(async () => {
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
   * 只缩图,**不碰草稿**。人设详情的「换一张照片」用它:
   * 那张照片属于**已有**档案,不能借建档草稿那条路走——会覆盖掉用户正在建的另一份。
   */
  async function shrinkOnly(file) {
    return guard(() => api.shrinkPhoto(file))
  }

  /** 照片就绪后按 dataURL 哈希给一组**稳定**的建议(同一张照片每次同样结果)。 */
  function analyze(photo = draft.value.photo) {
    return api.analyzePortrait({ image: photo || '' })
  }

  /* ----------------------------- 增删改 ----------------------------- */

  /** 建档。★ 存不下会**真的失败**(api 层故意不吞),失败时 `error` 是给人看的一句话。 */
  async function create(payload) {
    return guard(async () => {
      const persona = api.createPersona({ userId: userId.value, ...payload })
      list.value = api.getPersonas({ userId: userId.value })
      clearDraft()
      draft.value = {}
      return persona
    })
  }

  async function update(id, patch) {
    return guard(async () => {
      const persona = api.updatePersona({ userId: userId.value, id, ...patch })
      list.value = api.getPersonas({ userId: userId.value })
      return persona
    })
  }

  async function remove(id) {
    return guard(async () => {
      api.removePersona({ userId: userId.value, id })
      list.value = api.getPersonas({ userId: userId.value })
      return true
    })
  }

  return {
    userId,
    busy,
    error,
    draft,
    personas,
    count,
    skinTones,
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
  }
})
