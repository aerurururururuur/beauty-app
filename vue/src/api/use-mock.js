/**
 * api/use-mock.js —— 演示模式开关。
 *
 * ★ 刻意单独成一个文件,不要并回 mock.js:mock.js 里是整套假后端(判定 / 调色 /
 *   假流水线 / 本地衣橱,几十 KB),而这里只是一次环境变量判断。
 *   路由守卫 → store → api 这条**首屏链**上要用到它,若它住在 mock.js 里,
 *   整个假后端会被打进首屏包(实测 +24 kB gzip),真实后端模式下白下载。
 *   各 api 模块的 mock 分支请用 `await import('./mock')` 惰性取。
 */
export function useMock() {
  return import.meta.env.VITE_USE_MOCK !== 'false'
}
