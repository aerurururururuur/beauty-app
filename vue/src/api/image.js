/**
 * api/image.js —— 浏览器里的图片处理(**纯函数,不碰 axios、不碰 store**)。
 * ✏️ 2026-10-01 从 `api/personas.js` 搬来:人设照片与账号头像都要先缩图再送上去。
 *   `api/personas.js` 里留了一条转发(既有调用方不改 import 路径),新代码引这里。
 *
 * ★ 缩图的理由不是「省流量」,是**服务端的请求上限**:一次 JSON 请求收 1 MiB 字节 / 2 MiB dataURL,
 *   超了是 422(`photo.validator.ts`),而不是被谁悄悄截断。
 * ★ 拿不到 canvas 时**原样返回原图** —— 宁可被服务端挡回来,也不要静默换成空字符串。
 */

/** 照片送上去之前会缩到这个长边(px)。调大 = 更清晰但请求更大。 */
export const PHOTO_MAX_EDGE = 640
/** 缩放后的 JPEG 质量。0.82 在「看得出是谁」和「够小」之间。 */
export const PHOTO_QUALITY = 0.82

/** 把选的照片缩到长边 ≤640 的 JPEG dataURL。**本机处理。** */
export async function shrinkPhoto(file) {
  const dataUrl = await readAsDataUrl(file)
  if (typeof document === 'undefined') return dataUrl
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height))
    if (scale >= 1) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
  } catch {
    return dataUrl
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('这张照片读不出来，换一张试试'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}
