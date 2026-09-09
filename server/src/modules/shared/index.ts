/**
 * modules/shared —— 全局共享模块(public barrel)。
 * 唯一被依赖、不依赖任何业务模块的地基:brief 枚举单源、图片值对象、领域错误。
 * 运行配置(config)与错误码→HTTP 映射(error-handler)属于「组装/web shell」关心,
 * 只由 src/ 根(组合根)按深路径取用,不进此 barrel。
 */
export { OCCASIONS, SKIN_TONES, SKIN_TYPES } from './domain/entities/brief.js';
export type {
  MakeupBrief,
  Occasion,
  SkinTone,
  SkinType,
  WeatherInfo,
} from './domain/entities/brief.js';

export type { EngineSourceImage, ImageRef } from './domain/entities/image.js';

export { AppError, ErrorCode } from './domain/errors/app-error.js';
export type { ErrorCodeValue } from './domain/errors/app-error.js';
