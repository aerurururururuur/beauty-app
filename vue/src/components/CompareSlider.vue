<script setup>
import { ref } from 'vue'

const props = defineProps({
  defaultPos: { type: Number, default: 50 }
})

const root = ref(null)
const pos = ref(props.defaultPos)
const dragging = ref(false)

function setFromEvent(e) {
  const rect = root.value.getBoundingClientRect()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  pos.value = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
}

function onDown(e) {
  dragging.value = true
  setFromEvent(e)
}
function onMove(e) {
  if (!dragging.value) return
  setFromEvent(e)
}
function onUp() {
  dragging.value = false
}
</script>

<template>
  <div
    ref="root"
    class="compare"
    @mousedown="onDown"
    @mousemove="onMove"
    @mouseup="onUp"
    @mouseleave="onUp"
    @touchstart="onDown"
    @touchmove="onMove"
    @touchend="onUp"
  >
    <!-- 试色后（底层） -->
    <div class="layer layer-after">
      <slot name="after" />
    </div>
    <!-- 原图（顶层，按位置裁剪） -->
    <div class="layer layer-before" :style="{ clipPath: `inset(0 ${100 - pos}% 0 0)` }">
      <slot name="before" />
    </div>
    <!-- 分割手柄 -->
    <div class="divider" :style="{ left: pos + '%' }">
      <span class="grip"></span>
    </div>
    <span class="badge b-before" :class="{ hide: pos < 45 }">原图</span>
    <span class="badge b-after" :class="{ hide: pos > 55 }">妆容</span>
  </div>
</template>

<style scoped>
.compare {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--c-line-strong);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: var(--c-surface);
}

.layer {
  position: absolute;
  inset: 0;
}

.layer :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.layer-before {
  pointer-events: none;
}

.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.95);
  transform: translateX(-50%);
  z-index: 5;
  cursor: ew-resize;
}

.grip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid var(--c-line-strong);
  box-shadow: 0 2px 10px rgba(42, 30, 34, 0.14);
}

.badge {
  position: absolute;
  top: 12px;
  z-index: 4;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #fff;
  background: rgba(42, 30, 34, 0.5);
  transition: opacity 0.2s ease;
}

.b-before {
  left: 12px;
}

.b-after {
  right: 12px;
}

.badge.hide {
  opacity: 0;
}
</style>
