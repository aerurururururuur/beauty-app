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
    <img v-if="avatarUrl" class="mine-bar-avatar" :src="avatarUrl" alt="" />
    <div v-else class="ph" style="width: 38px; height: 38px; border-radius: 999px; font-size: 10px">头像</div>
  </header>

  <main class="content" style="gap: 20px">
    <div style="display: flex; flex-direction: column; gap: 20px">
      <!-- 个人信息 -->
      <div class="profile-card">
        <img v-if="avatarUrl" class="profile-card__avatar mine-avatar-img" :src="avatarUrl" alt="我的头像" />
        <div v-else class="profile-card__avatar ph">用户头像</div>
        <div class="profile-card__info">
          <h2 class="profile-card__name">{{ profile?.nickname || user.nickname || '未登录' }}</h2>
          <span class="profile-card__id">{{ demo.taozhuangId }}</span>
          <span v-if="profile?.bio" class="profile-card__bio">{{ profile.bio }}</span>
        </div>
        <div class="profile-card__spacer"></div>
        <div class="stats-row">
          <div class="stat">
            <span class="stat__value">{{ demo.stats.works }}</span>
            <span class="stat__label">妆面作品</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ demo.stats.followers }}</span>
            <span class="stat__label">粉丝</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ demo.stats.liked }}</span>
            <span class="stat__label">获赞</span>
          </div>
        </div>
        <button class="btn btn--soft" :disabled="saving" @click="openEditor">编辑资料</button>
      </div>

      <ErrorNote :text="error" />

      <!-- 编辑资料:简介 + 头像。★ 页内展开,不新开一屏(没有站内返回时更好用) -->
      <div v-if="editing" class="profile-edit">
        <div class="profile-edit__head">
          <img v-if="draftAvatarUrl" class="profile-edit__avatar mine-avatar-img" :src="draftAvatarUrl" alt="头像预览" />
          <div v-else class="profile-edit__avatar ph">用户头像</div>
          <div class="profile-edit__acts">
            <button class="btn btn--soft" :disabled="saving" @click="pickAvatar()">换一张</button>
            <button v-if="draftAvatarUrl" class="btn btn--soft" :disabled="saving" @click="dropAvatar">删掉头像</button>
            <input ref="fileInput" type="file" accept="image/*" hidden @change="onAvatarChange" />
          </div>
        </div>
        <textarea
          v-model="draftBio"
          class="profile-edit__bio"
          rows="3"
          :maxlength="MAX_BIO"
          placeholder="一句话介绍自己：肤质、日常妆感…"
        ></textarea>
        <div class="profile-edit__foot">
          <span class="profile-edit__count">{{ draftBio.length }}/{{ MAX_BIO }}</span>
          <button class="btn btn--soft" :disabled="saving" @click="closeEditor">取消</button>
          <button class="btn btn--brand" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>

      <!-- AI 档案 -->
      <div class="ai-card">
        <div class="ai-card__texts">
          <h3 class="ai-card__title">我的 AI 妆容档案</h3>
          <!-- ★ 套数拉不到就**不显示这一行**,绝不编一个 0(那会把「没读到」说成「一版都没有」) -->
          <p v-if="lookCount !== null" class="ai-card__sub">已经存下 {{ lookCount }} 版</p>
        </div>
        <div class="ai-card__spacer"></div>
        <RouterLink class="btn btn--brand" to="/looks">查看我的妆容档案</RouterLink>
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
      <!-- 点进帖子详情。★ 有图用真图,没图仍回落 .ph(不代用别的图) -->
      <RouterLink
        v-for="it in items"
        :key="it.id"
        class="look-card"
        :to="{ name: 'post', params: { id: it.id }, query: { from: 'mine' } }"
      >
        <img
          v-if="it.coverUrl"
          class="look-card__cover"
          :src="it.coverUrl"
          :alt="it.title"
          :style="{ height: `${it.coverHeight || 250}px`, objectFit: 'cover' }"
        />
        <div v-else class="look-card__cover ph" :style="{ height: `${it.coverHeight || 250}px` }">妆容封面</div>
        <h3 class="look-card__title">{{ it.title }}</h3>
        <span class="look-card__count">{{ it.likes }} 赞</span>
      </RouterLink>
    </div>

    <!-- 退出登录:源站没有这一项(它没有登录态),这是搬过来时后加的 -->
    <div class="mine-foot">
      <button class="btn btn--soft" @click="onLogout">退出登录</button>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { shrinkPhoto } from '@/api/image'
import { avatarSrc, fetchProfile, MAX_BIO, updateProfile } from '@/api/users'
import { getMyWorks, getProfile, WORKS_EMPTY } from '@/api/home'
import { listLooks } from '@/api/looks'
import { useFilePick } from '@/composables/useFilePick'

/**
 * 我的。
 *
 * ★ 这一屏的数据两档混在一起,别读串:
 *   · **账号资料(昵称 / 简介 / 头像)是真的** —— 来自 `GET /users/:id`,改一次落一次盘,
 *     换台机器登录还在(证明它真的存在账号下)。
 *   · 桃妆号是按 id 推出来的、三项统计是 `api/home.js` 里的**演示值**——
 *     别照着这里的数字写任何真实统计。
 *
 * ★ 内容 Tab 的**计数与个人信息卡的统计取同一份 demo 对象**:源站特意如此,
 *   免得页面上两处数字对不上(一处改了另一处没改,静默不一致)。
 *
 * ★ 「我的 AI 妆容档案」那张卡的**套数是真的** —— `GET /looks` 数出来的,
 *   按钮进 `/looks`。它跟上面那两档不是一回事,别跟着 demo 改。
 *
 * ★ 退出登录:源站没有登录态,这是搬过来时**新加的一项**——
 *   不然后端登录进来的账号在界面上没有出口(只能清浏览器数据)。
 *   转发在 stores/user.js:清 id/昵称 + 重置美妆台与人设库 + 清 localStorage。
 */
const router = useRouter()
const user = useUserStore()

/** 账号资料(后端那份)。★ 拉不到时为 null,页面照常显示演示内容 + 一句错误。 */
const profile = ref(null)
const error = ref('')
/** 妆容档案套数。★ `null` = 还没读到/没读到 —— 与 0 严格区分,模板靠它决定显不显示那行。 */
const lookCount = ref(null)

const demo = getProfile({ userId: user.id })

const TABS = [
  { id: 'works', name: '作品' },
  { id: 'collections', name: '收藏' },
  { id: 'liked', name: '赞过' },
]
const tab = ref('works')

/** Tab 上的计数:作品 = 作品数,收藏 = 收藏数,赞过 = 获赞数(与档案卡的「获赞」同源)。 */
const counts = {
  works: demo.stats.works,
  collections: demo.stats.collections,
  liked: demo.stats.liked,
}

const items = computed(() => getMyWorks({ tab: tab.value }))
const emptyText = computed(() => WORKS_EMPTY[tab.value] || WORKS_EMPTY.works)

/* ---------------------- 头像 ---------------------- */

/**
 * ★ 换完头像要换一个 `?v=`:后端这条 URL **不带版本号**(`/users/<id>/avatar`),
 *   地址没变 ⇒ Vue 不重设 `src` ⇒ 浏览器一次请求都不发,界面上还是旧的那张。
 *   服务端的 `no-store` 挡的是缓存,挡不住"根本没有再请求"。
 */
const avatarNonce = ref(0)
const avatarUrl = computed(() => {
  const src = avatarSrc(profile.value)
  if (!src) return ''
  return src.startsWith('data:') ? src : `${src}?v=${avatarNonce.value}`
})

/* ---------------------- 编辑资料 ---------------------- */

const editing = ref(false)
const saving = ref(false)
const draftBio = ref('')
/** 头像这一格三态:`null` = 没动过;`''` = 删掉;dataURL = 换一张。★ 与后端同形。 */
const draftAvatar = ref(null)

const { inputRef: fileInput, pick: pickAvatar } = useFilePick()

function openEditor() {
  error.value = ''
  draftBio.value = profile.value?.bio || ''
  draftAvatar.value = null
  editing.value = true
}

function closeEditor() {
  editing.value = false
  error.value = ''
}

/** 面板左上那个预览:没动过就还是当前那张,删掉了就回落占位块。 */
const draftAvatarUrl = computed(() =>
  draftAvatar.value !== null ? draftAvatar.value : avatarUrl.value,
)

function dropAvatar() {
  draftAvatar.value = ''
}

async function onAvatarChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  error.value = ''
  try {
    draftAvatar.value = await shrinkPhoto(file)
  } catch (err) {
    error.value = err?.message || '这张照片读不出来，换一张试试'
  }
}

async function save() {
  if (saving.value) return
  error.value = ''
  // ★ 三态:只把**真的改过**的那一格发出去。把"没改"当成"清空"会顺手删掉用户的头像/简介。
  const patch = { userId: user.id }
  if (draftBio.value !== (profile.value?.bio || '')) patch.bio = draftBio.value
  if (draftAvatar.value !== null) patch.avatar = draftAvatar.value
  if (patch.bio === undefined && patch.avatar === undefined) {
    editing.value = false
    return
  }
  saving.value = true
  try {
    profile.value = await updateProfile(patch)
    avatarNonce.value += 1
    editing.value = false
  } catch (e) {
    error.value = e?.message || '没能保存，请稍后再试'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    profile.value = await fetchProfile({ userId: user.id })
  } catch (e) {
    // ★ 拉不到就照实说,不拿演示值假装是账号里的简介/头像(那正是本仓头号 bug 的形状)。
    error.value = e?.message || '没能读到账号资料，请稍后再试'
  }
  // ★ 档案套数**单独一段**,失败只让数字不出现:不能因为档案拉不到,连账号资料也一起报错。
  try {
    lookCount.value = (await listLooks({ userId: user.id })).length
  } catch {
    // 拉不到就不显示那一行(见模板注释)
  }
})

function onLogout() {
  user.logout()
  router.replace('/login')
}
</script>

<style scoped>
/* 页内私有:桃妆的样式表里没有这两块(源站没有登录态、也没有「编辑资料」)。 */
.mine-foot {
  display: flex;
  justify-content: center;
  padding: 8px 0 24px;
}

/* 档案卡上的套数。页内私有:共享样式表里没有这一格 */
.ai-card__sub {
  color: var(--color-text-sub);
  font-size: 13px;
}

.profile-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--color-white);
  box-shadow: var(--shadow-card);
}

.profile-edit__head {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.profile-edit__avatar {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-pill);
}

.profile-edit__acts {
  display: flex;
  gap: var(--space-3);
}

.profile-edit__bio {
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

.profile-edit__foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.profile-edit__count {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-sub);
}

/* 头像有图时裁成圆,没图时是 .ph 占位块 */
.mine-avatar-img {
  object-fit: cover;
}

.mine-bar-avatar {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill);
  object-fit: cover;
}
</style>
