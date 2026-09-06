<script setup>
import { rgbCss, rgbToHex } from '@/utils/color'

defineProps({
  lipstick: { type: Object, required: true },
  active: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])
</script>

<template>
  <button class="lipstick" :class="{ active }" @click="emit('select', lipstick)">
    <div class="swatch" :style="{ background: rgbCss(lipstick.rgb) }"></div>
    <div class="brand caps">{{ lipstick.brand }}</div>
    <div class="name">{{ lipstick.name }}</div>
    <div class="meta">
      <span class="finish">{{ lipstick.finish }}</span>
      <span class="hex">{{ rgbToHex(lipstick.rgb) }}</span>
    </div>
  </button>
</template>

<style scoped>
.lipstick {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 10px 14px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius);
  background: var(--c-surface);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.lipstick:active {
  background: var(--c-surface-2);
}

.lipstick.active {
  border-color: var(--c-accent);
}

.swatch {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 1px solid var(--c-line);
  box-shadow: inset 0 -3px 8px rgba(42, 30, 34, 0.15);
  margin-bottom: 14px;
}

.brand {
  margin-bottom: 4px;
}

.name {
  font-family: var(--font-display);
  font-size: 15px;
  margin-bottom: 10px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.finish {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--c-ink-soft);
}

.hex {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--c-ink-faint);
}
</style>
