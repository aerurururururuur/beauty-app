/**
 * domain/schemas/job-submit.ts —— 提交任务入参的「形状/契约」(zod,无行为)。
 * 只声明结构:
 *   - 文件:本人照片(face)、可选风景参考图(scene*)与类型范围(image/*);
 *   - 标量:结构化需求简报打包在一个 JSON 字段 metaRaw 里(occasion/肤质肤色/穿搭/天气/自由文字),
 *         避免把 8 个标量铺成 8 个 multipart part。
 *
 * ★ 跨字段业务规则(至少一个风格信号)、JSON 解析与清洗、FACE_REQUIRED /
 *   CONTEXT_REQUIRED / SCENES_* 语义错误码等「校验行为」一律放在
 *   domain/validator/job-submit.validator.ts,这里不做动作、不写 refine/transform。
 */
import { z } from 'zod';
import { OCCASIONS, SKIN_TONES, SKIN_TYPES } from '../../../shared/index.js';

/** 风景参考图上限(形状参数之一;可选,不驱动风格)。 */
export const MAX_SCENES = 6;
/** 自由文字(场景文字)上限(字)。 */
export const MAX_SCENE_TEXT = 2000;
/** 穿搭一句话描述上限(字)。 */
export const MAX_DRESS = 80;
/** meta JSON 原文上限(含 sceneText 等,给足余量)。 */
export const MAX_META_RAW = 8000;

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

/** 需求简报的形状(occasion/肤质/肤色/穿搭/天气/自由文字)。 */
export const metaSchema = z
  .object({
    occasion: z.enum(OCCASIONS).optional(),
    sceneText: z.string().max(MAX_SCENE_TEXT, `场景文字最多 ${MAX_SCENE_TEXT} 字`).optional(),
    skinType: z.enum(SKIN_TYPES).optional(),
    skinTone: z.enum(SKIN_TONES).optional(),
    dress: z.string().max(MAX_DRESS, `穿搭描述最多 ${MAX_DRESS} 字`).optional(),
    weather: z
      .object({
        condition: z.string().max(20, '天气描述最多 20 字').optional(),
        temperatureC: z.number().int().min(-40).max(60).optional(),
        humidityPct: z.number().int().min(0).max(100).optional(),
        uvIndex: z.number().int().min(0).max(15).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** 提交入参的形状(结构合法与否;数组数量/风格信号等业务判断在 validator)。 */
export const jobSubmitSchema = z
  .object({
    faces: z.array(fileInfoSchema),
    scenes: z.array(fileInfoSchema),
    /** 结构化标量(JSON 字符串):occasion / 肤质肤色 / 穿搭 / 天气 / sceneText。 */
    metaRaw: z.string().max(MAX_META_RAW, `meta 过长`).optional(),
  })
  .strict();

/** 通过形状校验的入参形状(multipart 解析后的标量,不含流)。 */
export type JobSubmitRaw = z.output<typeof jobSubmitSchema>;
/** 通过 metaSchema 的简报(仍需 trim 清洗,见 validator)。 */
export type MetaScalar = z.output<typeof metaSchema>;
