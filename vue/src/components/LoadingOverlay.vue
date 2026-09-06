<script setup>
defineProps({
  text: { type: String, default: '试色生成中…' }
})
</script>

<template>
  <div class="loading-overlay">
    <div class="ring"></div>
    <div class="text">{{ text }}</div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(245, 240, 233, 0.88);
}

.ring {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid var(--c-line);
  border-top-color: var(--c-accent);
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.text {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--c-ink-soft);
}
</style>
