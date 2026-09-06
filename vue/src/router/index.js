import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('@/pages/HomeView.vue') },
  { path: '/upload', name: 'upload', component: () => import('@/pages/UploadView.vue') },
  { path: '/result', name: 'result', component: () => import('@/pages/ResultView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
