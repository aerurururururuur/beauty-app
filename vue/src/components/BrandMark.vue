<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    :style="{ color }"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="24" cy="12" r="8" fill="currentColor" />
    <circle cx="36" cy="22" r="8" fill="currentColor" />
    <circle cx="31" cy="36" r="8" fill="currentColor" />
    <circle cx="17" cy="36" r="8" fill="currentColor" />
    <circle cx="12" cy="22" r="8" fill="currentColor" />
    <circle cx="24" cy="24" r="5" :style="{ fill: center }" />
  </svg>
</template>

<script setup>
/**
 * 品牌标识:五瓣桃花。
 *
 * ★ 花瓣走 `currentColor`(由根上的 `style.color` 驱动),中心点走自己的 `style.fill`。
 *   别改成 `fill="var(--color-rose)"` 这种**属性**写法——SVG 的 fill/stroke 属性里
 *   吃不到 CSS 变量,值非法会被整个忽略,图形会变成默认黑。要变量只能用 style。
 */
defineProps({
  size: { type: [Number, String], default: 32 },
  /** 花瓣色。登录页那版是白花瓣,传 '#ffffff'。 */
  color: { type: String, default: 'var(--color-peach)' },
  center: { type: String, default: 'var(--color-rose)' },
})
</script>
