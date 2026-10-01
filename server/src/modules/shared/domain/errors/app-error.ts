/**
 * domain/errors/app-error.ts —— 领域错误基类与错误码。
 * 本类不携带 HTTP 状态码;状态码映射集中在 presentation/error-handler.ts。
 */
/**
 * ✏️ 2026-09-29:删掉六个**没有任何抛出点**的错误码——`JOB_NOT_FOUND` / `JOB_NOT_READY` /
 * `JOB_FAILED` / `FACE_REQUIRED` / `CONTEXT_REQUIRED` / `SCENES_MAX_EXCEEDED`。
 * 它们的抛出点全在 `jobs` 模块里,随模块一起没了;留下来的是**一份还带着 HTTP 状态码映射的
 * 空声明**,读起来像"这条路由还在"。同 `presentation/error-handler.ts` 一并删。
 * ★ 判据:一个错误码没有抛出点 = 一段永远不会发生的对话,和假开关是同一个病。
 */
export const ErrorCode = {
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  CITY_NOT_FOUND: 'CITY_NOT_FOUND',
  WEATHER_UNAVAILABLE: 'WEATHER_UNAVAILABLE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NICKNAME_TAKEN: 'NICKNAME_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /**
   * 账号**在**、但它没有头像。★ 与 `USER_NOT_FOUND` 分开的理由同 `PERSONA_PHOTO_NOT_FOUND`:
   *   那时候回「桃妆账号不存在」是与事实相反的一句话,而这句 message 前端会原样上屏。
   */
  USER_AVATAR_NOT_FOUND: 'USER_AVATAR_NOT_FOUND',
  CABINET_ITEM_NOT_FOUND: 'CABINET_ITEM_NOT_FOUND',
  CABINET_FULL: 'CABINET_FULL',
  /** 人设不存在(**或不属于该用户**——两者共用,不外泄存在性,同 CABINET_ITEM_NOT_FOUND)。 */
  PERSONA_NOT_FOUND: 'PERSONA_NOT_FOUND',
  /** 单用户人设上限:同 `CABINET_FULL`,JSON 单表整表读改写,不设上限会越写越慢。 */
  PERSONA_FULL: 'PERSONA_FULL',
  /**
   * 人设**在**、但它没有存在服务端的照片(还是示例静态图,或者压根没传)。
   * ★ 与 `PERSONA_NOT_FOUND` 分开:那时候回「没有这份人设」是与事实相反的一句话,
   *   而这句 message 前端会原样上屏。
   */
  PERSONA_PHOTO_NOT_FOUND: 'PERSONA_PHOTO_NOT_FOUND',
  /** 自建肤色档不存在(**或不属于该用户**——两者共用,不外泄存在性)。 */
  SKIN_TONE_NOT_FOUND: 'SKIN_TONE_NOT_FOUND',
  /** 单账号自建档上限:同 `PERSONA_FULL`,JSON 单表整表读改写。 */
  SKIN_TONE_FULL: 'SKIN_TONE_FULL',
  /**
   * 还有人在用这一档,不给删。
   * ★ 这条**必须**报错、不许静默删:删掉之后那几份人设的 `skinTone` 会变成悬空 id,
   *   前端渲染成「未定档」+ 无色块,而且 200、日志干净(本仓头号 bug 类型)。
   */
  SKIN_TONE_IN_USE: 'SKIN_TONE_IN_USE',
  /** 自建特征不存在(**或不属于该用户**——两者共用,不外泄存在性)。 */
  CUSTOM_FEATURE_NOT_FOUND: 'CUSTOM_FEATURE_NOT_FOUND',
  /** 单账号自建特征上限:同 `PERSONA_FULL`,JSON 单表整表读改写。 */
  CUSTOM_FEATURE_FULL: 'CUSTOM_FEATURE_FULL',
  /**
   * 还有人在用这一条特征,不给删。
   * ★ 判据是**字符串相等**(人设行里存的是 `分组/原话`,不是这一行的 id),但坏法同 `SKIN_TONE_IN_USE`:
   *   静默删掉之后用户写在脸上那句话会消失,而且 200、日志干净(本仓头号 bug 类型)。
   */
  CUSTOM_FEATURE_IN_USE: 'CUSTOM_FEATURE_IN_USE',
  /** 对话会话不存在(**或不属于该用户**——两者共用,不外泄存在性,同 CABINET_ITEM_NOT_FOUND)。 */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /**
   * 会话是本人的,但里面没有这个序号的图。
   * ★ 与 `SESSION_NOT_FOUND` **分开**:归属校验在前(那一步报的是会话不存在),
   * 走到这里说明"会话确实是我的,只是我没有第 3 张图"——这是两件不同的事,
   * 合成一个码会让排查的人分不清是越权还是序号写错了。
   */
  RENDER_NOT_FOUND: 'RENDER_NOT_FOUND',
  /**
   * 产品库里没有这个 id。
   * ★ **它与上面那些"属于你吗"的码不是一类**:产品库是品牌内容,不挂在账号下,
   *   没有归属可校验(见 `products/presentation/routes/products.route.ts` 那段说明)。
   *   这条只表达"这个 id 在库里查不到"。
   */
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
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
