<template>
  <header class="topbar">
    <label class="searchbox" style="width: 560px">
      <Icon name="search" :size="18" color="currentColor" />
      <input class="searchbox__input" type="search" placeholder="搜妆容、色号、博主" />
    </label>
    <button class="icon-btn" aria-label="筛选">
      <Icon name="filter" :size="20" color="currentColor" />
    </button>
    <div class="topbar__spacer"></div>
    <button class="icon-btn" aria-label="通知">
      <Icon name="bell" :size="22" color="currentColor" />
    </button>
    <div class="ph" style="width: 38px; height: 38px; border-radius: 999px; font-size: 10px">头像</div>
  </header>

  <main class="content" style="gap: 20px">
    <!-- 可平移分类。第一项即默认选中项,页面不写死是哪一个 -->
    <div class="chip-row">
      <button
        v-for="c in categories"
        :key="c.id"
        class="chip"
        :class="{ 'chip--active': c.id === category }"
        @click="category = c.id"
      >
        {{ c.label }}
      </button>
    </div>

    <!-- 结果数与排序 -->
    <div class="sort-row">
      <span class="sort-row__count">为你找到 {{ result.total }} 个作品</span>
      <div class="sort-tabs">
        <button class="sort-tab" :class="{ 'sort-tab--active': sort === 'hot' }" @click="sort = 'hot'">最热</button>
        <button class="sort-tab" :class="{ 'sort-tab--active': sort === 'new' }" @click="sort = 'new'">最新</button>
      </div>
    </div>

    <!-- 瀑布流 -->
    <div v-if="isEmpty" class="empty">这个分类下还没有作品</div>
    <div v-else class="masonry">
      <div v-for="(col, i) in columns" :key="i" class="masonry__col">
        <LookCard v-for="it in col" :key="it.id" :item="it" :height="it.coverHeight || 260" />
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import LookCard from '@/components/LookCard.vue'
import { getCategories, getPosts } from '@/api/home'

/**
 * 灵感广场。
 *
 * ★ 分类与作品都是 `api/home.js` 里的策展演示内容(没有真社区)。见那个文件头。
 *
 * ★ 瀑布流的错落**来自数据的 `coverHeight`**,不是 CSS 随机或 nth-child——
 *   所以换数据就换排布,别在样式里给卡片写死高度。
 * ★ 分栏是 `i % 4`:换了一屏还得按同一个下标轮流放,四列才不会长短腿。
 */
const categories = getCategories()
const category = ref(categories[0].id)
const sort = ref('hot')

const result = computed(() => getPosts({ category: category.value, sort: sort.value }))

/** 四列瀑布流。空分类时得到四个空数组,模板里的空态分支负责兜底。 */
const columns = computed(() => {
  const buckets = [[], [], [], []]
  result.value.items.forEach((it, i) => buckets[i % 4].push(it))
  return buckets
})

const isEmpty = computed(() => result.value.items.length === 0)
</script>
