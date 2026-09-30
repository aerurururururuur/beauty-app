<template>
  <aside class="sidebar">
    <RouterLink class="sidebar__brand" to="/">
      <BrandMark :size="32" />
      <span>
        <div class="sidebar__brand-name">桃妆</div>
        <div class="sidebar__brand-en">TAOZHUANG</div>
      </span>
    </RouterLink>

    <nav class="sidebar__nav">
      <RouterLink
        v-for="it in NAV"
        :key="it.key"
        class="nav-item"
        :class="{ 'nav-item--active': it.key === active }"
        :to="it.to"
      >
        <Icon :name="it.icon" :size="20" color="var(--color-icon)" />
        <span>{{ it.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar__spacer"></div>

    <RouterLink class="sidebar__cta" to="/create">
      <Icon name="wand" :size="20" color="var(--color-white)" />
      <span>开始设计</span>
    </RouterLink>

    <div class="sidebar__quick">
      <RouterLink
        class="quick-item"
        :class="{ 'quick-item--active': active === '' || active === 'vanity' }"
        to="/vanity"
      >
        <Icon name="palette" :size="16" color="currentColor" />
        <span>数字美妆台</span>
      </RouterLink>
      <RouterLink
        class="quick-item"
        :class="{ 'quick-item--active': active === 'personas' }"
        to="/personas"
      >
        <Icon name="faces" :size="16" color="currentColor" />
        <span>人设库</span>
      </RouterLink>
    </div>

    <RouterLink class="sidebar__user" to="/mine">
      <span class="avatar" style="width: 32px; height: 32px"></span>
      <span class="sidebar__user-name">{{ nickname || '未登录' }}</span>
      <Icon name="more" :size="16" color="var(--color-text-disabled)" />
    </RouterLink>
  </aside>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import Icon from '@/components/Icon.vue'

/**
 * 全站侧栏(登录页不挂它)。
 *
 * ★ 它是**纯展示**:账号名由 `nickname` 传进来,不高亮谁由 `active` 决定。
 *   组件里不 import store、不发请求(分层约束 §3.4)。
 *
 * ★ `active` 取值与源站一致:
 *   'home' / 'inspiration' / 'mine' → 主导航对应项亮;
 *   'personas'                     → 快捷区「人设库」亮;
 *   '' 或 'vanity'                 → 快捷区「数字美妆台」亮。
 *   ★ 注意 `''`(create / form / result 三个动线页)也会点亮「数字美妆台」——
 *     这是源站就这么定的(见 ui.js 的 quickActive),照搬,不是这里写错了。
 */
defineProps({
  active: { type: String, default: '' },
  nickname: { type: String, default: '' },
})

const NAV = [
  { key: 'home', label: '首页', icon: 'home', to: '/' },
  { key: 'inspiration', label: '灵感', icon: 'bulb', to: '/inspiration' },
  { key: 'mine', label: '我的', icon: 'user', to: '/mine' },
]
</script>
