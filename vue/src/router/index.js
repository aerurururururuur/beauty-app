import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  // 登录页是唯一不设防的一屏:没登录时一切路径都先落到这里。
  { path: '/login', name: 'login', component: () => import('@/pages/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'home', component: () => import('@/pages/HomeView.vue') },
  { path: '/upload', name: 'upload', component: () => import('@/pages/UploadView.vue') },
  { path: '/result', name: 'result', component: () => import('@/pages/ResultView.vue') },
  { path: '/cabinet', name: 'cabinet', component: () => import('@/pages/CabinetView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

/**
 * 全局门禁:没登录一律先去登录页,登录后再回到原本想去的路径(带 ?redirect=)。
 *
 * ★ 这不是安全边界。判定只看本地那份 `{ id, nickname }`——后端不签发凭证,
 *   前端能存的东西本来就可以被改。真正的把关在**后端**:衣橱改/删一律校验归属,
 *   不属于你就报 404。这里只负责"先登录、再进主页面"这条动线。
 */
router.beforeEach((to) => {
  const user = useUserStore()

  if (!to.meta.public && !user.isLoggedIn) {
    const target = { name: 'login' }
    // 根路径不必回跳(登录后本来就是回首页),其余路径记下来
    if (to.fullPath !== '/') target.query = { redirect: to.fullPath }
    return target
  }
  // 已登录还去登录页 → 直接进主页面,避免"退不出去"的观感
  if (to.name === 'login' && user.isLoggedIn) return { name: 'home' }
})

export default router
