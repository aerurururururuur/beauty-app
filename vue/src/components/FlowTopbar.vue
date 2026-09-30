<template>
  <header class="topbar">
    <RouterLink v-if="backTo" class="back-link" :to="backTo">
      <Icon name="arrowLeft" :size="18" color="currentColor" />
      <span>返回</span>
    </RouterLink>
    <span v-if="backTo" class="topbar__divider"></span>
    <strong class="topbar__title">{{ title }}</strong>
    <div class="topbar__spacer"></div>
    <div v-if="steps.length" class="steps">
      <span
        v-for="(s, i) in steps"
        :key="s"
        class="steps__item"
        :class="{ 'steps__item--active': i + 1 === activeStep }"
        >{{ s }}</span
      >
    </div>
  </header>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import Icon from '@/components/Icon.vue'

/**
 * 第二层(动线页)的顶栏:返回 + 页面名 + 右侧步骤指示器。
 *
 * ★ **步骤条每一步都由调用方给**,因为各页的步数本来就不一样:
 *   选场景 4 步、填信息 3 步、生成方案 4 步。别在这里写死一套。
 * ★ `activeStep` 是 **1 起算**的序号(0 = 一个都不高亮)。
 */
defineProps({
  /** 返回目标的路由路径。空 = 不显示返回(如动线第一屏)。 */
  backTo: { type: String, default: '' },
  title: { type: String, default: '' },
  /** 形如 ['1 选场景', '2 选形象'] —— 文案整条给,不在组件里拼「第 N 步」。 */
  steps: { type: Array, default: () => [] },
  activeStep: { type: Number, default: 0 },
})
</script>
