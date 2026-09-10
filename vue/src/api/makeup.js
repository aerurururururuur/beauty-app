import api, { API_BASE } from './index'
import { useMock } from './use-mock'

export { useMock }

/**
 * 提交一个「场合美妆」任务。
 * multipart 字段与后端契约一致：
 *   face(本人照,必填)、scene(可选风景参考图,0..N)、meta(需求简报 JSON,含 occasion/肤质肤色/穿搭/天气/自由文字)。
 * 返回 POST /jobs 的 202 响应体 { id, status, progress, step }。
 */
export async function createMakeupJob({ portraitFile, sceneFiles = [], brief = {} }) {
  if (useMock()) {
    // 惰性引入:假后端几十 KB,真实后端模式下不该进首屏包
    const { mockCreateJob } = await import('./mock')
    return mockCreateJob({ sceneFiles, brief })
  }
  const form = new FormData()
  form.append('face', portraitFile)
  sceneFiles.forEach((f) => form.append('scene', f))
  form.append('meta', JSON.stringify(brief || {}))
  return api.post('/jobs', form)
}

/** 轮询任务视图(GET /jobs/:id)。 */
export async function fetchMakeupJob(id) {
  if (useMock()) {
    const { mockGetJob } = await import('./mock')
    return mockGetJob(id)
  }
  return api.get(`/jobs/${id}`)
}

/** 结果图的资源地址(真实引擎产物;mock 引擎为 null,前端改走本人照片 + CSS 叠加)。 */
export function resultImageHref(resultUrl) {
  if (!resultUrl) return ''
  return /^https?:/.test(resultUrl) ? resultUrl : `${API_BASE}${resultUrl}`
}
