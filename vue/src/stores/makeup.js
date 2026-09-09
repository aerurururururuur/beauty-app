import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_WEATHER } from '@/constants/options'

/**
 * makeup store —— 「场景美妆镜」制作台状态。
 * 本人照片 1 张 + 需求简报(brief):
 *   occasion 场合(interview/date/stage/family/daily)、sceneText 自由文字、
 *   skinType/skinTone 肤质肤色、dress 穿搭、weather 日期天气。
 * 风景图(sceneFiles)保留但降级为可选参考,不参与风格判定。
 * 提交后记录任务 id,交由 ResultView 轮询后端(或 mock)。
 */
export const useMakeupStore = defineStore('makeup', () => {
  // ---- 本人照(必填) ----
  const portraitFile = ref(null) // File | null(demo 填充时为 null 也可提交,mock 下无碍)
  const portraitUrl = ref('') // 本人照片预览(objectURL 或静态路径)

  // ---- 风景参考图(可选,降级,不驱动风格) ----
  const sceneFiles = ref([]) // File[]
  const sceneUrls = ref([]) // string[](与 sceneFiles 一一对应)

  // ---- 需求简报 brief ----
  const occasion = ref('') // Occasion | ''(未选)
  const sceneText = ref('') // 自由文字自定义板
  const skinType = ref('') // SkinType | ''(未选)
  const skinTone = ref('medium') // SkinTone(默认中间档,不以浅肤色为默认)
  const dress = ref('') // 穿搭一句话(风格 + 主色)
  const weather = ref({ ...DEFAULT_WEATHER })

  // ---- 任务 ----
  const jobId = ref('')
  const submitting = ref(false)

  /** 提交用简报:只收有值的字段,与后端 meta 契约一一对应。 */
  const brief = computed(() => {
    const b = {}
    if (occasion.value) b.occasion = occasion.value
    const text = (sceneText.value || '').trim()
    if (text) b.sceneText = text
    if (skinType.value) b.skinType = skinType.value
    if (skinTone.value) b.skinTone = skinTone.value
    const d = (dress.value || '').trim()
    if (d) b.dress = d
    b.weather = { ...weather.value }
    return b
  })

  function revoke(url) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  function setPortrait(file, url) {
    revoke(portraitUrl.value)
    portraitFile.value = file
    portraitUrl.value = url
  }

  function addScene(file, url) {
    sceneFiles.value.push(file)
    sceneUrls.value.push(url)
  }

  function removeScene(index) {
    revoke(sceneUrls.value[index])
    sceneFiles.value.splice(index, 1)
    sceneUrls.value.splice(index, 1)
  }

  function setSceneText(text) {
    sceneText.value = text
  }

  function startSubmit() {
    submitting.value = true
  }

  function finishSubmit(id) {
    jobId.value = id
    submitting.value = false
  }

  function failSubmit() {
    submitting.value = false
  }

  function reset() {
    revoke(portraitUrl.value)
    sceneUrls.value.forEach(revoke)
    portraitFile.value = null
    portraitUrl.value = ''
    sceneFiles.value = []
    sceneUrls.value = []
    occasion.value = ''
    sceneText.value = ''
    skinType.value = ''
    skinTone.value = 'medium'
    dress.value = ''
    weather.value = { ...DEFAULT_WEATHER }
    jobId.value = ''
    submitting.value = false
  }

  // ---- 派生 ----
  const hasContext = computed(
    () => !!occasion.value || (sceneText.value || '').trim().length > 0
  )
  const canSubmit = computed(
    () => !!portraitUrl.value && hasContext.value && !submitting.value
  )

  return {
    portraitFile,
    portraitUrl,
    sceneFiles,
    sceneUrls,
    occasion,
    sceneText,
    skinType,
    skinTone,
    dress,
    weather,
    brief,
    jobId,
    submitting,
    hasContext,
    canSubmit,
    setPortrait,
    addScene,
    removeScene,
    setSceneText,
    startSubmit,
    finishSubmit,
    failSubmit,
    reset
  }
})
