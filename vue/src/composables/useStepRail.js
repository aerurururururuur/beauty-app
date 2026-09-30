import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 结果页的步骤导航:滚动时**反向高亮**跟着走,点某一项就**平滑滚过去**。
 *
 * 为什么它自成一体:一个 IntersectionObserver 的完整生命周期——建立、随数据重建而换目标、
 * 以及卸载时 `disconnect()`——散在页面里要占三十多行,而且漏掉 `disconnect()` 不报错,
 * 只是悄悄泄漏。收在一处之后,这条生命周期只有一个入口。
 *
 * ★ 它与 `router/index.js` 的 `scrollBehavior` 是**一对**:那条规则对带 `hash` 的跳转
 *   返回 `false`,**就是为了不抢这里的锚点滚动**。改这个 composable 时那条配置要一起看,
 *   别只改一边。
 *
 * 参数:
 *   source —— 一个 getter(如 `() => result.value`)。它一变就说明整列步骤重建了,
 *             观察器要换一批目标。`flush: 'post'` 保证在 DOM 更新之后再换。
 *   steps  —— 步骤数组的 computed(用来取第一步的 id 作为初始高亮)。
 *
 * 返回:
 *   activeId —— 当前高亮的步骤 id(页面绑到 `--active` 类上)
 *   els      —— 绑到 `v-for` 的步骤块上(`ref="els"`),观察器的目标
 *   jumpTo   —— 点导航项时调用,传步骤 id
 */
export function useStepRail(source, steps) {
  const activeId = ref('')
  const els = ref([])
  let observer = null

  /** 顶栏高度之下的那一段才算"正在看"的步骤。 */
  function observe() {
    observer?.disconnect()
    if (!els.value.length) return
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((en) => en.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) activeId.value = visible.target.dataset.step
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: 0 }
    )
    els.value.forEach((el) => observer.observe(el))
  }

  /** 平滑滚到某一步:减去固定的步骤条高度,别让目标被它盖住。 */
  function jumpTo(id) {
    const target = document.getElementById(`step-${id}`)
    if (!target) return
    const rail = document.querySelector('.step-rail')
    const top = target.getBoundingClientRect().top + window.scrollY - (rail?.offsetHeight || 0) - 24
    window.scrollTo({ top, behavior: 'smooth' })
    activeId.value = id
  }

  // 换风格 / 换一版之后整列步骤会重建,观察器要跟着换一批目标
  watch(
    source,
    async () => {
      await nextTick()
      activeId.value = steps.value[0]?.id || ''
      observe()
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => observer?.disconnect())

  return { activeId, els, jumpTo }
}
