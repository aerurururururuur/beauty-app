<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { useMock } from '@/api/use-mock'

/**
 * 登录页 —— 应用的第一屏。没登录进不了主页面(守卫见 router/index.ts)。
 *
 * 登录成功 = 拿到 UserView{ id, nickname } 记在本地;后端**只核对、不签发 token**,
 * 所以本地那份不是凭证,也存不了密码。真正拦住"看别人的衣橱"的是后端的归属校验。
 */
const route = useRoute()
const router = useRouter()
const user = useUserStore()
const isMock = useMock()

const nickname = ref('')
const password = ref('')

/** 登录/注册成功后回到原本想去的地方(被守拦截下的路径)。 */
const redirect = computed(() => {
  const to = route.query.redirect
  return typeof to === 'string' && to.startsWith('/') ? to : '/'
})

const canSubmit = computed(
  () => nickname.value.trim().length > 0 && password.value.length > 0 && !user.busy
)

async function submit(action) {
  const ok = await user[action]({ nickname: nickname.value, password: password.value })
  if (!ok) return
  // 密码用完即弃:不进 store、不落 localStorage、刷新即无
  password.value = ''
  nickname.value = ''
  router.replace(redirect.value)
}
</script>

<template>
  <div class="page login">
    <header class="hero">
      <div class="caps overline">OCCASION MAKEUP · AI 妆容实验</div>
      <h1 class="brand">场合美妆镜</h1>
      <p class="lead">
        为那些<em>重要的时刻</em>，配一张体面、得体的脸。<br />
        先登个记，你的衣橱和妆造才会认得你。
      </p>
    </header>

    <section class="card">
      <div class="caps">ACCOUNT</div>
      <h2 class="card-title">登录 / 注册</h2>
      <p class="card-sub">同一组昵称密码：没注册过就是注册，注册过就是登录。</p>

      <label class="field-label caps" for="login-nickname">昵称</label>
      <input
        id="login-nickname"
        v-model="nickname"
        class="text-input"
        type="text"
        autocomplete="username"
        placeholder="2–32 个字符"
        @input="user.clearError()"
      />

      <label class="field-label caps" for="login-password">密码</label>
      <input
        id="login-password"
        v-model="password"
        class="text-input"
        type="password"
        autocomplete="current-password"
        placeholder="至少 6 位"
        @keyup.enter="canSubmit && submit('login')"
        @input="user.clearError()"
      />

      <p v-if="user.error" class="field-tip warn">{{ user.error }}</p>
      <p v-else-if="isMock" class="field-tip">
        离线演示模式：不走后端，密码不校验也不保存，昵称只用来区分是谁的衣橱。
      </p>
      <p v-else class="field-tip">
        密码只用于本次核对，不签发凭证，也不保存在浏览器里——后端只存不可逆的哈希。
      </p>

      <div class="actions">
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submit('login')">
          登录
        </button>
        <button class="btn btn-ghost" :disabled="!canSubmit" @click="submit('register')">
          注册
        </button>
      </div>
    </section>

    <p class="hint">
      首次使用：填好昵称和密码点「注册」即可建档，会直接进入主页面。<br />
      全程浏览器本地演示，不做真实用户数据留存。
    </p>
  </div>
</template>

<style scoped>
.page {
  justify-content: center;
  gap: 20px;
}

.hero {
  text-align: center;
  padding: 20px 4px 0;
}

.overline {
  letter-spacing: 0.22em;
}

.brand {
  font-family: var(--font-display);
  font-size: 42px;
  line-height: 1.2;
  margin: 12px 0 14px;
  letter-spacing: 0.06em;
}

.brand::first-letter {
  color: var(--c-accent);
}

.lead {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--c-ink-soft);
  margin: 0 auto;
  max-width: 320px;
}

.lead em {
  font-style: normal;
  color: var(--c-accent);
}

.field-label {
  display: block;
  margin: 16px 0 8px;
}

.text-input {
  width: 100%;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-ink);
  font-family: inherit;
  font-size: 13px;
  padding: 10px 12px;
  outline: none;
}

.text-input:focus {
  border-color: var(--c-accent);
}

.field-tip {
  font-size: 11.5px;
  margin: 10px 0 0;
  color: var(--c-ink-faint);
  line-height: 1.7;
}

.field-tip.warn {
  color: var(--c-accent-deep);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.actions .btn {
  flex: 1;
  padding: 0 12px;
}

.hint {
  text-align: center;
  font-size: 11px;
  color: var(--c-ink-faint);
  margin: 0 auto;
  line-height: 1.8;
}
</style>
