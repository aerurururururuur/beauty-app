<template>
  <header class="topbar">
    <label class="searchbox">
      <Icon name="search" :size="18" color="currentColor" />
      <input class="searchbox__input" type="search" placeholder="搜妆容、色号、博主" />
    </label>
    <div class="topbar__spacer"></div>
    <button class="icon-btn" aria-label="通知">
      <Icon name="bell" :size="22" color="currentColor" />
    </button>
    <div class="ph" style="width: 38px; height: 38px; border-radius: 999px; font-size: 10px">头像</div>
  </header>

  <main class="content">
    <!-- 潮流轮播。★ 圆点是**指示器**:源站 5 张 banner 只展示第一张,
         圆点既不可点也不轮播(this file 的 port notes 列了这一条)。 -->
    <section v-if="banner" class="hero">
      <div class="hero__cover ph" style="height: 100%">秋冬主推妆容</div>
      <div class="hero__scrim"></div>
      <div class="hero__text">
        <span class="hero__tag">{{ banner.tag }}</span>
        <h2 class="hero__title">{{ banner.title }}</h2>
        <p class="hero__sub">{{ banner.subtitle }}</p>
      </div>
      <div class="hero__dots">
        <span
          v-for="(b, i) in banners"
          :key="b.id"
          class="hero__dot"
          :class="{ 'hero__dot--active': i === 0 }"
        ></span>
      </div>
    </section>

    <!-- 主 CTA -->
    <section class="primary-cta">
      <div class="primary-cta__texts">
        <h2 class="primary-cta__title">开始设计</h2>
        <p class="primary-cta__desc">上传一张照片 → AI 分析面部特征与肤色 → 生成专属妆容方案</p>
        <RouterLink class="primary-cta__btn" to="/create">立即开始</RouterLink>
      </div>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 92L70 52" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
        <path d="M78 26l9 16 17 8-17 8-9 16-9-16-17-8 17-8 9-16Z" fill="#ffffff" />
        <circle cx="34" cy="30" r="7" fill="#ffffff" />
        <circle cx="92" cy="86" r="5" fill="#ffffff" />
      </svg>
    </section>

    <!-- 功能入口:数字美妆台 + 人设库(并列) -->
    <section class="card-row">
      <RouterLink class="entry-card" to="/vanity">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="14" stroke="#e7a6ac" stroke-width="2" />
          <circle cx="20" cy="14" r="2.6" fill="#e7a6ac" />
          <circle cx="26" cy="20" r="2.6" fill="#a1c2b1" />
          <circle cx="20" cy="26" r="2.6" fill="#d48d95" />
          <circle cx="14" cy="20" r="2.6" fill="#b6d5c6" />
        </svg>
        <div>
          <h3 class="entry-card__title">数字美妆台</h3>
          <p class="entry-card__desc">在线试色 · 30+ 品牌色号</p>
        </div>
      </RouterLink>
      <RouterLink class="entry-card" to="/personas">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="15" r="7" stroke="#e7a6ac" stroke-width="2" />
          <path d="M8 33c0-6.6 5.4-11 12-11s12 4.4 12 11" stroke="#e7a6ac" stroke-width="2" stroke-linecap="round" />
        </svg>
        <div>
          <h3 class="entry-card__title">人设库</h3>
          <p class="entry-card__desc">建一份脸模 · 专属妆容方案</p>
        </div>
      </RouterLink>
    </section>

    <!-- 我的脸模 · 人设库(入口只在首页,不进侧栏主导航) -->
    <section class="section">
      <header class="section__header">
        <h2 class="section__title">我的脸模 · 人设库</h2>
        <RouterLink class="section__more" to="/personas">进入人设库</RouterLink>
      </header>
      <div class="card-row card-row--scroll">
        <RouterLink
          v-for="p in personas.personas"
          :key="p.id"
          class="persona-preview"
          :to="`/personas/${p.id}`"
        >
          <PersonaAvatar :persona="p" :size="64" />
          <span class="persona-preview__body">
            <span class="persona-preview__name">{{ p.name }}</span>
            <span class="persona-preview__meta">{{ p.relationName }} · {{ p.skinToneName }}</span>
          </span>
        </RouterLink>
        <RouterLink class="persona-preview persona-preview--add" to="/personas/new">
          <span class="persona-preview__plus"><Icon name="plus" :size="22" color="var(--color-rose)" /></span>
          <span class="persona-preview__body">
            <span class="persona-preview__name">开始创作新形象</span>
            <span class="persona-preview__meta">拍一张或传一张照片</span>
          </span>
        </RouterLink>
      </div>
    </section>

    <!-- 为你推荐 -->
    <section class="section">
      <header class="section__header">
        <h2 class="section__title">为你推荐</h2>
        <a class="section__more" href="#">更多</a>
      </header>
      <div class="card-row">
        <LookCard v-for="it in recommend" :key="it.id" :item="it" :height="230" />
      </div>
    </section>

    <!-- 偷偷变美 -->
    <section class="section">
      <header class="section__header">
        <h2 class="section__title">偷偷变美的方式，都在这里！</h2>
        <a class="section__more" href="#">全部</a>
      </header>
      <div class="card-row">
        <article v-for="t in tips" :key="t.id" class="tip-card">
          <h3 class="tip-card__title">{{ t.title }}</h3>
          <button class="btn btn--soft tip-card__btn">{{ t.actionLabel }}</button>
        </article>
      </div>
    </section>

    <!-- 近期热点 -->
    <section class="section">
      <header class="section__header">
        <h2 class="section__title">近期热点</h2>
        <a class="section__more" href="#">查看全部</a>
      </header>
      <div class="card-row">
        <article v-for="t in topics" :key="t.id" class="look-card">
          <div class="look-card__cover ph" style="height: 130px">话题配图</div>
          <h3 class="look-card__title">{{ t.title }}</h3>
          <p class="look-card__author">{{ t.desc }}</p>
          <span class="look-card__count" style="color: var(--color-rose)">{{ t.stat }}</span>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '@/components/Icon.vue'
import LookCard from '@/components/LookCard.vue'
import PersonaAvatar from '@/components/PersonaAvatar.vue'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'
import { getBanners, getRecommend, getTips, getTopics } from '@/api/home'

/**
 * 首页。
 *
 * ★ 这一屏除了「我的脸模·人设库」那块,**内容全是策展好的演示数据**
 *   (`api/home.js` 的文件头说清了:没有别人的作品、没有真实点赞)。
 *   别照着这里的数字去写任何真实统计。
 *
 * ★ 人设库模块是**真数据**:读 `stores/personas`(本机浏览器,按账号分开)。
 *   它和人设库页读的是同一份,所以那边增删之后这里跟着变。
 */
const user = useUserStore()
const personas = usePersonasStore()

const banners = getBanners()
const banner = computed(() => banners[0])
const recommend = getRecommend()
const tips = getTips()
const topics = getTopics()

onMounted(() => {
  personas.load(user.id)
})
</script>
