/**
 * constants/options.js —— 上传表单/结果回显共用的可选项与中文名。
 * value 与后端契约(meta 里的 occasion/skinType/skinTone 枚举)保持一致,
 * 只做展示层,不在前端二次建模。
 */

export const OCCASION_OPTIONS = [
  { value: 'interview', label: '面试 / 终面', hint: '正式 · 干练' },
  { value: 'date', label: '约会', hint: '温柔 · 亲和' },
  { value: 'stage', label: '上台 / 演讲', hint: '醒目 · 立体' },
  { value: 'family', label: '见家长', hint: '温婉 · 得体' },
  { value: 'daily', label: '日常通勤', hint: '自然 · 百搭' }
]

export const OCCASION_CN = Object.fromEntries(
  OCCASION_OPTIONS.map((o) => [o.value, o.label])
)

export const SKIN_TYPE_OPTIONS = [
  { value: 'dry', label: '干性' },
  { value: 'oily', label: '油性' },
  { value: 'combination', label: '混合' },
  { value: 'sensitive', label: '敏感' },
  { value: 'neutral', label: '中性' }
]

export const SKIN_TYPE_CN = Object.fromEntries(
  SKIN_TYPE_OPTIONS.map((o) => [o.value, o.label])
)

/** 肤色 5 档(roadmap 拍板):swatch 为示意肤底色卡,浅到深。 */
export const SKIN_TONE_OPTIONS = [
  { value: 'light', label: '浅', swatch: '#f3d4c0' },
  { value: 'light_medium', label: '浅中', swatch: '#e4b194' },
  { value: 'medium', label: '中', swatch: '#c88f70' },
  { value: 'tan', label: '小麦', swatch: '#a06a4e' },
  { value: 'deep', label: '深', swatch: '#613b2a' }
]

export const SKIN_TONE_CN = Object.fromEntries(
  SKIN_TONE_OPTIONS.map((o) => [o.value, o.label])
)

// 天气没有可选项,故不在此处:填城市 → 实拉 GET /weather(见 api/weather.js)。
