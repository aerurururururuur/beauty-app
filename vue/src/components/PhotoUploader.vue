<script setup>
import { ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '上传照片' },
  sub: { type: String, default: '点击或拖拽图片' },
  height: { type: String, default: '220px' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const inputRef = ref(null)
const dragging = ref(false)

function pick() {
  inputRef.value?.click()
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return
  if (props.modelValue) URL.revokeObjectURL(props.modelValue)
  emit('update:modelValue', URL.createObjectURL(file))
  emit('change', file)
}

function onInput(e) {
  handleFile(e.target.files?.[0])
  e.target.value = ''
}

function onDrop(e) {
  dragging.value = false
  handleFile(e.dataTransfer.files?.[0])
}
</script>

<template>
  <div
    class="uploader"
    :class="{ dragging, filled: !!modelValue }"
    :style="{ height }"
    @click="pick"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input ref="inputRef" type="file" accept="image/*" hidden @change="onInput" />

    <template v-if="modelValue">
      <img class="preview" :src="modelValue" alt="预览" />
      <span class="redo">重新上传</span>
    </template>
    <template v-else>
      <Icon name="camera" :size="26" class="icon" />
      <div class="label">{{ label }}</div>
      <div class="sub">{{ sub }}</div>
    </template>
  </div>
</template>

<style scoped>
.uploader {
  position: relative;
  background: var(--c-bg);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.18s ease;
}

.uploader:hover,
.uploader.dragging {
  border-color: var(--c-accent);
}

.icon {
  color: var(--c-ink-faint);
}

.label {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--c-ink);
}

.sub {
  font-size: 11px;
  color: var(--c-ink-faint);
}

.preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.redo {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  padding: 22px 0 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #fff;
  background: linear-gradient(transparent, rgba(42, 30, 34, 0.55));
  opacity: 0;
  transition: opacity 0.18s ease;
}

.uploader:hover .redo {
  opacity: 1;
}
</style>
