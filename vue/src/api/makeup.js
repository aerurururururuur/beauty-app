import api, { API_BASE } from './index'
import { mockCreateJob, mockGetJob, useMock } from './mock'

export { useMock }

/**
 * 提交一个场景美妆任务。
 * multipart 字段与后端契约一致：face（本人照，必填）、scene（风景图，0..N）、scene_text（可选）。
 * 返回 POST /jobs 的 202 响应体 { id, status, progress, step }。
 */
export async function createMakeupJob({ portraitFile, sceneFiles = [], sceneText = '' }) {
  if (useMock()) {
    return mockCreateJob({ sceneFiles, sceneText })
  }
  const form = new FormData()
  form.append('face', portraitFile)
  sceneFiles.forEach((f) => form.append('scene', f))
  const text = (sceneText || '').trim()
  if (text) form.append('scene_text', text)
  return api.post('/jobs', form)
}

/** 轮询任务视图（GET /jobs/:id）。 */
export function fetchMakeupJob(id) {
  return useMock() ? mockGetJob(id) : api.get(`/jobs/${id}`)
}

/** 结果图的资源地址（真实引擎产物；mock 引擎为 null，前端改走本人照片 + CSS 叠加）。 */
export function resultImageHref(resultUrl) {
  if (!resultUrl) return ''
  return /^https?:/.test(resultUrl) ? resultUrl : `${API_BASE}${resultUrl}`
}
