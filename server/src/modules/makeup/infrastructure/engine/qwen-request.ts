/**
 * infrastructure/engine/qwen-request.ts —— 「一次生成请求」的**唯一**组装处。
 *
 * ★ **为什么单独一个文件,而不是写进 `image-engine.ts` 里。**
 *   组装是个**裸函数**:不碰网络、不读环境变量。这样"发出去的请求长什么样"
 *   能在单测里当场断言,而不必花一次钱、等一次响应才知道。
 *   接第二家图像 API 时,差异应当沉到这里,而不是让 `ImageEngine` 长出第二个厂商分支。
 *
 * 形状依据:阿里云百炼《千问-图像编辑 API 参考》,
 * 2026-09-15 用 curl 取原文核对过(见 `scripts/qwen-image-makeup.ts` 文件头)。
 * ⚠️ 官方文档站(`help.aliyun.com`)在开发环境**被网络策略拦截**,
 * 所以这里的形状来自那份 curl 原文 + 脚本实测,不是随时可复查的。
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { EngineInput } from '../../domain/ports/engine.js';
import { buildPrompt } from './prompt-builder.js';

export const GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

/** 文档:图像不超过 10MB,超了建议先压。 */
export const MAX_IMAGE_MB = 10;
/** 文档:content 里最多 3 张图(含本人照片)。 */
export const MAX_IMAGES = 3;

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.gif': 'image/gif',
};

export interface QwenRequestOptions {
  /** 形如 `https://dashscope.aliyuncs.com`(**不带**尾斜杠)。 */
  apiHost: string;
  model: string;
  /** 出图张数。无后缀模型上会被归一化成 1。 */
  n?: number;
  /** 如 `1024*1536`。不给则由接口按输入图比例推——**缺省更省心**。 */
  size?: string;
  seed?: number;
  /** 提示词智能改写。缺省开(与脚本一致)。 */
  promptExtend?: boolean;
}

/** 一次已组装好的生成请求。 */
export interface GenerateRequest {
  url: string;
  body: Record<string, unknown>;
  prompt: string;
  negativePrompt: string;
  model: string;
}

/**
 * 这个模型吃不吃 `size` / `prompt_extend` / 多图输出。
 * 文档口径:`qwen-image-edit`(无后缀)是**单图进、单图出**的简化版,传了会报错。
 * 去掉版本后缀再比,免得 `qwen-image-edit-2025-xx` 这类带日期的名字判错。
 */
export function supportsSizeParams(model: string): boolean {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '') !== 'qwen-image-edit';
}

/**
 * 本地文件 → data URL。
 *
 * ★ 走 Base64 而不是先传 OSS,理由有两条,第二条才算数:
 *   ① 少一步外部依赖;
 *   ② **照片不落到第三方存储桶**——与「用户自拍即用即删」那条隐私红线同向。
 */
function toImageField(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `引擎输入图扩展名不支持:${ext || '(无)'}(${filePath})`);
  }
  const bytes = statSync(filePath).size;
  if (bytes > MAX_IMAGE_MB * 1024 * 1024) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      `引擎输入图过大:${(bytes / 1024 / 1024).toFixed(1)}MB,接口上限 ${MAX_IMAGE_MB}MB`,
    );
  }
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

/**
 * 组装一次生成请求。
 *
 * ★ **裸函数,不碰网络、不读环境变量**——这样一个键算错的 bug 能在单测里当场撞死,
 *   而不是等到"花了钱发现回放没命中"。
 */
export function buildGenerateRequest(input: EngineInput, opts: QwenRequestOptions): GenerateRequest {
  const spec = input.lookSpec;
  if (!spec) {
    // ★ 唯一一处"引擎自己拒绝"的分支,理由要写全:
    //   没有 LookSpec = 没有任何关于"要画什么妆"的信息。此时**编一套妆是错的**——
    //   色板必须按 skinTone 与实测收窄(§6 规矩 4),而那份收窄表是占位、没有实测支撑;
    //   引擎自己造一份等于伪造一个"用户要求过的妆"。
    //   所以宁可明确失败。**这条后果是 §8.1 的直接产物**:全项目只有 `propose_look`
    //   产出 LookSpec,而它只挂在对话 agent 这条路上(见 `modules/makeup/README.md`)。
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      '本引擎需要妆面单(LookSpec),而这次调用没有传。' +
        '这条路由对话 agent 专用:妆面单只能由 propose_look 产出。',
    );
  }

  const { prompt, negativePrompt } = buildPrompt(spec, {
    ...(input.brief?.skinTone ? { skinTone: input.brief.skinTone } : {}),
    // ★ 分步出图(✏️ 2026-10-01):只画到这一步为止的部位。缺省时它不出现,
    //   于是"发出去的请求"与 v1 逐字相同(见 `prompt-builder` 的 `PromptOptions`)。
    ...(input.appliedZones ? { appliedZones: input.appliedZones } : {}),
  });

  // ★ 参考图与本人照片走**同一条**本地文件路径(`toImageField`):接口要的是 URL,
  //   而我们给的是 base64 data URL,**照片不落到第三方存储桶**(见 `toImageField`)。
  //   ⚠️ `[未验证]`:带参考图的请求**没有真实跑过**——已决定没有生产者
  //      (风格图不进引擎,见 `EngineInput.references`),所以这条分支只在理论上成立。
  const refs = input.references ?? [];
  // ★ **超上限抛错,不静默截断。** 截断掉的那张既不出现在请求里、也不出现在任何日志里,
  //   表现是"图出了,只是没照那几张参考"——正是本仓最恨的"配置错了也照跑、只有结果不对"。
  if (refs.length > MAX_IMAGES - 1) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      `参考图最多 ${MAX_IMAGES - 1} 张(接口 content 上限 ${MAX_IMAGES} 张图,含本人照片),收到 ${refs.length} 张`,
    );
  }

  const images: { image: string }[] = refs.map((r) => ({ image: toImageField(r.filePath) }));

  // ★ **顺序有讲究:最后一张决定输出比例**,所以本人照片必须压轴(§5.3 坑 1)。
  //   反过来放会让输出尺寸跟着参考图走。**新增的任何输入图都必须排在这一行之前。**
  images.push({ image: toImageField(input.face.filePath) });

  const parameters: Record<string, unknown> = { n: opts.n ?? 1, watermark: false };
  if (opts.seed !== undefined) parameters.seed = opts.seed;
  if (negativePrompt) parameters.negative_prompt = negativePrompt;
  // size / prompt_extend 只在支持的模型上出现;**在这里归一化,而不是告警后照发**
  // (§5.3 坑 2 的原话:「按模型能力归一化参数,而不是告警后照发」)。
  if (supportsSizeParams(opts.model)) {
    parameters.prompt_extend = opts.promptExtend ?? true;
    if (opts.size) parameters.size = opts.size;
  }

  return {
    url: `${opts.apiHost.replace(/\/+$/, '')}${GENERATION_PATH}`,
    body: {
      model: opts.model,
      input: { messages: [{ role: 'user', content: [...images, { text: prompt }] }] },
      parameters,
    },
    prompt,
    negativePrompt,
    model: opts.model,
  };
}
