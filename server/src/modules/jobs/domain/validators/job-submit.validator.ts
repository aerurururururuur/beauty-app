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
 *
 * ★ `occasion` / 肤质 / 肤色 / `sceneText` / `dress` 这五个字段的**规则**
 *   (枚举白名单 + 长度上限 + trim)不在这里、也不在 schema 里,而在
 *   `shared/domain/validators/brief-fields.validator.ts` 的 `checkBriefFields()` ——
 *   对话那条路(`patch_brief`)调的是**同一份**。schema 只声明形状(§4.2)。
 */
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { MakeupBrief } from '../../../shared/index.js';
import { checkBriefFields } from '../../../shared/index.js';
import {
  jobSubmitSchema,
  MAX_SCENES,
  metaSchema,
  type JobSubmitRaw,
  type UploadFileMeta,
} from '../schemas/index.js';
import { zodIssuesMessage } from '../../../shared/index.js';

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
  // ① 形状(结构对不对;schema 只答这个)
  const parsed = metaSchema.safeParse(obj);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `meta 字段有误:${zodIssuesMessage(parsed.error)}`, {
      issues: parsed.error.issues,
    });
  }
  // ② 规则(枚举白名单 / 长度上限 / trim)——**与对话那条路同一份实现**,不在这里重写
  const checked = checkBriefFields(parsed.data);
  if (!checked.ok) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `meta 字段有误:${checked.message}`);
  }
  // ③ `weather` 是表单独有的成员,不在共用字段里,由本模块自己收
  const brief = checked.brief;
  if (parsed.data.weather) brief.weather = { ...parsed.data.weather };
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
