/**
 * domain/schemas/job-submit.ts —— 提交任务入参的「形状/契约」(zod,无行为)。
 * 只声明结构:本人照片若干、风景图若干、可选场景文字,并给每个文件规定类型范围
 * (须为 image/*)与文字长度上限。
 *
 * ★ 跨字段业务规则(至少一个场景)、FACE_REQUIRED / SCENES_* 语义错误码、
 *   文字清洗(trim)等「校验行为」一律放在 domain/validator/job-submit.validator.ts,
 *   这里不做动作、不写 refine/transform。
 */
import { z } from 'zod';

/** 风景图上限(形状参数之一)。 */
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

/** 提交入参的形状(结构合法与否;数组数量/依赖等业务判断在 validator)。 */
export const jobSubmitSchema = z
  .object({
    faces: z.array(fileInfoSchema),
    scenes: z.array(fileInfoSchema),
    sceneText: z.string().max(MAX_SCENE_TEXT, `场景文字最多 ${MAX_SCENE_TEXT} 字`).optional(),
  })
  .strict();

/** 通过形状校验的入参形状(multipart 解析后的标量,不含流)。 */
export type JobSubmitRaw = z.output<typeof jobSubmitSchema>;
