/**
 * jobs/domain/entities/error.ts —— 任务失败时记录的领域错误。
 * 无 HTTP 概念(状态码映射在 shared/presentation/error-handler.ts);code 为错误码字符串。
 */
export interface JobError {
  code: string;
  message: string;
}
