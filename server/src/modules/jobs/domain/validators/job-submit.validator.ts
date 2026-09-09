/**
 * domain/validator/job-submit.validator.ts —— 提交任务入参的校验行为。
 * 真正被 presentation / application 调用的对象:
 *   ① 用 jobSubmitSchema(纯形状)检查文件结构是否合法(类型、image/*、数量上限等);
 *   ② 把 metaRaw(JSON 字符串)解析并用 metaSchema 校验简报形状;
 *   ③ 执行形状表达不了的业务规则,映射成语义错误码:
 *      FACE_REQUIRED / VALIDATION_ERROR(多于一张本人照) /
 *      SCENES_MAX_EXCEEDED(风景参考图可选,仍设上限) /
 *      CONTEXT_REQUIRED(既无 occasion 也无 sceneText);
 *   ④ 清洗(trim)并产出可直接落库的 SubmitJobInput(face 恰好一张)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { MakeupBrief } from '../../../shared/index.js';
import {
  jobSubmitSchema,
  MAX_SCENES,
  metaSchema,
  type JobSubmitRaw,
  type MetaScalar,
  type UploadFileMeta,
} from '../schemas/job-submit.js';
import { zodIssuesMessage } from './validate.js';

/** 通过校验、可交给用例/仓库使用的输入标量。 */
export interface SubmitJobInput {
  face: UploadFileMeta;
  scenes: UploadFileMeta[];
  brief: MakeupBrief;
}

/** 解析并校验 meta JSON 字符串 → 清洗后的 MakeupBrief;metaRaw 缺失时返回空简报。 */
function parseBrief(metaRaw: string | undefined): MakeupBrief {
  if (!metaRaw || !metaRaw.trim()) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(metaRaw);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'meta 不是合法的 JSON');
  }
  const parsed = metaSchema.safeParse(obj);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `meta 字段有误:${zodIssuesMessage(parsed.error)}`, {
      issues: parsed.error.issues,
    });
  }
  return normalize(parsed.data);
}

/** 把已过形状的简报清洗成只含有效值的 MakeupBrief(sceneText/dress trim 后空则省略)。 */
function normalize(m: MetaScalar): MakeupBrief {
  const brief: MakeupBrief = {};
  if (m.occasion) brief.occasion = m.occasion;
  if (m.skinType) brief.skinType = m.skinType;
  if (m.skinTone) brief.skinTone = m.skinTone;
  const sceneText = (m.sceneText ?? '').trim();
  if (sceneText) brief.sceneText = sceneText;
  const dress = (m.dress ?? '').trim();
  if (dress) brief.dress = dress;
  if (m.weather) brief.weather = { ...m.weather };
  return brief;
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
  const brief = parseBrief(v.metaRaw);

  // ② 业务规则(错误码可被上层精确映射成 HTTP 语义)
  if (v.faces.length === 0) {
    throw new AppError(ErrorCode.FACE_REQUIRED, '请上传本人照片(face)');
  }
  if (v.faces.length > 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '本人照片只能上传一张(face)');
  }
  if (v.scenes.length > MAX_SCENES) {
    throw new AppError(ErrorCode.SCENES_MAX_EXCEEDED, `风景参考图最多 ${MAX_SCENES} 张`);
  }
  // 风景参考图只是可选附加;风格信号必须来自 occasion 或自由文字。
  if (!brief.occasion && !brief.sceneText) {
    throw new AppError(
      ErrorCode.CONTEXT_REQUIRED,
      '请选择场合(meta.occasion)或写一段场景文字(meta.sceneText)',
    );
  }

  // ③ 输出
  return { face: v.faces[0]!, scenes: v.scenes, brief };
}
