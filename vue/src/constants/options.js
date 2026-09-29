/**
 * constants/options.js —— 上传表单/结果回显共用的可选项与中文名。
 * value 与后端契约(meta 里的 occasion/skinType/skinTone 枚举)保持一致,
 * 只做展示层,不在前端二次建模。
 *
 * ⚠️ 这里的 `label` 是**表单选项文案**(「面试 / 终面」这种带补充说明的长标签),
 * 与场合语义里的短中文名(`SCENE_RULES[x].cn` = 「面试」,见 `@scene-rules`)是两回事:
 * 前者只在下拉/chip 与回显里出现,后者进文案。**判定逻辑不在这里**,
 * 别把关键词表加回来——那是 `@scene-rules` 的活。
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

/**
 * 肤色 8 档,浅 → 深。
 *
 * ★ **逐字照抄 `assests/face-catalog/skin-tones.json`**:`value` = 那边的 `tones[].id`,
 *   `label` / `swatch` 也一并照抄。改档位要改**两处**(那个 JSON + 这里)。
 * ⚠️ **这份拷贝没有任何东西盯着**(前端零类型、零测试)——但它的坏法不是静默的:
 *   `value` 写错服务端会 422(`z.enum(SKIN_TONES)` 挡下),用户会看到明确报错。
 * ★ `swatch` 是真实肤底色,红线 §8-1:不许调成「更白更好看」。
 */
export const SKIN_TONE_OPTIONS = [
  { value: 'cool_porcelain', label: '冷白皮·冷调', swatch: '#f6e7e1' },
  { value: 'pink_porcelain', label: '粉一白·冷调', swatch: '#f7e3df' },
  { value: 'warm_ivory', label: '黄一白·暖调', swatch: '#f0dcc0' },
  { value: 'warm_beige', label: '黄二白·暖调', swatch: '#e8cfae' },
  { value: 'olive', label: '橄榄皮·橄榄调', swatch: '#d9c79e' },
  { value: 'warm_tan', label: '黄黑皮·暖调', swatch: '#c79a6b' },
  { value: 'wheat', label: '小麦色·暖调', swatch: '#bd8f62' },
  { value: 'deep_brown', label: '深棕皮·中性偏暖', swatch: '#8a5f44' }
]

export const SKIN_TONE_CN = Object.fromEntries(
  SKIN_TONE_OPTIONS.map((o) => [o.value, o.label])
)

// 天气没有可选项,故不在此处:填城市 → 实拉 GET /weather(见 api/weather.js)。
