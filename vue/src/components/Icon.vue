<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 }
})

const paths = {
  arrowLeft: '<path d="M15 6l-6 6 6 6"/>',
  arrowRight: '<path d="M9 6l6 6-6 6"/>',
  camera: '<path d="M5 8h3.2l1.5-2.2h4.6L16 8h3a1.4 1.4 0 0 1 1.4 1.4V18a1.4 1.4 0 0 1-1.4 1.4H5A1.4 1.4 0 0 1 3.6 18V9.4A1.4 1.4 0 0 1 5 8z"/><circle cx="12" cy="13.4" r="3.2"/>',
  upload: '<path d="M12 15.5V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15.5v3.9A1.6 1.6 0 0 0 5.6 21h12.8a1.6 1.6 0 0 0 1.6-1.6v-3.9"/>',
  check: '<path d="M4.5 12.8l4.6 4.6L19.5 7.5"/>',
  swap: '<path d="M3.5 8h15.2l-3.6-3.6M20.5 16H5.3l3.6 3.6"/>',
  sparkle: '<path d="M12 3.5l2 5.2 5.2 2-5.2 2-2 5.2-2-5.2-5.2-2 5.2-2 2-5.2z"/>'
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="paths[name] || ''"
  />
</template>
