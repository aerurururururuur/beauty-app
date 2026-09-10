import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useMakeupStore } from '@/stores/makeup'

/**
 * user store —— 只回答一个问题:「这次演示用的是哪个账号(id + 昵称)」。
 *
 * ★ 这不是登录态。后端 user 模块只核对凭据、**不签发 token、不建会话**
 *   (见 roadmap 红线 5),所以前端也没有任何"凭证"可存:
 *   localStorage 里只有 { id, nickname } 这两个公开字段——
 *   **密码绝不落本地、绝不进 store**。刷新后靠它恢复"我是谁",
 *   而不是靠它证明"我有权"。归属校验真正的把关在后端(改/删不认别人)。
 */
const STORAGE_KEY = 'beauty-app.user'

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : null
    // 只认这两个字段:id 用于请求,昵称用于回显。多出来的键一律丢弃。
    if (saved && typeof saved.id === 'string' && typeof saved.nickname === 'string') {
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
   * 登录 / 注册共用:两者都返回 UserView,拿到就记下来。密码用完即弃。
   *
   * ★ api/users 走**惰性引入**:它经 api/index → axios(打包后 ~50 kB)。
   *   本 store 在路由守卫的首屏链上(router → user store → isLoggedIn),静态引入
   *   会把 axios 整个拽进首屏包——而守卫只读 localStorage 里那点状态,
   *   真正发请求是用户点了按钮之后的事。同理见 api/use-mock.js 的注释。
   */
  async function submit(action, credentials) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    try {
      const users = await import('@/api/users')
      const view = await users[action](credentials)
      id.value = view.id
      nickname.value = view.nickname
      persist()
      return true
    } catch (e) {
      error.value = e?.message || '操作失败,请稍后再试'
      return false
    } finally {
      busy.value = false
    }
  }

  // action 是 @/api/users 里的导出名,惰性引入时才解析(见上)
  const login = (credentials) => submit('loginUser', credentials)
  const register = (credentials) => submit('registerUser', credentials)

  /**
   * 退出:清本地身份,不动后端数据(后端本来就没有会话可注销)。
   *
   * 顺带把上传页的状态一起 reset——**身份边界就是现场照片的边界**:
   * 不清的话,换个人登录后进上传页,上一个人的本人照还留在内存里。
   * 红线 4 要求现场采集的照片即用即删,这条不能靠"记得手动清"。
   */
  function logout() {
    id.value = ''
    nickname.value = ''
    error.value = ''
    useMakeupStore().reset()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 同上 */
    }
  }

  function clearError() {
    error.value = ''
  }

  return { id, nickname, busy, error, isLoggedIn, login, register, logout, clearError }
})
