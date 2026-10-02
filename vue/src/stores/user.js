import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useVanityStore } from '@/stores/vanity'
import { usePersonasStore } from '@/stores/personas'
import { useDesignStore } from '@/stores/design'

/**
 * user store —— 只回答一个问题:「这次用的是哪个账号(id + 昵称)」。
 *
 * ★ 这不是登录态。后端 user 模块只核对凭据、**不签发 token、不建会话**,
 *   所以前端也没有任何「凭证」可存:localStorage 里只有 `{ id, nickname }`
 *   这两个公开字段——**密码绝不落本地、绝不进 store、绝不进日志**。
 *   刷新后靠它恢复「我是谁」,而不是靠它证明「我有权」。
 *   真正的把关在后端(化妆包删一律校验归属,不属于你就报 404)。
 */
const STORAGE_KEY = 'beauty-app.user'

/** 演示模式留在本机的两把键(演示模式已删)。每次进页面清一次。 */
const MOCK_KEYS = ['beauty-app.mock-cabinet', 'beauty-app.mock-profile']

function readStored() {
  try {
    for (const k of MOCK_KEYS) localStorage.removeItem(k)
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : null
    // ★ 只认这两个字段:id 用于请求,昵称用于回显。多出来的键一律丢弃。
    //   历史版本/手改过的 localStorage 里可能塞着别的东西,不能原样信。
    if (saved && typeof saved.id === 'string' && typeof saved.nickname === 'string') {
      // 演示模式编的 id(`mock-user-…`)在真后端查无此人 ⇒ 当作没登录,逼一次重新登录。
      if (saved.id.startsWith('mock-user-')) {
        localStorage.removeItem(STORAGE_KEY)
        return null
      }
      return { id: saved.id, nickname: saved.nickname }
    }
  } catch {
    /* 隐私模式 / 脏数据:当作没登录 */
  }
  return null
}

export const useUserStore = defineStore('user', () => {
  const saved = readStored()
  const id = ref(saved?.id || '')
  const nickname = ref(saved?.nickname || '')
  const busy = ref(false) // 请求进行中(登录/注册)
  const error = ref('') // 给用户看的一句话

  const isLoggedIn = computed(() => id.value.length > 0)

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: id.value, nickname: nickname.value }))
    } catch {
      /* 存不下就算了,本次会话内仍可用 */
    }
  }

  /**
   * 登录 / 注册共用:两者都返回同一个用户视图,拿到就记下来。密码用完即弃。
   *
   * ★ `@/api/users` 走**惰性引入**:它经 api/index → axios(打包后 ~50 kB)。
   *   本 store 在路由守卫的首屏链上(router → user store → isLoggedIn),
   *   静态引会把 axios 整个拽进首屏包——而守卫只读 localStorage 里那点状态,
   *   真正发请求是用户点了按钮之后的事。
   *
   * ★ `remember` 是**「要不要写 localStorage」**,不是后端参数(后端没有这一项)。
   *   不勾 = 只存在内存里,关掉标签页就要重新登录。别把它当成"记住密码"。
   */
  async function submit(action, { taozhuangId, password, remember = true }) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    try {
      const users = await import('@/api/users')
      const view = await users[action]({ taozhuangId, password })
      id.value = view.id
      nickname.value = view.nickname
      if (remember) persist()
      else clearStored()
      return true
    } catch (e) {
      error.value = e?.message || '操作失败,请稍后再试'
      return false
    } finally {
      busy.value = false
    }
  }

  const login = (credentials) => submit('loginUser', credentials)
  const register = (credentials) => submit('registerUser', credentials)

  function clearStored() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 同上 */
    }
  }

  /**
   * 退出:清本机身份,不动后端数据(后端本来就没有会话可注销)。
   *
   * ★ 顺带把另外三个 store 一起 reset——**身份边界就是本机数据的边界**:
   *   · 化妆包在内存里挂着上一个账号的东西,不清的话换个人登录会先看到别人的货;
   *   · 人设库里存的是**人脸照片**(键本就按 userId 隔离,但内存里的那一份要收掉),
   *     它比化妆包更要紧;
   *   · 设计链那份缓存里挂着上一次的**会话号**——不清的话换个人登录进 `/result`,
   *     会先渲染上一个人的方案,再被那次 404 顶掉。
   *   这三条不能靠「记得手动清」。
   *
   * ★ 这三个 store 能被**静态引**,但它们的 api 模块必须仍然守住「首屏包里没有 axios」:
   *   · `api/vanity` 顶层**一行 import 都没有**(它的两条传输层——`./products` 与 `./cabinet`
   *     ——都是惰性取的;✏️ 2026-09-30 之前它顶层吃 `kb/` 那三份本地常量,那三份已退役);
   *     `api/design` 顶层只吃 `kb/` 剩下的纯数据,它那条 `@/api/agent` 是惰性的;
   *   · ★★ **`api/personas` 从 2026-09-30 起不再属于这一类**——人设搬到服务端之后
   *     它顶层就是 axios,所以 `stores/personas.js` 里那条改成了
   *     `import('@/api/personas')` **惰性**引入。改这三个 store 里任何一条 import 之前,
   *     先把这条判据重看一遍(判别法在 §6.3 的那条 grep)。
   */
  function logout() {
    id.value = ''
    nickname.value = ''
    error.value = ''
    useVanityStore().reset()
    usePersonasStore().reset()
    useDesignStore().reset()
    clearStored()
  }

  function clearError() {
    error.value = ''
  }

  return { id, nickname, busy, error, isLoggedIn, login, register, logout, clearError }
})
