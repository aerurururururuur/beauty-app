<template>
  <div class="empty">{{ text }}</div>
</template>

<script setup>
/** 空状态。**文案由调用方给**——不同列表的空态说法不一样,不要在这里写一句通用兜底。 */
defineProps({
  text: { type: String, default: '暂无内容' },
})
</script>
