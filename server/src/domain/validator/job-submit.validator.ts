/**
 * domain/validator/job-submit.validator.ts —— 提交任务入参的校验行为。
 * 真正被 presentation / application 调用的对象:
 *   ① 用 jobSubmitSchema(纯形状)检查结构是否合法(类型、image/*、长度等);
 *   ② 执行形状表达不了的业务规则,映射成语义错误码:
 *      FACE_REQUIRED / VALIDATION_ERROR(多于一张本人照) /
 *      SCENES_MAX_EXCEEDED / SCENES_REQUIRED;
 *   ③ 清洗并产出可直接落库的 SubmitJobInput(face 恰好一张、sceneText 已 trim)。
 */
import { AppError, ErrorCode } from '../errors/app-error.js';
import {
  jobSubmitSchema,
  MAX_SCENES,
  type JobSubmitRaw,
  type UploadFileMeta,
} from '../schemas/job-submit.js';
import { zodIssuesMessage } from './validate.js';

/** 通过校验、可交给用例/仓库使用的输入标量。 */
export interface SubmitJobInput {
  face: UploadFileMeta;
  scenes: UploadFileMeta[];
  sceneText?: string;
}

/** 校验提交入参;不合法抛带业务错误码的 AppError,合法返回清洗后的输入。 */
export function validateSubmitJob(raw: JobSubmitRaw): SubmitJobInput {
  // ① 形状
  const parsed = jobSubmitSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, zodIssuesMessage(parsed.error), {
      issues: parsed.error.issues,
    });
  }
  const v = parsed.data;
  const sceneText = (v.sceneText ?? '').trim();

  // ② 业务规则(错误码可被上层精确映射成 HTTP 语义)
  if (v.faces.length === 0) {
    throw new AppError(ErrorCode.FACE_REQUIRED, '请上传本人照片(face)');
  }
  if (v.faces.length > 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '本人照片只能上传一张(face)');
  }
  if (v.scenes.length > MAX_SCENES) {
    throw new AppError(ErrorCode.SCENES_MAX_EXCEEDED, `风景图最多 ${MAX_SCENES} 张`);
  }
  if (v.scenes.length === 0 && sceneText.length === 0) {
    throw new AppError(ErrorCode.SCENES_REQUIRED, '请至少提供一张风景图或一段场景文字');
  }

  // ③ 清洗
  return {
    face: v.faces[0]!,
    scenes: v.scenes,
    sceneText: sceneText.length > 0 ? sceneText : undefined,
  };
}
