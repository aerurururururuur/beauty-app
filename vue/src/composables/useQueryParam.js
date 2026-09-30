import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 读路由上的**查询参数**,取成字符串。
 *
 * ★ 为什么不直接在页面里写 `route.query.scene`:
 *   vue-router 给回来的是 `string | string[] | null | undefined`——同名参数出现两次就是数组。
 *   页面每次都得写一遍 `typeof … === 'string' ? … : 兜底`。这个判断在本目录里重复了 11 处,
 *   收在这里。
 *
 * ⚠️ **`fallback` 要按各页的语义给,别图省事统一成 `''`。**
 *    `/form` 与 `/result` 的 `scene` 兜底是 `'party'`(没带场景时也得算出一版方案),
 *    其余各页是 `''`。统一会让那两屏失去兜底——这是抽这个函数最容易踩的坑。
 *
 * 用法: `const sceneId = useQueryParam('scene')` → 一个只读 computed(string)。
 */
export function useQueryParam(name, fallback = '') {
  const route = useRoute()
  return computed(() => {
    const value = route.query[name]
    return typeof value === 'string' ? value : fallback
  })
}

/**
 * 同上,但读的是**路径参数**(`/personas/:id` 里的 `:id`)。
 * 与查询参数一样,拿到的是 `string | string[]`,所以判断方式相同。
 */
export function useRouteParam(name, fallback = '') {
  const route = useRoute()
  return computed(() => {
    const value = route.params[name]
    return typeof value === 'string' ? value : fallback
  })
}
