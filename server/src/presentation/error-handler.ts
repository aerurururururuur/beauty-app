/**
 * presentation/error-handler.ts —— 错误码 → HTTP 映射(唯一状态码映射处)。
 * 领域错误不带 HTTP 概念;路由/其它框架错误按其 statusCode 保留。
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../domain/errors/app-error.js';
import type { ErrorCodeValue } from '../domain/errors/app-error.js';

const STATUS_BY_CODE: Record<ErrorCodeValue, number> = {
  JOB_NOT_FOUND: 404,
  JOB_NOT_READY: 409,
  JOB_FAILED: 409,
  FACE_REQUIRED: 422,
  CONTEXT_REQUIRED: 422,
  SCENES_MAX_EXCEEDED: 422,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
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

    // 框架级错误(如文件超限 413):保留其原状态码与信息。
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const framework = err as { statusCode: number; message?: string };
      void reply.code(framework.statusCode).send({
        error: { code: 'HTTP_ERROR', message: framework.message ?? '请求不合法' },
      });
      return;
    }

    log.error(err);
    void reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务内部错误' } });
  };
}
