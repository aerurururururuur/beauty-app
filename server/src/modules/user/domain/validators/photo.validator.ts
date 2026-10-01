/**
 * domain/validators/photo.validator.ts —— 图片 dataURL 的解码与体积/类型上限。
 *
 * ✏️ 2026-10-01 从 `persona.validator.ts` 原样搬出(人设照片与账号头像现在共用它)。
 * 两个消费者都在本模块内,所以**留在这里而不上提 shared** —— 没有第二个模块要解码图片。
 *
 * ★★ 仍然**全项目唯一一份解码器**:任何要落盘 / 送模型的图片都走 `dataUrlToBytes`,
 *   别写第二个(组装根接读脸端口那条也走它,见 `src/index.ts`)。
 * ⚠️ 路由上的 `bodyLimit` 必须**比 `MAX_PHOTO_DATAURL` 更大**,否则先到的是框架那句英文 413。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';

/** 照片解码后的字节上限(1 MiB)。 */
export const MAX_PHOTO_BYTES = 1024 * 1024;
/**
 * 照片 dataURL **字符串**上限(2 MiB),解码前先判。必须比 `MAX_PHOTO_BYTES` 松(base64 放大 4/3)。
 */
export const MAX_PHOTO_DATAURL = 2 * 1024 * 1024;

/** 认的图片类型。★ 与浏览器 `canvas.toDataURL('image/jpeg')` 的产出对齐,不多认。 */
export const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * mime → 落盘扩展名(人设照片与账号头像的字节库共用这一份)。
 * ★ 键必须与 `PHOTO_MIME` 逐一对齐:少一个,那种照片会写不进去;多一个,落盘行里的 mime 会被判不认识。
 */
export const PHOTO_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** dataURL 的头:`data:<mime>;base64,`。 */
const DATA_URL_PREFIX = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i;
/** base64 载荷的字符集(含尾部 padding)。先验字符集: `Buffer.from(s,'base64')` 会静默丢掉非法字符。 */
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]*={0,2}$/;

/** 一次 base64 dataURL 的解码结果。 */
export interface DecodedPhoto {
  mime: string;
  bytes: Buffer;
}

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/**
 * 解码一个图片 dataURL。
 * 检查顺序从便宜到贵(长度 → 头/mime → 字符集 → 真解码 → 字节数),免得 10 MB 载荷先被解出来再拒。
 */
export function dataUrlToBytes(dataUrl: string): DecodedPhoto {
  if (dataUrl.length > MAX_PHOTO_DATAURL) {
    fail(`照片太大了(最多 ${Math.round(MAX_PHOTO_BYTES / 1024)} KB),请换一张小一点的`);
  }

  const head = DATA_URL_PREFIX.exec(dataUrl);
  if (!head) fail('照片格式不对:需要 data:image/... 开头的 base64 图片');
  const mime = (head[1] ?? '').toLowerCase();
  if (!(PHOTO_MIME as readonly string[]).includes(mime)) {
    fail(`照片类型不支持(收到 ${mime});只认 ${PHOTO_MIME.join(' / ')}`);
  }

  const payload = dataUrl.slice(head[0].length);
  if (payload.length === 0) fail('照片是空的,请重新选一张');
  if (!BASE64_PAYLOAD.test(payload)) fail('照片不是合法的 base64 编码');

  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) fail('照片是空的,请重新选一张');
  if (bytes.length > MAX_PHOTO_BYTES) {
    fail(`照片太大了(最多 ${Math.round(MAX_PHOTO_BYTES / 1024)} KB),请换一张小一点的`);
  }

  return { mime, bytes };
}
