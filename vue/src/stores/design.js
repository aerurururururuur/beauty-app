import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api/design'

/**
 * 「开始设计」那条链的 store:场景 → 选形象 → 填信息 → 生成方案。
 *
 * ★ 方案**完全在本地推导**(`api/design.js` 的文件头说清了为什么:后端没有这条链的
 *   任何端点)。所以「生成」「换一版」「换风格」都是**同步**的,没有网络往返。
 *
 * ★ 因此这里**故意不做**那套「AI 正在为你编排妆容步骤…」的等待动画——
 *   本地一次计算是毫秒级的,做一个假的等待屏等于告诉用户「刚才有台服务器在为你工作」,
 *   而并没有。真接上后端生成时,把 `generating` 真正用起来:那时它才配得上这个名字。
 *
 * ★ 页面之间传的是 URL 参数(scene / persona / style),不是这家 store——
 *   这些参数**可深链**,刷新后要靠 URL 重建页面(见 `buildResult`)。
 *   store 只是这次会话的一份缓存,刷新后从 URL 重算得到同样的结果。
 */

export const useDesignStore = defineStore('design', () => {
  const scenes = api.getScenes()

  /** 当前这一版方案的结果对象(形状见 api/design.js 的 getDesignResult)。 */
  const result = ref(null)
  /** 填信息页当前用的表单定义。 */
  const form = ref(null)
  /** 本次方案要代入的面部特征(来自选中的人设档案)。 */
  const features = ref([])
  /**
   * 填信息页收上来的字段原样留一份(`{ key, type, text, images }`)。
   *
   * ★★ **今天没有任何东西读它**——方案完全由 `sceneId` / `styleId` / `features`
   *    在本地推导(`api/design.js` 的文件头)。留着这一格是为了接后端时有个明确的
   *    落点,**不是为了"看起来用了"**:结果页不许声称这些字段影响了方案。
   */
  const fields = ref([])
  /** 真接上后端生成时才有意义的忙碌态,现在恒为 false。 */
  const generating = ref(false)
  const error = ref('')

  const stepCount = computed(() => result.value?.steps?.length || 0)
  const styleOptions = computed(() => result.value?.styleOptions || [])

  /* ------------------------------ 场景 ------------------------------ */

  function sceneNameOf(sceneId) {
    return api.sceneNameOf(sceneId)
  }

  /** 填信息页:`form` 决定本场景出现哪几个字段(旅行只有两个,面试有四个)。 */
  function loadForm(sceneId) {
    form.value = api.getSceneForm({ sceneId })
    return form.value
  }

  /* ------------------------------ 方案 ------------------------------ */

  /** 按 URL 参数重建方案。刷新结果页、换风格、换一版都走这里。 */
  function buildResult({ sceneId = 'party', styleId = '', features: ids = [] } = {}) {
    features.value = ids
    result.value = api.getDesignResult({ sceneId, styleId, features: ids })
    return result.value
  }

  /**
   * 从填信息页提交进入结果页。返回要给路由带的参数(不含 taskId——
   * 本地方案没有任务号,地址栏里那个 `task` 参数是源站接后端时留下的,新前端不再带它)。
   */
  function submit({ sceneId = 'party', styleId = '', features: ids = [], fields: values = [] } = {}) {
    fields.value = values
    buildResult({ sceneId, styleId, features: ids })
    return { sceneId, styleId: result.value.styleId }
  }

  /** 换一个妆容风格:步骤数量与顺序会跟着配方变,整页重建。 */
  function setStyle(styleId) {
    if (!result.value || styleId === result.value.styleId) return result.value
    return buildResult({ sceneId: result.value.sceneId, styleId, features: features.value })
  }

  /** 换一版:切到本场景候选池里的下一个风格。 */
  function regenerate() {
    if (!result.value) return null
    const { styleId } = api.regenerateDesign({
      sceneId: result.value.sceneId,
      styleId: result.value.styleId,
    })
    return setStyle(styleId)
  }

  /**
   * 「记下这一版」。★ 不调任何接口、不假装落库——返回的就是一份**本地 JSON 快照**
   *   (`api/design.js` 的 snapshotDesign 说明为什么这么设计)。
   *   页面的按钮文案要说「已记下这一版」,不能说「已保存到我的作品」。
   */
  function snapshot() {
    return result.value ? api.snapshotDesign(result.value) : null
  }

  function reset() {
    result.value = null
    form.value = null
    features.value = []
    fields.value = []
    error.value = ''
  }

  return {
    scenes,
    result,
    form,
    features,
    fields,
    generating,
    error,
    stepCount,
    styleOptions,
    sceneNameOf,
    loadForm,
    buildResult,
    submit,
    setStyle,
    regenerate,
    snapshot,
    reset,
  }
})
