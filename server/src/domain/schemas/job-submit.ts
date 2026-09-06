/**
 * domain/schemas/job-submit.ts —— 提交任务入参的运行时校验(zod)。
 * multipart 解析(见 presentation/multipart.ts)先按「字段名/文件元数据」整理成纯数据,
 * 这里统一校验:本人照片 1 张、风景图 ≤ MAX_SCENES 张且为 image/*、场景文字长度限制,
 * 并保证「风景图或文字至少其一」。校验通过的形状再配回 stream 交给 SubmitJob 用例。
 * 类型推导由 zod 提供,UI 契约见 domain/api。
 */
import { z } from 'zod';

/** 风景图上限。 */
export const MAX_SCENES = 6;
/** 场景文字上限(字)。 */
export const MAX_SCENE_TEXT = 2000;

export interface UploadFileMeta {
  originalName: string;
  mimeType: string;
}

const fileInfoSchema = z
  .object({
    originalName: z.string().min(1, '文件名缺失'),
    mimeType: z.string().regex(/^image\//, '仅接受图片文件(image/*)'),
  })
  .strict();

/** multipart 解析后的标量入参(不含流)。 */
export const jobSubmitSchema = z
  .object({
    faces: z.array(fileInfoSchema).min(1, '请上传本人照片(face)').max(1, '本人照片只能上传一张'),
    scenes: z.array(fileInfoSchema).max(MAX_SCENES, `风景图最多 ${MAX_SCENES} 张`),
    sceneText: z
      .string()
      .max(MAX_SCENE_TEXT, `场景文字最多 ${MAX_SCENE_TEXT} 字`)
      .optional(),
  })
  .strict()
  .refine((v) => v.scenes.length > 0 || (v.sceneText?.trim().length ?? 0) > 0, {
    message: '请至少提供一张风景图或一段场景文字',
    path: ['scenes'],
  })
  .transform((v) => ({
    face: v.faces[0]!,
    scenes: v.scenes,
    sceneText: v.sceneText && v.sceneText.trim().length > 0 ? v.sceneText.trim() : undefined,
  }));

/** 通过校验后的输入形状(scalars)。 */
export type JobSubmitScalars = z.output<typeof jobSubmitSchema>;

/** 把 zod 错误转成可读中文。 */
export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '请求'}: ${issue.message}`)
    .join('; ');
}
