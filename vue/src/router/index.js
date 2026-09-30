import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

/**
 * 桃妆的路由表。
 *
 * `meta.nav` 决定侧栏高亮谁(AppSidebar 的 `active`),取值:
 *   'home' / 'inspiration' / 'mine' → 主导航;'personas' → 快捷区「人设库」;
 *   'vanity' → 快捷区「数字美妆台」;不写 = 一个都不亮(数据来自一个都不亮的 create 那条链)。
 *   ★ 不写进页面是因为**页面组件是懒加载的**,侧栏得先知道亮谁。
 *
 * ★ 页面之间传业务数据走 **query**(scene / persona / style / id),不走 store。
 *   这些参数**可深链**:结果页刷新后必须还是那一版方案(personas 详情、人设问卷同理),
 *   只放 store 里一刷新就没了。这是分层约束 §3.6 说的那个例外。
 *
 * ★ 顺序:静态段必须排在动态段前面——`/personas/new` 与 `/personas/quiz`
 *   都比 `/personas/:id` 先注册,否则会被当成 id='new' 吃掉。
 */
const routes = [
  // 登录页是唯一不设防的一屏:没登录时一切路径都先落到这里。
  { path: '/login', name: 'login', component: () => import('@/pages/LoginView.vue'), meta: { public: true } },

  /* 第一层:浏览 */
  { path: '/', name: 'home', component: () => import('@/pages/HomeView.vue'), meta: { nav: 'home' } },
  { path: '/inspiration', name: 'inspiration', component: () => import('@/pages/InspirationView.vue'), meta: { nav: 'inspiration' } },
  { path: '/mine', name: 'mine', component: () => import('@/pages/MineView.vue'), meta: { nav: 'mine' } },

  /* 第二层:数字美妆台。★ `/vanity/add` 必须排在 `/vanity` 之前(无参动态段没有,但保持同类顺序习惯) */
  { path: '/vanity/add', name: 'vanity-add', component: () => import('@/pages/VanityAddView.vue'), meta: { nav: 'vanity' } },
  { path: '/vanity', name: 'vanity', component: () => import('@/pages/VanityView.vue'), meta: { nav: 'vanity' } },

  /* 第二层:开始设计。这三屏刻意**不亮**侧栏快捷区之外的任何一项(nav 留空) */
  { path: '/create', name: 'create', component: () => import('@/pages/CreateView.vue') },
  { path: '/form', name: 'form', component: () => import('@/pages/FormView.vue') },
  { path: '/result', name: 'result', component: () => import('@/pages/ResultView.vue') },

  /* 人设库:静态段(new / quiz)排在前,`:id` 兜底 */
  { path: '/personas/new', name: 'persona-new', component: () => import('@/pages/PersonaNewView.vue'), meta: { nav: 'personas' } },
  { path: '/personas/quiz', name: 'persona-quiz', component: () => import('@/pages/PersonaQuizView.vue'), meta: { nav: 'personas' } },
  { path: '/personas/:id', name: 'persona-detail', component: () => import('@/pages/PersonaDetailView.vue'), meta: { nav: 'personas' } },
  { path: '/personas', name: 'personas', component: () => import('@/pages/PersonasView.vue'), meta: { nav: 'personas' } },

  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 结果页靠锚点跳步骤(step-rail),路由级滚动策略**不能**抢掉它:
  // 只在新导航时回顶,hash 跳转交给页面自己处理。
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return false
    return { top: 0 }
  },
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
