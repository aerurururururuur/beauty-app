/**
 * domain/errors/app-error.ts —— 领域错误基类与错误码。
 * 本类不携带 HTTP 状态码;状态码映射集中在 presentation/error-handler.ts。
 */
export const ErrorCode = {
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_NOT_READY: 'JOB_NOT_READY',
  JOB_FAILED: 'JOB_FAILED',
  FACE_REQUIRED: 'FACE_REQUIRED',
  CONTEXT_REQUIRED: 'CONTEXT_REQUIRED',
  SCENES_MAX_EXCEEDED: 'SCENES_MAX_EXCEEDED',
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  CITY_NOT_FOUND: 'CITY_NOT_FOUND',
  WEATHER_UNAVAILABLE: 'WEATHER_UNAVAILABLE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NICKNAME_TAKEN: 'NICKNAME_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  CABINET_ITEM_NOT_FOUND: 'CABINET_ITEM_NOT_FOUND',
  CABINET_FULL: 'CABINET_FULL',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly details?: unknown;

  constructor(code: ErrorCodeValue, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
