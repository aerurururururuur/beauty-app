<script setup>
import Icon from './Icon.vue'

defineProps({
  tips: { type: Array, default: () => [] },
  title: { type: String, default: 'AI 拍摄指导' }
})
</script>

<template>
  <div v-if="tips.length" class="tip-banner">
    <div class="tip-title caps">{{ title }}</div>
    <div v-for="(tip, i) in tips" :key="i" class="tip-item">
      <Icon name="check" :size="13" class="tip-check" />
      <span class="tip-text">{{ tip.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.tip-banner {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.tip-title {
  margin-bottom: 10px;
  color: var(--c-ink-soft);
}

.tip-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  color: var(--c-ink-soft);
  line-height: 1.6;
}

.tip-item + .tip-item {
  margin-top: 7px;
}

.tip-check {
  color: var(--c-accent);
  margin-top: 3px;
  flex-shrink: 0;
}
</style>
