import { onBeforeUnmount, ref } from 'vue'

/**
 * `URL.createObjectURL` 的 create / revoke 生命周期。
 *
 * ★ 它为什么配得上一个 composable(全仓只有一处用它,并不重复):
 *   这是 `AGENTS.md` §8-3 的一条**红线**——每 create 一个 blob URL,就必须有对应的
 *   `revokeObjectURL`。少了它不只是漏一份内存:blob URL 会把那个文件**一直钉在内存里**,
 *   直到刷新页面才释放。红线散在页面里只能靠人记得;收在这里之后,
 *   「什么时候收尾」只有一个地方可查、可改。
 *
 * 用法:
 *   const { create, release } = useObjectUrls()
 *   const url = create(file)     // 选中的文件
 *   release(url)                 // 用户移除这一张时
 *   // 离开页面时剩下的由这个 composable 自动收掉,调用方**不用**再写 onBeforeUnmount
 *
 * ⚠️ 只收它自己 create 出来的 URL。传进来一个不是它的 URL 会被忽略(不会去 revoke 别人的)。
 */
export function useObjectUrls() {
  const urls = ref([])

  function create(file) {
    const url = URL.createObjectURL(file)
    urls.value.push(url)
    return url
  }

  function release(url) {
    const at = urls.value.indexOf(url)
    if (at < 0) return
    urls.value.splice(at, 1)
    URL.revokeObjectURL(url)
  }

  onBeforeUnmount(() => {
    for (const url of urls.value) URL.revokeObjectURL(url)
    urls.value = []
  })

  return { urls, create, release }
}
