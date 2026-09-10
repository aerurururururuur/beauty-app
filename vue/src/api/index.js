import axios from 'axios'

// 结果图等资源地址前缀：VITE_API_BASE 可指向完整后端地址；默认走开发代理 /api
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000
})

// 统一解包响应体，并把错误转成可读的中文提示
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const data = err.response?.data
    // 后端错误体是 { error: { code, message } }（见 server/README.md），
    // 优先取里层 message，才是「昵称已被占用」这种给人看的文案；
    // error 为字符串的旧式写法仍兼容。
    const envelope = data?.error
    const detail =
      (typeof envelope === 'object' ? envelope?.message : envelope) || data?.detail || data?.message
    const msg = typeof detail === 'string' ? detail : err.message || '请求失败，请稍后再试'
    return Promise.reject(new Error(msg))
  }
)

export default api
