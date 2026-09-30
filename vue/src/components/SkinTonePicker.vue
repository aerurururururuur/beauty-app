<template>
  <section class="skin-picker">
    <header class="skin-picker__head">
      <h2 class="skin-picker__title">肤色<span class="skin-picker__req">必选 · 单选</span></h2>
      <p class="skin-picker__hint">照片难免有色差，AI 给的是建议档，请按素颜自然光下的真实肤色确认。</p>
    </header>
    <div class="skin-picker__grid">
      <button
        v-for="t in tones"
        :key="t.id"
        type="button"
        class="skin-chip"
        :class="{ 'skin-chip--on': t.id === modelValue }"
        :title="t.desc"
        :aria-pressed="t.id === modelValue"
        @click="$emit('update:modelValue', t.id)"
      >
        <span class="skin-chip__dot" :style="{ background: t.hex }"></span>
        <span class="skin-chip__name">{{ t.name }}</span>
        <span class="skin-chip__desc">{{ t.tone }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
/**
 * 肤色档单选(8 档)。
 *
 * ★ 提示语「照片难免有色差,AI 给的是建议档」是**产品要求**,不是客套:
 *   照片的白平衡会把肤色整体拉偏,所以这里的值永远由**用户确认**,
 *   不能把 `analyzePortrait()` 的返回值当成判定结果直接存。
 * ★ 色块底色是 `tone.hex`(真实肤底色),**不许调成「更白更好看」**(红线 §8-1)。
 */
defineProps({
  tones: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>
