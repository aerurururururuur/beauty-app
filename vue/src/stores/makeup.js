import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * makeup store —— 「场景美妆」制作台状态。
 * 本人照片 1 张（上传的 File + 预览 URL），风景图 0..N 张，场景文字可选；
 * 提交后记录任务 id，交由 ResultView 轮询后端（或 mock）。
 */
export const useMakeupStore = defineStore('makeup', () => {
  // ---- 输入 ----
  const portraitFile = ref(null) // File | null（demo 填充时为 null 也可提交，mock 下无碍）
  const portraitUrl = ref('') // 本人照片预览（objectURL 或静态路径）
  const sceneFiles = ref([]) // File[]
  const sceneUrls = ref([]) // string[]（与 sceneFiles 一一对应）
  const sceneText = ref('')

  // ---- 任务 ----
  const jobId = ref('')
  const submitting = ref(false)

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
    sceneText.value = ''
    jobId.value = ''
    submitting.value = false
  }

  // ---- 派生 ----
  const hasScene = computed(
    () => sceneFiles.value.length > 0 || (sceneText.value || '').trim().length > 0
  )
  const canSubmit = computed(
    () => !!portraitUrl.value && hasScene.value && !submitting.value
  )

  return {
    portraitFile,
    portraitUrl,
    sceneFiles,
    sceneUrls,
    sceneText,
    jobId,
    submitting,
    hasScene,
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
