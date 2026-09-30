<template>
  <header class="topbar">
    <h1 class="topbar__title">我的</h1>
    <div class="topbar__spacer"></div>
    <button class="icon-btn" aria-label="通知">
      <Icon name="bell" :size="22" color="currentColor" />
    </button>
    <button class="icon-btn" aria-label="设置">
      <Icon name="settings" :size="22" color="currentColor" />
    </button>
    <div class="ph" style="width: 38px; height: 38px; border-radius: 999px; font-size: 10px">头像</div>
  </header>

  <main class="content" style="gap: 20px">
    <div style="display: flex; flex-direction: column; gap: 20px">
      <!-- 个人信息 -->
      <div class="profile-card">
        <div class="profile-card__avatar ph" style="width: 96px; height: 96px; border-radius: 999px">用户头像</div>
        <div class="profile-card__info">
          <h2 class="profile-card__name">{{ profile.nickname }}</h2>
          <span class="profile-card__id">{{ profile.taozhuangId }}</span>
          <span class="profile-card__bio">{{ profile.bio }}</span>
        </div>
        <div class="profile-card__spacer"></div>
        <div class="stats-row">
          <div class="stat">
            <span class="stat__value">{{ profile.stats.works }}</span>
            <span class="stat__label">妆面作品</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ profile.stats.followers }}</span>
            <span class="stat__label">粉丝</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ profile.stats.liked }}</span>
            <span class="stat__label">获赞</span>
          </div>
        </div>
        <button class="btn btn--soft">编辑资料</button>
      </div>

      <!-- AI 档案 -->
      <div class="ai-card">
        <div class="ai-card__texts">
          <h3 class="ai-card__title">我的 AI 妆容档案</h3>
          <div class="tag-row">
            <span v-for="t in profile.aiProfile.tags" :key="t.label" class="tag">{{ t.label }}</span>
          </div>
        </div>
        <div class="ai-card__spacer"></div>
        <button class="btn btn--brand">重新测一测</button>
      </div>

      <!-- 快捷入口 -->
      <div class="quick-entries">
        <RouterLink class="quick-entry" to="/vanity">
          <Icon name="palette" :size="28" color="var(--color-rose)" />
          <span>数字美妆台</span>
        </RouterLink>
        <RouterLink class="quick-entry" to="/personas">
          <Icon name="faces" :size="28" color="var(--color-rose)" />
          <span>人设库</span>
        </RouterLink>
        <RouterLink class="quick-entry" to="/create">
          <Icon name="sparkle" :size="28" color="var(--color-rose)" />
          <span>开始设计</span>
        </RouterLink>
        <RouterLink class="quick-entry" to="/inspiration">
          <Icon name="clock" :size="28" color="var(--color-rose)" />
          <span>灵感广场</span>
        </RouterLink>
      </div>
    </div>

    <!-- 内容切换:作品 / 收藏 / 赞过(用户自己的内容,唯一入口) -->
    <div class="content-tabs">
      <button v-for="t in TABS" :key="t.id" class="content-tab" @click="tab = t.id">
        <span class="content-tab__label" :class="{ 'content-tab__label--idle': tab !== t.id }">
          {{ t.name }} {{ counts[t.id] }}
        </span>
        <span class="content-tab__underline" :style="{ visibility: tab === t.id ? 'visible' : 'hidden' }"></span>
      </button>
    </div>

    <!-- 内容网格。三个 Tab 的空态文案各不相同,别统一成「暂无内容」 -->
    <div v-if="!items.length" class="empty">{{ emptyText }}</div>
    <div v-else class="card-grid">
      <article v-for="it in items" :key="it.id" class="look-card">
        <div class="look-card__cover ph" :style="{ height: `${it.coverHeight || 250}px` }">妆容封面</div>
        <h3 class="look-card__title">{{ it.title }}</h3>
        <span class="look-card__count">{{ it.likes }} 赞</span>
      </article>
    </div>

    <!-- 退出登录:源站没有这一项(它没有登录态),这是搬过来时后加的 -->
    <div class="mine-foot">
      <button class="btn btn--soft" @click="onLogout">退出登录</button>
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { getMyWorks, getProfile, WORKS_EMPTY } from '@/api/home'

/**
 * 我的。
 *
 * ★ 这一屏**只有昵称是真的**:来自登录后 `stores/user.js` 里的 nickname
 *   (真后端登录时回的)。桃妆号是按 id 推出来的、简介和三项统计、AI 档案标签
 *   都是 `api/home.js` 里的演示值——别照着这里的数字写任何真实统计。
 *
 * ★ 内容 Tab 的**计数与档案卡取同一份 profile 对象**:源站特意如此,
 *   免得页面上两处数字对不上(一处改了另一处没改,静默不一致)。
 *
 * ★ 退出登录:源站没有登录态,这是搬过来时**新加的一项**——
 *   不然后端登录进来的账号在界面上没有出口(只能清浏览器数据)。
 *   转发在 stores/user.js:清 id/昵称 + 重置美妆台与人设库 + 清 localStorage。
 */
const router = useRouter()
const user = useUserStore()

const profile = getProfile({ userId: user.id, nickname: user.nickname })

const TABS = [
  { id: 'works', name: '作品' },
  { id: 'collections', name: '收藏' },
  { id: 'liked', name: '赞过' },
]
const tab = ref('works')

/** Tab 上的计数:作品 = 作品数,收藏 = 收藏数,赞过 = 获赞数(与档案卡的「获赞」同源)。 */
const counts = {
  works: profile.stats.works,
  collections: profile.stats.collections,
  liked: profile.stats.liked,
}

const items = computed(() => getMyWorks({ tab: tab.value }))
const emptyText = computed(() => WORKS_EMPTY[tab.value] || WORKS_EMPTY.works)

function onLogout() {
  user.logout()
  router.replace('/login')
}
</script>

<style scoped>
/* 页内私有:桃妆的样式表里没有这一块(源站没有登录态、也就没有出口按钮)。 */
.mine-foot {
  display: flex;
  justify-content: center;
  padding: 8px 0 24px;
}
</style>
