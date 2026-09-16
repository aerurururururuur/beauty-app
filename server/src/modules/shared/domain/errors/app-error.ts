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
  /** 对话会话不存在(**或不属于该用户**——两者共用,不外泄存在性,同 CABINET_ITEM_NOT_FOUND)。 */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /**
   * 会话是本人的,但里面没有这个序号的图。
   * ★ 与 `SESSION_NOT_FOUND` **分开**:归属校验在前(那一步报的是会话不存在),
   * 走到这里说明"会话确实是我的,只是我没有第 3 张图"——这是两件不同的事,
   * 合成一个码会让排查的人分不清是越权还是序号写错了。
   */
  RENDER_NOT_FOUND: 'RENDER_NOT_FOUND',
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
