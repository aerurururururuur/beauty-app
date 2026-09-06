// 将 [r, g, b] 转为十六进制色值，如 rgbToHex([182,26,30]) → '#b61a1e'
export function rgbToHex(rgb) {
  const [r = 0, g = 0, b = 0] = rgb || []
  const to = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// 将 [r, g, b] 转为 rgba() 字符串
export function rgbCss(rgb, alpha = 1) {
  const [r = 0, g = 0, b = 0] = rgb || []
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// 感知亮度（0-1），用于文案里判断色号深浅
export function rgbLuminance(rgb) {
  const [r = 0, g = 0, b = 0] = rgb || []
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
