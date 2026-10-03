<template>
  <FlowTopbar :back-to="backTo" title="妆容详情" />

  <main class="content content--flow">
    <div v-if="!post" class="empty">这篇帖子不在了，回上一页看看别的</div>
    <article v-else class="post-detail">
      <img class="post-detail__cover" :src="post.coverUrl" :alt="post.title" />
      <h1 class="post-detail__title">{{ post.title }}</h1>
      <div class="post-detail__meta">
        <span v-if="post.author" class="avatar" :style="{ background: post.author.avatarColor }"></span>
        <span class="post-detail__author">{{ authorName }}</span>
      </div>
      <p class="post-detail__desc">{{ post.desc }}</p>

      <!-- 点赞 / 收藏 / 评论。★ 数字只在本页内存里变(见 script 顶部那段) -->
      <div class="post-acts">
        <button class="post-act" :class="{ 'post-act--on': liked }" @click="liked = !liked">
          <Icon name="heart" :size="18" :color="liked ? 'var(--color-rose)' : 'currentColor'" />
          <span>{{ likes }}</span>
        </button>
        <button class="post-act" :class="{ 'post-act--on': collected }" @click="collected = !collected">
          <Icon name="bookmark" :size="18" :color="collected ? 'var(--color-rose)' : 'currentColor'" />
          <span>{{ collects }}</span>
        </button>
        <button class="post-act" @click="focusComment">
          <Icon name="comment" :size="18" color="currentColor" />
          <span>{{ comments.length }}</span>
        </button>
      </div>

      <!-- 评论 -->
      <section class="comments">
        <h2 class="comments__title">评论 {{ comments.length }}</h2>

        <div class="comments__form">
          <textarea
            ref="commentBox"
            v-model="draft"
            class="comments__input"
            rows="2"
            :maxlength="MAX_COMMENT"
            placeholder="说点什么…"
          ></textarea>
          <div class="comments__foot">
            <span class="comments__count">{{ draft.length }}/{{ MAX_COMMENT }}</span>
            <button class="btn btn--brand" :disabled="!draft.trim()" @click="send">发布</button>
          </div>
        </div>

        <div v-if="!comments.length" class="empty">还没有评论，来说第一句</div>
        <ul v-else class="comments__list">
          <li v-for="c in comments" :key="c.id" class="comment">
            <span class="avatar" :style="{ background: c.avatarColor }"></span>
            <div class="comment__body">
              <span class="comment__user">{{ c.user }}</span>
              <p class="comment__text">{{ c.text }}</p>
            </div>
          </li>
        </ul>
      </section>
    </article>
  </main>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { getPost } from '@/api/home'
import { useUserStore } from '@/stores/user'
import { useQueryParam, useRouteParam } from '@/composables/useQueryParam'

/**
 * 一条帖子的详情。灵感广场与「我的·作品」两处进来共用这一屏。
 *
 * ★ 数据是 C 档策展内容(`api/home.js`):点赞 / 收藏 / 发评论**只改本页内存,刷新即复原**——
 *   后端没有帖子、评论、点赞,这几个操作不发给任何人。
 * ★ `?from=` 决定「返回」去哪(只认 `mine`,其余回落灵感广场);「我的作品」那几条没有作者,署名回落账号名。
 */
const MAX_COMMENT = 200

const user = useUserStore()
const postId = useRouteParam('id', '')
const from = useQueryParam('from', '')

const post = computed(() => getPost(postId.value))
const authorName = computed(() => post.value?.author?.name || user.nickname)
const backTo = computed(() => (from.value === 'mine' ? '/mine' : '/inspiration'))

/* 互动与评论:进这一屏时从帖子上取初值,之后只在本页内存里改。
   ★ `watch` 是给「同一屏换 id」用的——路由复用组件实例,不重新建的话上一条的评论会留在下一条上。 */
const liked = ref(false)
const collected = ref(false)
const comments = ref([])
const draft = ref('')
const commentBox = ref(null)

watch(
  post,
  (p) => {
    liked.value = false
    collected.value = false
    comments.value = p?.comments ? [...p.comments] : []
    draft.value = ''
  },
  { immediate: true },
)

const likes = computed(() => (post.value?.likes || 0) + (liked.value ? 1 : 0))
const collects = computed(() => (post.value?.collected || 0) + (collected.value ? 1 : 0))

/** 发出去只进本页的 `comments`,不落任何地方。 */
function send() {
  const text = draft.value.trim()
  if (!text) return
  comments.value.unshift({
    id: `local-${Date.now()}`,
    user: user.nickname,
    avatarColor: 'var(--color-peach)',
    text,
  })
  draft.value = ''
}

/** 点那个评论气泡:把光标送进输入框(不是空按钮)。 */
async function focusComment() {
  await nextTick()
  commentBox.value?.focus()
  commentBox.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<style scoped>
.post-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
}

.post-detail__cover {
  width: 100%;
  max-height: 520px;
  object-fit: cover;
  border-radius: var(--radius-lg);
  background: var(--color-card);
}

.post-detail__title {
  font-size: 26px;
  font-weight: 700;
}

.post-detail__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.post-detail__author {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-sub);
}

.post-detail__desc {
  font-size: 15px;
  line-height: 1.9;
}

.post-acts {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--color-line);
  border-bottom: 1px solid var(--color-line);
}

.post-act {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-card);
  color: var(--color-text-sub);
  font-size: 13px;
  transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.post-act:hover {
  background: var(--color-warm-white);
}

/* 点过之后是玫红的**实心**图标:描边图标只靠换色,状态不够明显 */
.post-act--on {
  color: var(--color-rose);
}

.post-act--on svg {
  fill: var(--color-rose);
}

.comments {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.comments__title {
  font-size: 17px;
  font-weight: 700;
}

.comments__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.comments__input {
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-card);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
}

.comments__foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.comments__count {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-sub);
}

.comments__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.comment {
  display: flex;
  gap: var(--space-3);
}

.comment__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.comment__user {
  font-size: 13px;
  font-weight: 500;
}

.comment__text {
  font-size: 14px;
  line-height: 1.7;
}
</style>
