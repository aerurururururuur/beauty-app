/**
 * presentation/error-handler.ts —— 错误码 → HTTP 映射(唯一状态码映射处)。
 * 领域错误不带 HTTP 概念;路由/其它框架错误按其 statusCode 保留。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../domain/errors/app-error.js';
import type { ErrorCodeValue } from '../domain/errors/app-error.js';

// ⚠️ `Record<ErrorCodeValue, number>` 是**完备性约束**:`ErrorCode` 里加一个成员而这里漏配,
//    编译不过。所以下面这张表与 `domain/errors/app-error.ts` 是一对,两边一起改。
// ✏️ 2026-09-29:删掉六个没有抛出点的码(见 `app-error.ts` 的注释)。
const STATUS_BY_CODE: Record<ErrorCodeValue, number> = {
  LOCATION_REQUIRED: 422,
  CITY_NOT_FOUND: 404,
  // 上游天气源挂了:网关类错误,说明白就行,**不阻塞提交**——没有"手动预设"可回落,
  // 拉不到就是不带天气(红线 §8-4，前端 `clearWeather()` 后整块省掉 `brief.weather`)。
  WEATHER_UNAVAILABLE: 502,
  USER_NOT_FOUND: 404,
  NICKNAME_TAKEN: 409,
  // 「用户不存在」与「密码错」共用 401,不外泄账号是否存在,避免昵称枚举。
  INVALID_CREDENTIALS: 401,
  // 账号在、头像不在:同样是"取的东西不存在"(同 PERSONA_PHOTO_NOT_FOUND)。
  USER_AVATAR_NOT_FOUND: 404,
  // 衣橱条目的「不存在」与「不属于你」共用 404:同样不外泄"这条存在但不是你的"。
  CABINET_ITEM_NOT_FOUND: 404,
  // 单用户件数上限:JSON 单表是整表读改写,不设上限会越写越慢。
  CABINET_FULL: 409,
  // 人设的「不存在」与「不是你的」共用 404,同 CABINET_ITEM_NOT_FOUND 的理由。
  PERSONA_NOT_FOUND: 404,
  // 单用户人设上限,同 CABINET_FULL。
  PERSONA_FULL: 409,
  // 人设在、照片不在:同样是"取的东西不存在"。
  PERSONA_PHOTO_NOT_FOUND: 404,
  // 自建肤色档的「不存在」与「不是你的」共用 404,同 PERSONA_NOT_FOUND 的理由。
  SKIN_TONE_NOT_FOUND: 404,
  // 单账号自建档上限,同 PERSONA_FULL。
  SKIN_TONE_FULL: 409,
  // 还有人在用这一档:这不是请求格式问题,是**当前状态不允许**(同 CABINET_FULL 那条语义)。
  SKIN_TONE_IN_USE: 409,
  // 自建特征的「不存在」与「不是你的」共用 404,同 SKIN_TONE_NOT_FOUND 的理由。
  CUSTOM_FEATURE_NOT_FOUND: 404,
  // 单账号自建特征条数上限,同 PERSONA_FULL。
  CUSTOM_FEATURE_FULL: 409,
  // 还有人在用这一条特征,同上一条 SKIN_TONE_IN_USE 的语义。
  CUSTOM_FEATURE_IN_USE: 409,
  // 会话的「不存在」与「不是你的」共用 404,同 CABINET_ITEM_NOT_FOUND 的理由。
  SESSION_NOT_FOUND: 404,
  // 会话是我的、但这个序号的图不在:同样是"取的东西不存在"。
  RENDER_NOT_FOUND: 404,
  // 产品库里没有这个 id。★ 与上面几条不同:产品库是**品牌内容**、不挂账号,
  //   所以这个码里没有"还是不是你的"那层意思,就是纯粹查不到。
  PRODUCT_NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
};

/**
 * 框架错误的码 → 中文。★ 这些 message **会原样出现在界面上**(前端把 message 打在输入框旁边),
 * 而 fastify / @fastify/multipart 给的是英文原文。漏一个码就是漏一句英文,
 * 所以下面那条 default 比这张表本身更要紧。
 */
const FRAMEWORK_MESSAGE_BY_CODE: Record<string, string> = {
  // 请求体越过路由的 bodyLimit(头像那条是 4 MiB,见 users.route.ts)。
  FST_ERR_CTP_BODY_TOO_LARGE: '提交的内容太大了,请把图片缩小一些再试',
  // multipart 的单个文件越过 MAX_UPLOAD_MB(agent 那两条口)。
  FST_REQ_FILE_TOO_LARGE: '照片太大了,请换一张小一点的',
  FST_ERR_CTP_EMPTY_JSON_BODY: '请求体是空的',
  // ★ 别写成「不是合法的 JSON」:JSON / content-type 这些词对用户是天书,同 `user.validator.ts`
  //   里那条「不把 JSON 字段名念给用户听」。
  FST_ERR_CTP_INVALID_JSON_BODY: '请求体的格式不对',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: '不认识这种请求格式',
};

export type AppLogger = { error(err: unknown): void };

export function makeErrorHandler(log: AppLogger) {
  return function errorHandler(err: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const code = err instanceof AppError ? err.code : null;
    if (code) {
      const details = (err as AppError).details;
      void reply.code(STATUS_BY_CODE[code]).send({
        error: { code, message: (err as AppError).message, ...(details !== undefined ? { details } : {}) },
      });
      return;
    }

    // 框架级错误(如文件超限 413):保留其原状态码,message 换成中文。
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const framework = err as { statusCode: number; code?: string };
      const known = framework.code ? FRAMEWORK_MESSAGE_BY_CODE[framework.code] : undefined;
      // 认不出来的把原文留在日志里 —— 界面上那几句必须全是中文,排查的线索不该跟着一起丢。
      if (!known) log.error(err);
      void reply.code(framework.statusCode).send({
        error: { code: 'HTTP_ERROR', message: known ?? '请求不合法,请换个方式再试' },
      });
      return;
    }

    log.error(err);
    void reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务内部错误' } });
  };
}
