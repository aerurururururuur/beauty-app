import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局试妆状态：上传照片、色卡、选中口红、试色结果。
 * 跨「上传 → 选色 → 结果」三个页面共享。
 */
export const useTryonStore = defineStore('tryon', () => {
  const photoFile = ref(null)      // 自拍 File（真实模式上传用）
  const photoUrl = ref('')         // 自拍预览 objectURL / 演示图路径
  const colorCardFile = ref(null)  // 色卡 File（可空）
  const colorCardUrl = ref('')     // 色卡预览
  const selectedLipstick = ref(null)
  const result = ref(null)         // { resultUrl, analysis, explain, tips, lipstick }

  function setPhoto(file, url) {
    if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
    photoFile.value = file
    photoUrl.value = url
    result.value = null
  }

  function setColorCard(file, url) {
    if (colorCardUrl.value) URL.revokeObjectURL(colorCardUrl.value)
    colorCardFile.value = file
    colorCardUrl.value = url
  }

  function selectLipstick(lipstick) {
    selectedLipstick.value = lipstick
  }

  function setResult(r) {
    result.value = r
  }

  function reset() {
    if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
    if (colorCardUrl.value) URL.revokeObjectURL(colorCardUrl.value)
    photoFile.value = null
    photoUrl.value = ''
    colorCardFile.value = null
    colorCardUrl.value = ''
    selectedLipstick.value = null
    result.value = null
  }

  return {
    photoFile, photoUrl, colorCardFile, colorCardUrl, selectedLipstick, result,
    setPhoto, setColorCard, selectLipstick, setResult, reset
  }
})
