import { lipsticks } from '@/data/lipsticks'

/**
 * 演示模式开关：未配置或非 'false' 时走 mock，
 * 保证后端未就绪也能完整演示。
 */
export function useMock() {
  return import.meta.env.VITE_USE_MOCK !== 'false'
}

/** 演示模式默认示例照片（SVG 占位人像，嘴唇锚点在 50%,46%） */
export const DEMO_PHOTO = '/demo/demo-photo.svg'

/** 模拟「AI 拍摄指导」分析结果 */
export const mockTips = [
  { icon: '☀️', text: '检测到光线充足，自然光下唇色更真实' },
  { icon: '👤', text: '已正对镜头，唇部轮廓清晰，可以识别' },
  { icon: '📷', text: '对焦清晰，建议拍摄时下巴微抬，露出完整唇形' }
]

/** 按质地区分「AI 试色解释」文案模板 */
const EXPLAIN_TEMPLATES = {
  哑光: '你选择了「{name}」。该色为{tags}，哑光质地遮盖力强。因原唇色较浅，最终效果接近膏体本色，呈现浓郁饱满的{tags}妆效，适合正式场合或想要强气场的妆容。',
  丝绒: '你选择了「{name}」。该色为{tags}，丝绒质地柔雾半哑光。原唇色与膏体融合后呈现高级的柔雾感，颜色会略深于膏体，像丝绒花瓣一样有层次。',
  滋润: '你选择了「{name}」。该色为{tags}，滋润质地清透水润。因原唇色较浅，最终效果清透自然，带水光感，适合日常通勤或淡妆。'
}

function mockExplain(lipstick) {
  const tpl = EXPLAIN_TEMPLATES[lipstick.finish] || EXPLAIN_TEMPLATES['滋润']
  return tpl
    .replace('{name}', `${lipstick.brand} ${lipstick.name}`)
    .replace('{tags}', lipstick.tags.join('、'))
}

/** 模拟一次试色分析的结果 */
export function mockAnalyze({ lipstickId }) {
  const lipstick = lipsticks.find((l) => l.id === lipstickId) || lipsticks[0]
  const luma = ((lipstick.rgb[0] + lipstick.rgb[1] + lipstick.rgb[2]) / 3 / 255).toFixed(2)
  return {
    resultUrl: null, // mock 模式下由前端 CSS 模拟试色图
    lipstick,
    analysis: {
      brightness: luma,
      temperature: Number(luma) > 0.55 ? '偏暖 +10%' : '偏冷 -8%'
    },
    explain: mockExplain(lipstick),
    tips: ['建议薄涂一层后用纸巾轻抿，妆效更服帖', '深唇或暗沉唇色建议先用遮瑕打底，显色更准']
  }
}
