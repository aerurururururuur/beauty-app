<template>
  <main class="auth">
    <!-- 左:品牌面板 -->
    <section class="auth__brand">
      <div class="auth__logo">
        <BrandMark :size="48" color="#ffffff" />
        <h1 class="auth__brand-name">桃妆</h1>
        <p class="auth__brand-en">TAOZHUANG · AI 妆容风格推荐</p>
      </div>
      <div>
        <p class="auth__slogan">桃之夭夭，灼灼其华</p>
        <p class="auth__sub">上传一张照片，让 AI 找到属于你的妆容风格</p>
      </div>
    </section>

    <!-- 右:登录 / 注册 -->
    <section class="auth__panel">
      <form class="auth__card" @submit.prevent="onSubmit">
        <h2 class="auth__title">{{ title }}</h2>
        <p class="auth__desc">登录后即可同步你的妆容方案与收藏</p>

        <div class="auth__tabs">
          <button type="button" class="auth__tab" @click="switchMode('login')">
            <span class="auth__tab-label" :class="{ 'auth__tab-label--idle': mode !== 'login' }">登录</span>
            <span class="auth__underline" :style="{ visibility: mode === 'login' ? 'visible' : 'hidden' }"></span>
          </button>
          <button type="button" class="auth__tab" @click="switchMode('register')">
            <span class="auth__tab-label" :class="{ 'auth__tab-label--idle': mode !== 'register' }">注册</span>
            <span class="auth__underline" :style="{ visibility: mode === 'register' ? 'visible' : 'hidden' }"></span>
          </button>
        </div>

        <label class="field">
          <Icon name="user" :size="20" color="currentColor" />
          <input
            v-model="taozhuangId"
            class="field__input"
            type="text"
            placeholder="请输入你的桃妆 ID"
            autocomplete="username"
          />
        </label>

        <label class="field">
          <Icon name="lock" :size="20" color="currentColor" />
          <input
            v-model="password"
            class="field__input"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
          <Icon name="eye" :size="20" color="currentColor" />
        </label>

        <div class="auth__assist">
          <label class="checkbox">
            <input v-model="remember" type="checkbox" hidden />
            <span class="checkbox__box">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect class="checkbox__rect" x="1" y="1" width="14" height="14" rx="4" />
                <path class="checkbox__tick" d="M4.6 8.2L7 10.5L11.4 5.8" stroke="var(--color-white)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>记住登录状态</span>
          </label>
          <a class="auth__forget" href="#">忘记密码？</a>
        </div>

        <!-- 失败原因直接用后端那句话(如「桃妆 ID 已被占用」),前端不另写一份文案 -->
        <ErrorNote :text="user.error" />

        <button type="submit" class="auth__submit" :disabled="user.busy">
          {{ user.busy ? '处理中…' : submitLabel }}
        </button>

        <div class="auth__divider">或</div>

        <div class="auth__social">
          <button type="button" class="social-btn" aria-label="微信登录">
            <Icon name="wechat" :size="24" color="currentColor" />
          </button>
          <button type="button" class="social-btn" aria-label="手机号登录">
            <Icon name="phone" :size="24" color="currentColor" />
          </button>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import ErrorNote from '@/components/ErrorNote.vue'
import Icon from '@/components/Icon.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useUserStore } from '@/stores/user'

/**
 * 登录 / 注册(同一屏两个 Tab)。
 *
 * ★ 这两个动作走**真后端**:`POST /users`(注册)与 `POST /users/login`。
 *   桃妆 ID 映射到后端的 `nickname`——映射只发生在 `api/users.js` 一处,
 *   这个页面只管把用户填的两个字段原样交出去。
 *
 * ★ 密码**用完即弃**:进 store 的只有 `{ id, nickname }`(见 stores/user.js)。
 *   这一屏不写 localStorage、不写日志。
 *
 * ★ 「记住登录状态」= **要不要写 localStorage**,不是"记住密码":
 *   不勾就只存在内存里,关掉标签页就要重新登录。后端没有这个参数。
 */
const router = useRouter()
const user = useUserStore()

/** 进门时想去的那一页(路由守卫留下的 `?redirect=`);没有就回首页。 */
const redirect = useQueryParam('redirect')

const mode = ref('login')
const taozhuangId = ref('')
const password = ref('')
const remember = ref(true)

const title = computed(() => (mode.value === 'login' ? '欢迎回来' : '创建你的桃妆账号'))
const submitLabel = computed(() => (mode.value === 'login' ? '登录' : '注册并登录'))

function switchMode(next) {
  mode.value = next
  user.clearError()
}

async function onSubmit() {
  const id = taozhuangId.value.trim()
  if (!id || !password.value) {
    user.error = '请输入桃妆 ID 与密码'
    return
  }
  const action = mode.value === 'login' ? user.login : user.register
  const ok = await action({ taozhuangId: id, password: password.value, remember: remember.value })
  if (!ok) return
  // 登录后回到进门时想去的那一页(?redirect= 是路由守卫留下的);没有就回首页
  router.replace(redirect.value || '/')
}
</script>
