/**
 * infrastructure/vision/dashscope-vision.ts —— 百炼(DashScope)多模态适配器。
 * **本文件是 `vision.ts` 端口存在的全部理由**:三个分析器只认「图 + 一句话 → 一段文本」。
 *
 * 形状照抄 `agent/infrastructure/llm/dashscope-llm.ts`:同 `baseUrl`、同 `/chat/completions`、
 * 同鉴权头、同重试判据(`../connect-retry.ts`,与出图共用那一份)。
 *
 * ⚠️ **多模态请求体的确切形状 `[未验证]`。** 依据**不是文档**(官方文档站在开发环境被网络策略
 * 拦过),而是 OpenAI 兼容模式那份通行的形状 —— 也就是说这里**没有**像 `dashscope-llm.ts`
 * 那样实测过。`scripts/probe-vision.ts` 就是为定这件事写的,**尚未跑过**。
 * 下面三处标了 `[未验证]` 的都要靠它定:content 分片形状、图片在文本前还是后、
 * 回复是不是 `message.content` 字符串。
 *
 * ★ 绝不打印 `apiKey` 的值 —— 日志里只有长度与掩码前缀(与两个既有适配器同一条规矩)。
 */
import { readFileSync } from 'node:fs';
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { ResolvedImage } from '../../../shared/index.js';
import type { VisionClient, VisionRequest } from '../../domain/ports/vision.js';
import { describeError, isConnectPhaseError, sleep } from '../connect-retry.js';

export interface DashScopeVisionOptions {
  apiKey: string;
  /** 形如 `https://dashscope.aliyuncs.com/compatible-mode/v1`(**不带**尾斜杠)。 */
  baseUrl: string;
  /** 视觉模型名。 */
  model: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const ATTEMPTS = 3;

/**
 * 本机文件 → `data:` URL。
 *
 * ⚠️ 与 `engine/qwen-request.ts` 的 `toImageField` 是**两个函数**,不是重复:
 *   那个从**扩展名**推 mime(引擎只拿到路径),这个用 `ResolvedImage.mimeType`
 *   (上传口已经验过它)。合并就得让其中一个接受"mime 从哪来"这种参数。
 */
function toDataUrl(image: ResolvedImage): string {
  return `data:${image.mimeType};base64,${readFileSync(image.filePath).toString('base64')}`;
}

/**
 * 回复正文。
 * ⚠️ `[未验证]`:兼容模式通常回 `content` 为**字符串**,分片数组是防御性的一支。
 *   两支都拿不到文本时返回空串,由调用方报错 —— 不在这里编一个空答案。
 */
function replyTextOf(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('');
  }
  return '';
}

export class DashScopeVision implements VisionClient {
  readonly name: string;

  constructor(private readonly opts: DashScopeVisionOptions) {
    this.name = `dashscope:${opts.model}`;
  }

  async ask(request: VisionRequest): Promise<string> {
    // ⚠️ `[未验证]` 图片排在文本**之前**:提问里说的"这张图"指的就是它们,
    //   先给指称物再给问题。顺序算不算语义,由探针定。
    const body = {
      model: this.opts.model,
      messages: [
        {
          role: 'user',
          content: [
            ...request.images.map((image) => ({
              type: 'image_url',
              image_url: { url: toDataUrl(image) },
            })),
            { type: 'text', text: request.prompt },
          ],
        },
      ],
    };

    const json = await this.postJson(body);
    const choices = (json as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, '读图响应里没有 choices');
    }
    const choice = choices[0] as { message?: unknown; finish_reason?: unknown };
    const message =
      choice.message && typeof choice.message === 'object'
        ? (choice.message as Record<string, unknown>)
        : {};

    // ★ 截断要单独说清。不判这一条的话,半个 JSON 会在下一层被读成"模型没按格式回答",
    //   排查的人会去改提示词,而真正的原因是 max_tokens 不够。
    if (choice.finish_reason === 'length') {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        '读图回复被截断(finish_reason=length):答案不完整,不能拿来当读数。',
      );
    }
    const text = replyTextOf(message);
    if (text.trim() === '') {
      throw new AppError(ErrorCode.INTERNAL_ERROR, '读图回复是空的(没拿到任何文本)。');
    }
    return text;
  }

  /** 发请求,带**连接阶段**重试。判据与出图完全一致(见 `../connect-retry.ts`)。 */
  private async postJson(body: unknown): Promise<unknown> {
    const url = `${this.opts.baseUrl}/chat/completions`;

    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            // ★ 永不打印 key 的值。
            Authorization: `Bearer ${this.opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });

        const text = await res.text();
        if (!res.ok) {
          // 鉴权失败 / 限流 / 5xx。**不重试**:不是连接抖动,再撞三次只会更糟。
          throw new AppError(
            ErrorCode.INTERNAL_ERROR,
            `读图返回 HTTP ${res.status}:${text.slice(0, 300)}`,
          );
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new AppError(ErrorCode.INTERNAL_ERROR, `读图响应不是 JSON:${text.slice(0, 300)}`);
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (attempt < ATTEMPTS && isConnectPhaseError(err)) {
          const wait = 1000 * 2 ** (attempt - 1);
          console.warn(
            `[makeup] 读图连接阶段错误,${wait}ms 后重试(${attempt}/${ATTEMPTS - 1}):` +
              describeError(err),
          );
          await sleep(wait);
          continue;
        }
        throw new AppError(ErrorCode.INTERNAL_ERROR, `读图请求失败:${describeError(err)}`);
      }
    }
  }
}
