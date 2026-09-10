import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 场合语义的**单一源**在后端,前端直读那一份 —— 浏览器 mock 模式与真实后端
      // 必须给出同一个判定,各抄一份会静默漂移。该文件被约束为零运行时依赖
      // (只允许 import type),所以前端能安全地直接执行它。见 server/.../scene-rules.ts 文件头。
      '@scene-rules': fileURLToPath(
        new URL('../server/src/modules/shared/domain/scene-rules.ts', import.meta.url)
      )
    }
  },
  server: {
    host: true,
    // dev server 默认只放行项目根;本项目没有 workspace(根目录无 package.json),
    // 所以默认根就是 vue/ —— 要读 ../server 必须显式放行。
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    // 开发时将 /api 请求转发到本地 TS 后端（server/，Fastify，默认 3000）
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
