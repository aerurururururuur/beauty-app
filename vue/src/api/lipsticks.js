import api from './index'
import { lipsticks as mockLipsticks } from '@/data/lipsticks'
import { mockAnalyze, useMock } from './mock'

// 获取口红色号列表
export async function getLipsticks() {
  if (useMock()) return mockLipsticks
  return api.get('/lipsticks')
}

// 提交试色分析：自拍(必) + 色卡(选) + 色号
export async function analyzeTryon({ photoFile, colorCardFile, lipstickId }) {
  if (useMock()) return mockAnalyze({ lipstickId })

  const form = new FormData()
  form.append('photo', photoFile)
  if (colorCardFile) form.append('color_card', colorCardFile)
  form.append('lipstick_id', lipstickId)
  return api.post('/analyze', form)
}
