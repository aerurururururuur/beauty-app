<template>
  <svg
    v-if="def"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${def.vb} ${def.vb}`"
    fill="none"
    :style="{ color }"
    xmlns="http://www.w3.org/2000/svg"
    v-html="body"
  />
</template>

<script setup>
/**
 * 图标:一律内联 SVG,不用图标字体、不用 emoji。
 *
 * ★ `d` 里写的是占位词 `COLOR`,渲染时换成 `currentColor`,再由根上的 `style.color` 驱动。
 *   不直接写 `fill="var(--x)"`——**SVG 的 fill/stroke 属性里吃不到 CSS 变量**,
 *   写进去是不生效的(值非法,浏览器直接忽略),图形会变成默认黑。要 CSS 变量就走 style。
 *
 * ★ 每个图标的 viewBox 不同(12/14/16/18/20/24/28/40),所以 `vb` 必须逐个标对:
 *   写错不会报错,只会静默放大或缩小。加图标时从设计稿抄原样。
 *
 * ★ **取一个不存在的 `name` 不报错,静默渲染空白**——改 `name` 时回下面这张表核一眼。
 */
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  /** 默认与全站图标色一致;要跟随外部 CSS 颜色就传 'currentColor'。 */
  color: { type: String, default: 'var(--color-icon)' },
})

const ICONS = {
  /* —— 侧栏与顶栏 —— */
  home: { vb: 20, d: '<path d="M3.4 9.4L10 3.6L16.6 9.4V16.4C16.6 16.82 16.28 17.1 15.9 17.1H4.1C3.72 17.1 3.4 16.82 3.4 16.4V9.4Z" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.1 17.1V12.7H11.9V17.1" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/>' },
  bulb: { vb: 20, d: '<path d="M10 2.9C7.51 2.9 5.5 4.91 5.5 7.4C5.5 8.74 6.22 9.94 7.32 10.68V12.9H12.68V10.68C13.78 9.94 14.5 8.74 14.5 7.4C14.5 4.91 12.49 2.9 10 2.9Z" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.4 15.1H11.6" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/><path d="M8.9 17.2H11.1" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' },
  user: { vb: 20, d: '<circle cx="10" cy="6.6" r="3.3" stroke="COLOR" stroke-width="1.6"/><path d="M4.2 17C4.2 13.9 6.8 11.6 10 11.6C13.2 11.6 15.8 13.9 15.8 17" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' },
  wand: { vb: 20, d: '<path d="M4 16L12.5 7.5" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/><path d="M13.5 3.5L14.8 5.8L17 7L14.8 8.2L13.5 10.5L12.2 8.2L10 7L12.2 5.8L13.5 3.5Z" fill="COLOR"/><circle cx="5.5" cy="4.5" r="1.3" fill="COLOR"/><circle cx="15.5" cy="14.5" r="1" fill="COLOR"/>' },
  search: { vb: 18, d: '<circle cx="8" cy="8" r="5.2" stroke="COLOR" stroke-width="1.5"/><path d="M12 12l3.4 3.4" stroke="COLOR" stroke-width="1.5" stroke-linecap="round"/>' },
  bell: { vb: 20, d: '<path d="M10 3.2c-2.2 0-3.6 1.4-3.6 3.4 0 2.4-.7 3.4-1.4 4.2-.4.5-.6.8-.6 1.3 0 .7.6 1.3 1.3 1.3h9.4c.7 0 1.3-.6 1.3-1.3 0-.5-.2-.8-.6-1.3-.7-.8-1.4-1.8-1.4-4.2 0-2-1.4-3.4-3.6-3.4Z" stroke="COLOR" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.3 15.2a1.8 1.8 0 0 0 3.4 0" stroke="COLOR" stroke-width="1.5" stroke-linecap="round"/>' },
  settings: { vb: 20, d: '<circle cx="10" cy="10" r="2.6" stroke="COLOR" stroke-width="1.5"/><path d="M10 2.6v2M10 15.4v2M2.6 10h2M15.4 10h2M4.8 4.8l1.4 1.4M13.8 13.8l1.4 1.4M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4" stroke="COLOR" stroke-width="1.5" stroke-linecap="round"/>' },
  filter: { vb: 20, d: '<path d="M3 6h14M3 14h14" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/><circle cx="7.5" cy="6" r="2" stroke="COLOR" stroke-width="1.6"/><circle cx="12.5" cy="14" r="2" stroke="COLOR" stroke-width="1.6"/>' },

  /* —— 通用小图标 —— */
  camera: { vb: 16, d: '<rect x="1.5" y="4.5" width="13" height="9" rx="2.5" stroke="COLOR" stroke-width="1.4"/><path d="M6 4.5L6.6 3h2.8L10 4.5" stroke="COLOR" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="9" r="2.2" stroke="COLOR" stroke-width="1.4"/>' },
  upload: { vb: 16, d: '<path d="M8 11.5V3" stroke="COLOR" stroke-width="1.4" stroke-linecap="round"/><path d="M5 6L8 3L11 6" stroke="COLOR" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 11.5V13h11v-1.5" stroke="COLOR" stroke-width="1.4" stroke-linecap="round"/>' },
  heart: { vb: 14, d: '<path d="M7 12.2S1.5 8.9 1.5 5.4C1.5 3.6 2.9 2.4 4.4 2.4C5.5 2.4 6.5 3 7 3.9C7.5 3 8.5 2.4 9.6 2.4C11.1 2.4 12.5 3.6 12.5 5.4C12.5 8.9 7 12.2 7 12.2Z" stroke="COLOR" stroke-width="1.2" stroke-linejoin="round"/>' },
  more: { vb: 16, d: '<circle cx="4" cy="8" r="1.2" fill="COLOR"/><circle cx="8" cy="8" r="1.2" fill="COLOR"/><circle cx="12" cy="8" r="1.2" fill="COLOR"/>' },
  bookmark: { vb: 20, d: '<path d="M5 4.6C5 3.72 5.72 3 6.6 3H13.4C14.28 3 15 3.72 15 4.6V16.7L10 13.3L5 16.7V4.6Z" stroke="COLOR" stroke-width="1.5" stroke-linejoin="round"/>' },
  comment: { vb: 20, d: '<rect x="2.6" y="4" width="14.8" height="10.4" rx="3" stroke="COLOR" stroke-width="1.5"/><path d="M6.6 14.4V17.5L10.2 14.4" stroke="COLOR" stroke-width="1.5" stroke-linejoin="round"/>' },
  lock: { vb: 20, d: '<rect x="5" y="9" width="10" height="8" rx="2" stroke="COLOR" stroke-width="1.6"/><path d="M7.5 9V7.2C7.5 5.8 8.6 4.7 10 4.7C11.4 4.7 12.5 5.8 12.5 7.2V9" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' },
  eye: { vb: 20, d: '<path d="M2.5 10C2.5 10 5 5.5 10 5.5C15 5.5 17.5 10 17.5 10C17.5 10 15 14.5 10 14.5C5 14.5 2.5 10 2.5 10Z" stroke="COLOR" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.2" stroke="COLOR" stroke-width="1.6"/>' },
  check: { vb: 16, d: '<rect x="1" y="1" width="14" height="14" rx="4" fill="#e7a6ac"/><path d="M4.6 8.2L7 10.5L11.4 5.8" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  wechat: { vb: 24, d: '<path d="M9.5 4C5.9 4 3 6.5 3 9.6c0 1.8 1 3.4 2.6 4.4L5 16.5l2.6-1.3c.6.2 1.3.3 1.9.3" stroke="COLOR" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 14.4c0-2.6-2.4-4.7-5.3-4.7s-5.2 2.1-5.2 4.7c0 2.6 2.3 4.7 5.2 4.7.7 0 1.4-.1 2-.4l2.3 1.1-.5-1.8c1.1-.8 1.5-2 1.5-3.6Z" stroke="COLOR" stroke-width="1.5" stroke-linejoin="round"/>' },
  phone: { vb: 24, d: '<rect x="7" y="3" width="10" height="18" rx="3" stroke="COLOR" stroke-width="1.5"/><path d="M11 18h2" stroke="COLOR" stroke-width="1.5" stroke-linecap="round"/>' },
  plus: { vb: 20, d: '<path d="M10 4v12M4 10h12" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' },
  image: { vb: 20, d: '<rect x="2.5" y="4" width="15" height="12" rx="2.5" stroke="COLOR" stroke-width="1.5"/><circle cx="7.5" cy="9" r="1.6" stroke="COLOR" stroke-width="1.4"/><path d="M3.5 15l4.2-4.2 3.3 3.3 3-2.6 2.5 2.2" stroke="COLOR" stroke-width="1.4" stroke-linejoin="round"/>' },
  arrowLeft: { vb: 18, d: '<path d="M11 4L6 9l5 5" stroke="COLOR" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  arrowDown: { vb: 12, d: '<path d="M2.5 4.5L6 8l3.5-3.5" stroke="COLOR" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' },
  arrowRight: { vb: 12, d: '<path d="M4.5 2.5L8 6l-3.5 3.5" stroke="COLOR" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' },

  /* —— 40 号大图标(空态 / 场景卡 / 上传卡) —— */
  camera40: { vb: 40, d: '<rect x="5" y="12" width="30" height="21" rx="5" stroke="COLOR" stroke-width="2"/><path d="M15 12l1.6-4h6.8L25 12" stroke="COLOR" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="22" r="5.5" stroke="COLOR" stroke-width="2"/>' },
  upload40: { vb: 40, d: '<path d="M20 27V11" stroke="COLOR" stroke-width="2" stroke-linecap="round"/><path d="M13 18l7-7 7 7" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 28v5h24v-5" stroke="COLOR" stroke-width="2" stroke-linecap="round"/>' },
  palette40: { vb: 40, d: '<circle cx="20" cy="20" r="14" stroke="COLOR" stroke-width="2"/><circle cx="20" cy="14" r="2.6" fill="COLOR"/><circle cx="26" cy="20" r="2.6" fill="COLOR"/><circle cx="20" cy="26" r="2.6" fill="COLOR"/><circle cx="14" cy="20" r="2.6" fill="COLOR"/>' },

  /* —— 场景图标 —— */
  sparkle: { vb: 40, d: '<path d="M20 5l2.6 6.4L29 14l-6.4 2.6L20 23l-2.6-6.4L11 14l6.4-2.6L20 5Z" fill="COLOR"/><circle cx="28" cy="27" r="3" fill="COLOR" opacity="0.7"/><circle cx="12" cy="29" r="2.2" fill="COLOR" opacity="0.55"/><circle cx="20" cy="33" r="2" fill="COLOR" opacity="0.45"/>' },
  heart40: { vb: 40, d: '<path d="M20 33S7 24.6 7 15.6C7 10.6 11.2 7.2 15.4 7.2C18 7.2 19.6 8.6 20 10.2C20.4 8.6 22 7.2 24.6 7.2C28.8 7.2 33 10.6 33 15.6C33 24.6 20 33 20 33Z" stroke="COLOR" stroke-width="2.2" stroke-linejoin="round"/>' },
  brief: { vb: 40, d: '<rect x="5" y="13" width="30" height="20" rx="3" stroke="COLOR" stroke-width="2"/><path d="M15 13v-3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" stroke="COLOR" stroke-width="2" stroke-linejoin="round"/><path d="M5 21h30" stroke="COLOR" stroke-width="2"/><circle cx="20" cy="26" r="1.8" fill="COLOR"/>' },
  plane: { vb: 40, d: '<path d="M6 21.5l28-9.5-6.5 21-6-7-7.5 6.5 1.5-7-9.5-4Z" stroke="COLOR" stroke-width="2" stroke-linejoin="round"/>' },
  moon: { vb: 40, d: '<path d="M25 7a13 13 0 1 0 8 24A15 15 0 0 1 25 7Z" stroke="COLOR" stroke-width="2" stroke-linejoin="round"/><circle cx="29" cy="13" r="1.8" fill="COLOR"/><circle cx="13" cy="28" r="1.6" fill="COLOR" opacity="0.6"/><circle cx="18" cy="33" r="1.3" fill="COLOR" opacity="0.45"/>' },

  /* —— 侧栏快捷区 —— */
  palette: { vb: 28, d: '<circle cx="14" cy="14" r="9.5" stroke="COLOR" stroke-width="1.8"/><circle cx="14" cy="9.8" r="1.9" fill="COLOR"/><circle cx="18.2" cy="14" r="1.9" fill="COLOR"/><circle cx="14" cy="18.2" r="1.9" fill="COLOR"/><circle cx="9.8" cy="14" r="1.9" fill="COLOR"/>' },
  faces: { vb: 20, d: '<circle cx="7" cy="7" r="3" stroke="COLOR" stroke-width="1.6"/><path d="M2.6 16.6C2.6 13.1 4.5 11 7 11C9.5 11 11.4 13.1 11.4 16.6" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/><circle cx="14.6" cy="8.6" r="2.3" stroke="COLOR" stroke-width="1.6"/><path d="M11.6 17C11.6 14.4 13 13.1 15.2 13.1C17.4 13.1 18.8 14.4 18.8 17" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>' },
  clock: { vb: 28, d: '<circle cx="14" cy="14" r="9.5" stroke="COLOR" stroke-width="1.8"/><path d="M14 8.5V14l4 2.4" stroke="COLOR" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
}

const def = computed(() => ICONS[props.name] || null)
const body = computed(() => (def.value ? def.value.d.split('COLOR').join('currentColor') : ''))
</script>
