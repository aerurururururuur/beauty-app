<template>
  <img
    v-if="persona.photoUrl"
    class="persona-card__avatar"
    :src="persona.photoUrl"
    :alt="persona.name"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
  <span
    v-else
    class="persona-card__avatar persona-card__avatar--initial"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: persona.skinToneHex || 'var(--color-pink-soft)',
    }"
    >{{ (persona.name || '人').slice(0, 1) }}</span
  >
</template>

<script setup>
/**
 * 人设头像:有照片用照片,没有则用**名字首字 + 肤色档底色**合成一个方块脸。
 *
 * ★ 那个底色是 `skinToneHex`(真人肤色档),**不是装饰色**——别为了好看换成品牌粉,
 *   人设卡上这张脸靠它区分不同肤色档。
 * ★ `photoUrl` 由 `api/personas.js` 的 `decoratePersona` 拼好(服务端那份要带上
 *   `API_BASE` 与 `?userId=`),**本组件直接用,不自己拼**——它是纯展示组件。
 * ★ 类名固定 `persona-card__avatar`:它同时被首页预览卡(64)、人设卡(72)、
 *   信息收集页的人设条(44)复用,尺寸由 `size` 内联给,样式表里只管形状。
 */
defineProps({
  persona: { type: Object, required: true },
  size: { type: Number, default: 72 },
})
</script>
