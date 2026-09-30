import { ref } from 'vue'

/**
 * 藏起来的 `<input type="file">` 的「**先清空、再点**」管道。
 *
 * ★ 为什么非要先清空:同一个文件连选两次时,`input.value` 没变,`change` 事件**不触发**——
 *   用户会以为「点了没反应」。点击前把 `value` 置空就能绕开。
 *   这个时机原先散在两处、两种写法(一处点击前清、一处 change 后清),现在只在一处决定。
 *
 * 用法:
 *   const { inputRef, capture, pick } = useFilePick()
 *   // 模板里:<input ref="inputRef" type="file" accept="image/*" :capture="capture" hidden @change="onFile" />
 *   // 按钮上:@click="pick()" 或 @click="pick({ camera: true })"
 *
 * ★ `capture` 绑在 input 上:手机上 `'user'` 唤起前置摄像头。
 *   桌面浏览器忽略这个属性,所以两种入口看起来一样——那是浏览器的行为,不是没生效。
 *
 * ⚠️ 它**不管**选中之后干什么(缩图?上传?预览?)。那些留给调用方,
 *   因为三个调用点的后续动作本来就不同(存草稿 / 只缩图 / 多图预览)。
 */
export function useFilePick() {
  const inputRef = ref(null)
  const capture = ref(null)

  function pick({ camera = false } = {}) {
    capture.value = camera ? 'user' : null
    // ★ 同一个文件连选两次也要能触发 change
    if (inputRef.value) inputRef.value.value = ''
    inputRef.value?.click()
  }

  return { inputRef, capture, pick }
}
