/**
 * infrastructure/engine/qwen-request.ts —— 「一次生成请求」的**唯一**组装处 + 它的夹具键。
 *
 * ★ **为什么单独一个文件,而不是写进 `image-engine.ts` 里。**
 * record/replay 的全部价值建立在一条上:**录像与回放算出的键必须逐位相同**。
 * 若录像侧与回放侧各写一遍请求组装,两边迟早会漂(改了一处忘另一处),
 * 而漂移的表现是"回放永远未命中"——**看起来像夹具没录,其实是键算错了**。
 * 所以组装只有这一份,两个引擎都调它。
 *
 * ★ 键的输入**刻意不含任何本机路径**。夹具要能跨机器、跨目录复用:
 *   路径进键 = 换台机器全部未命中。参与计算的是**图片字节的 sha256 与长度**。
 *
 * 形状依据:阿里云百炼《千问-图像编辑 API 参考》,
 * 2026-09-15 用 curl 取原文核对过(见 `scripts/qwen-image-makeup.ts` 文件头)。
 * ⚠️ 官方文档站(`help.aliyun.com`)在开发环境**被网络策略拦截**,
 * 所以这里的形状来自那份 curl 原文 + 脚本实测,不是随时可复查的。
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { EngineInput } from '../../domain/ports/engine.js';
import { TEMPLATE_VERSION, buildPrompt } from './prompt-builder.js';

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
  /** 参与键计算的输入摘要。**不含路径**(见文件头 ★)。 */
  inputDigests: { role: 'reference' | 'face'; sha256: string; bytes: number }[];
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

/** 图片字节摘要。**这是夹具键里唯一与"是哪张图"有关的部分。** */
function digestOf(filePath: string): { sha256: string; bytes: number } {
  const buf = readFileSync(filePath);
  return { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
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
    //   所以宁可明确失败。**这条后果是 §8.1 的直接产物**:`jobs` 表单路径从不传 LookSpec,
    //   因此**表单路径在 `MAKEUP_ENGINE=image` 下不可用**(见 `modules/makeup/README.md`)。
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      '本引擎需要妆面单(LookSpec),而这次调用没有传。' +
        '它只能由对话 agent 路径调用;表单路径请把 MAKEUP_ENGINE 设回 mock。',
    );
  }

  const { prompt, negativePrompt } = buildPrompt(spec, {
    ...(input.brief?.skinTone ? { skinTone: input.brief.skinTone } : {}),
  });

  const faceDigest = digestOf(input.face.filePath);

  // ★ 参考图按 URL 直传(它们是热链,**没有落到本地**——见 references 模块 README 的「已知代价」)。
  //   ⚠️ `[未验证]`:带参考图的请求**没有真实跑过**。agent 路径不传 references,
  //      所以这条分支目前只在理论上成立。
  const refUrls = (input.references ?? [])
    .map((r) => r.imageUrl)
    .slice(0, MAX_IMAGES - 1);

  const images: { image: string }[] = refUrls.map((url) => ({ image: url }));

  // ★ **顺序有讲究:最后一张决定输出比例**,所以本人照片必须压轴(§5.3 坑 1)。
  //   反过来放会让输出尺寸跟着参考图走。
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
    inputDigests: [
      ...refUrls.map((url) => ({
        role: 'reference' as const,
        // 参考图是 URL,没有字节可摘要;把它本身当"字节"的替身。
        sha256: createHash('sha256').update(url).digest('hex'),
        bytes: 0,
      })),
      { role: 'face' as const, ...faceDigest },
    ],
  };
}

/**
 * 夹具键。**把"是什么请求"压成一个文件名。**
 *
 * 参与计算的是:模板版本 + 模型 + 提示词 + 反向提示词 + 参数 + 输入图摘要。
 * ⚠️ **`parameters` 里含 `n`**:改出图张数就是另一个请求,不能命中同一份夹具。
 * ⚠️ **键里没有 `createdAt` / 路径 / 主机名**——否则换台机器全部未命中。
 */
export function fixtureKeyOf(req: GenerateRequest): string {
  const canonical = JSON.stringify({
    templateVersion: TEMPLATE_VERSION,
    model: req.model,
    prompt: req.prompt,
    negativePrompt: req.negativePrompt,
    parameters: req.body.parameters,
    inputs: req.inputDigests,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
