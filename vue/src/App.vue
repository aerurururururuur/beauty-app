<template>
  <div v-if="isLogin">
    <router-view />
  </div>

  <div v-else class="app">
    <AppSidebar :active="active" :nickname="user.nickname" />
    <div class="app__main">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const user = useUserStore()

/**
 * 登录页是**另一套骨架**:它整屏都是 `.auth`(左品牌面板 + 右表单),没有侧栏,
 * 也不在 `.app` 这个 1440 容器里。所以外壳按路由分叉,而不是硬套一个统一布局。
 */
const isLogin = computed(() => route.name === 'login')

/**
 * 侧栏高亮项。取值写在路由的 `meta.nav` 上(见 router/index.js),不在页面里各判一次——
 * 页面文件是懒加载的,侧栏在页面组件加载前就要决定高亮谁。
 */
const active = computed(() => route.meta.nav || '')
</script>
