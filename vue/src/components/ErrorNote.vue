<template>
  <p v-if="text" class="error-note">{{ text }}</p>
</template>

<script setup>
/**
 * 错误提示条。`text` 为空时**整块不渲染**(不是渲染一个空框)。
 *
 * ★ 文案就是后端 `message` 的原文。前端**不按 `error.code` 分支**、不写自己的映射表——
 *   后端那句本来就是给人看的中文,自己再翻一遍只会两边漂移。
 * ★ 承放的是「操作失败」这类**要说给用户听**的错,不是开发期的调试输出。
 */
defineProps({
  /** 要显示的那句话;空串 = 不显示。 */
  text: { type: String, default: '' },
})
</script>

<style scoped>
.error-note {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}
</style>
