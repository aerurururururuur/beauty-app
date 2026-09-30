<template>
  <FlowTopbar
    back-to="/"
    title="开始设计"
    :steps="['1 选场景', '2 选形象', '3 填信息', '4 生成方案']"
    :active-step="1"
  />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">今天想要什么样的妆容？</h1>
      <p class="flow-head__sub">选一个场景，我们会据此调整色调、质感与妆感强度</p>
    </div>

    <div class="scene-row">
      <RouterLink
        v-for="s in design.scenes"
        :key="s.id"
        class="scene-card"
        :to="{ path: '/personas', query: { scene: s.id, pick: '1' } }"
      >
        <span class="scene-card__icon">
          <Icon :name="s.icon" :size="40" color="var(--color-rose)" />
        </span>
        <span class="scene-card__body">
          <span class="scene-card__name">{{ s.name }}</span>
          <span class="scene-card__tagline">{{ s.tagline }}</span>
          <span class="scene-card__desc">{{ s.desc }}</span>
        </span>
        <span class="scene-card__enter">
          选择 <Icon name="arrowRight" :size="12" color="var(--color-text-disabled)" />
        </span>
      </RouterLink>
    </div>

    <p class="flow-foot">
      不确定选哪个？也可以
      <RouterLink :to="{ path: '/form', query: { scene: 'fantasy' } }">直接描述你想要的风格</RouterLink>
    </p>
  </main>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { useDesignStore } from '@/stores/design'

/**
 * 开始设计 · 第 1 步:选场景。
 *
 * ★ 场景清单来自 `api/design.js`(本地知识库,后端没有这条链的端点)。
 *   每个场景卡上的图标键是数据自带的 `icon`,不是这个页面里按 id 写死的对照表——
 *   加一个场景时只改数据,这里不动。
 *
 * ★ 选完场景**不在这里填信息**:先跳到人设库选一张脸(`?scene=&pick=1`),
 *   由人设库把人带进 `/form`。这是源站的动线,不是绕路——妆容要按「那张脸」来配。
 */
const design = useDesignStore()
</script>
