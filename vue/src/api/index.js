import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000
})

// 统一解包响应体，并把错误转成可读的中文提示
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const detail = err.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : err.message || '请求失败，请稍后再试'
    return Promise.reject(new Error(msg))
  }
)

export default api
