import { computed } from 'vue'
import { useQueryParam } from './useQueryParam'

/**
 * 「开始设计」那条链的当前场景,以及**是不是在选人模式里**。
 *
 * 这两个值分开看都很小,合起来才是这条动线的语义:
 * **只有带了场景,选人模式才成立**——没有场景可代入时,"从人设库挑一张脸"没有意义,
 * 所以 `?pick=1` 单独出现是无效的,必须与 `?scene=` 一起。
 *
 * 这条规则原先在 `PersonasView` 与 `PersonaNewView` 各写了一份(逐字节相同),
 * 集中到这里之后,以后改规则不会再漏掉某一屏。
 *
 * ★ 这里的 `scene` 兜底是 `''`(不是 `'party'`):它服务的是人设库那几屏,
 *   那些屏没带场景时应当**不进**选人模式。`/form`、`/result` 的 `'party'` 兜底是另一回事,
 *   那两屏直接用自己的 `useQueryParam('scene', 'party')`,不走这里。
 *
 * 用法: `const { sceneId, pick } = useSceneQuery()`
 */
export function useSceneQuery() {
  const sceneId = useQueryParam('scene')
  const pickFlag = useQueryParam('pick')

  const pick = computed(() => pickFlag.value === '1' && Boolean(sceneId.value))

  return { sceneId, pick }
}
