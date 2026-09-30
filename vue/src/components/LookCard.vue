<template>
  <article class="look-card">
    <img
      v-if="item.coverUrl"
      class="look-card__cover"
      :src="item.coverUrl"
      :alt="item.title"
      :style="{ height: `${height}px`, objectFit: 'cover' }"
    />
    <div v-else class="look-card__cover ph" :style="{ height: `${height}px` }">{{ label }}</div>

    <h3 class="look-card__title">{{ item.title }}</h3>
    <div class="look-card__meta">
      <span class="avatar" :style="{ background: item.author?.avatarColor || 'var(--color-peach)' }"></span>
      <span class="look-card__author">{{ item.author?.name || '' }}</span>
      <Icon name="heart" :size="14" color="var(--color-text-disabled)" />
      <span class="look-card__count">{{ item.likes }}</span>
    </div>
  </article>
</template>

<script setup>
import Icon from '@/components/Icon.vue'

/**
 * 作品卡(首页「为你推荐」/ 灵感瀑布流 / 我的作品共用)。
 *
 * ★ `height` 是**数据不是样式**:瀑布流的错落靠每张卡自己的封面高度产生,
 *   所以它随 item 传进来(灵感页用 `item.coverHeight`),不在这里写死一个值。
 * ★ `coverUrl` 为空时渲染 `.ph` 占位块,不是破图。
 */
defineProps({
  item: { type: Object, required: true },
  height: { type: Number, default: 230 },
  label: { type: String, default: '妆容封面' },
})
</script>
