/**
 * infrastructure/engine/image-engine.ts —— `Engine` 端口的**真实**实现。
 *
 * ★ **类名刻意不带厂商**:`ImageEngine` 是"真的去画一张图"的那个实现,
 *   与 `MockEngine`(骨架)、`ReplayEngine`(回放)按**行为**区分,而不是按供应商区分。
 *   接第二家图像 API 时,那里的差异应当沉到 `qwen-request.ts` 同类的位置去,
 *   而不是让本类长出第二个厂商分支。
 *
 * ★ **它是 `domain/ports/engine.ts` 的第二个实现,端口一个字节没改**(§5.1)。
 *   这是那条缝第一次真正兑现:流水线与 HTTP 仍然不认识任何具体引擎。
 *
 * 与 `scripts/qwen-image-makeup.ts` 的关系:那个脚本**不是**端口实现,是这套代码的来源。
 * §5.3 的原话是「脚本里已踩实的坑,接线时**逐条搬,不要重新发现**」。搬过来的四条:
 *
 * | # | 坑 | 这里的处置 |
 * | --- | --- | --- |
 * | 1 | 多图输入时**输出比例以最后一张为准** | 本人照片压轴(`qwen-request.ts` 里拼 content 的地方) |
 * | 2 | 无后缀 `qwen-image-edit` 不吃 `size`/`prompt_extend`/多图 | **归一化,而不是告警后照发**(`supportsSizeParams`) |
 * | 3 | 本机到阿里云的路由**是抖的** | 连接阶段错误重试;整体超时**刻意不重试**(见下) |
 * | 4 | 返回的图片 URL **只活 24 小时** | 当场下载落地,不存 URL |
 *
 * ★ **重试判据两处刻意不同,别混:**
 *   - **下载**:一律重试(下不下来就是白干,重试无副作用);
 *   - **生成**:只重试**连接阶段**错误;`AbortSignal.timeout` 触发的整体超时**刻意不重试**
 *     —— 那是"已经发出去、没等到响应",服务端**可能已经跑完并计费**了,盲目重试会重复烧钱。
 *
 * ⚠️ **本文件不做任何像素级判断。** 它不管妆好不好看、像不像本人——那是 §12.1 实测打分的活。
 *   这里只保证"请求发对了、图下来了"。
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { describeLook } from '../../application/look-description.js';
import type { Look } from '../../domain/entities/look.js';
import type { Engine, EngineInput, EngineResult } from '../../domain/ports/engine.js';
import type { EngineFixture } from './engine-fixtures.js';
import { FIXTURE_FORMAT_VERSION, imagePathOf, writeFixture } from './engine-fixtures.js';
import { TEMPLATE_VERSION } from './prompt-builder.js';
import type { GenerateRequest, QwenRequestOptions } from './qwen-request.js';
import { buildGenerateRequest, fixtureKeyOf } from './qwen-request.js';

export interface ImageEngineOptions extends Omit<QwenRequestOptions, 'apiHost'> {
  apiKey: string;
  /** 形如 `https://dashscope.aliyuncs.com`。 */
  apiHost: string;
  /** 成品图落盘目录(引擎自己写,由调用方/ArtifactStore 收编)。 */
  outputDir: string;
  timeoutMs?: number;
  /**
   * 给了就**录制夹具**(§5.4)。
   *
   * ★ 缺省 `undefined` = 不录。与所有开关同一条规矩:**缺省值必须没有意外副作用**,
   *   这里的副作用是"往盘上写文件"。要录就得显式给。
   */
  fixturesDir?: string;
}

const DEFAULT_API_HOST = 'https://dashscope.aliyuncs.com';
const DEFAULT_MODEL = 'qwen-image-edit-plus';
const DEFAULT_TIMEOUT_MS = 180_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const ATTEMPTS = 3;

/**
 * 只重试**连接阶段**错误。判据是「请求**不可能已经送达**」——
 * 连都没连上,重试不会产生第二次计费。
 * ⚠️ **刻意不含 `TimeoutError`**(`AbortSignal.timeout` 触发的那个),理由见文件头。
 */
const RETRYABLE_CONNECT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
]);

function isConnectPhaseError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CONNECT_CODES.has(code)) return true;
    if (cur.name === 'TimeoutError') return false;
    cur = cur.cause;
  }
  return false;
}

/**
 * ★ `fetch` 失败时 `err.message` **只有 `fetch failed` 三个词**,
 * 真正的原因(ECONNRESET / 证书 / DNS / 代理 / 超时)全在 `err.cause` 里。
 * 不把它打出来,排查就只能靠猜 —— 脚本里第一版就踩了这个坑。
 */
function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as NodeJS.ErrnoException).code;
    parts.push(`${cur.message}${code ? ` [${code}]` : ''}`);
    cur = cur.cause;
  }
  return parts.join(' ← ') || String(err);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface ApiSuccess {
  output?: { choices?: { message?: { content?: { image?: string }[] } }[] };
  usage?: unknown;
  request_id?: string;
}

interface ApiFailure {
  code?: string;
  message?: string;
  request_id?: string;
}

/** 从成功响应里取出图片 URL。取不到就当作失败(API 用 200 回错误的**业务码**是常见形状)。 */
function imageUrlsOf(json: unknown): string[] {
  const choices = (json as ApiSuccess).output?.choices;
  return (choices ?? [])
    .flatMap((c) => c.message?.content ?? [])
    .map((c) => c.image)
    .filter((u): u is string => typeof u === 'string');
}

/** 用时间戳 + 短随机串命名,避免同一次会话里多次出图互相覆盖。 */
function newFileStamp(): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 8);
  return `${stamp}-${rand}`;
}

export class ImageEngine implements Engine {
  readonly name: string;

  constructor(private readonly opts: ImageEngineOptions) {
    // ★ `name` 是**运行时值**(进日志、进 `JobResult.engine`),不是类名——
    //   它要能把三个引擎区分开(mock / replay / 这个),所以带上模型名。
    //   模型名本身来自配置(`QWEN_IMAGE_MODEL`),厂商信息在那里已经公开了。
    this.name = `image:${opts.model || DEFAULT_MODEL}`;
  }

  async generate(input: EngineInput): Promise<EngineResult> {
    const opts: QwenRequestOptions = {
      apiHost: this.opts.apiHost || DEFAULT_API_HOST,
      model: this.opts.model || DEFAULT_MODEL,
      ...(this.opts.n !== undefined ? { n: this.opts.n } : {}),
      ...(this.opts.size !== undefined ? { size: this.opts.size } : {}),
      ...(this.opts.seed !== undefined ? { seed: this.opts.seed } : {}),
      ...(this.opts.promptExtend !== undefined ? { promptExtend: this.opts.promptExtend } : {}),
    };
    // ★ 组装只有这一份(`qwen-request.ts`),录制与回放因此算出同一个键。
    const req = buildGenerateRequest(input, opts);

    const json = await this.post(req);

    const urls = imageUrlsOf(json);
    if (urls.length === 0) {
      const f = json as ApiFailure;
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        `生图失败:接口返回错误码 ${f.code ?? '(无)'}:${f.message ?? '(无 message)'}` +
          `(request_id=${f.request_id ?? '无'},排查时带上它)`,
      );
    }

    mkdirSync(this.opts.outputDir, { recursive: true });
    const stamp = newFileStamp();
    const dest = path.join(this.opts.outputDir, `${stamp}.png`);
    // ★ 只取第一张:出图张数由 `n` 决定,但**本端口只返回一张成品**
    //   (`EngineResult.resultFilePath` 是单数)。n>1 的候选图选择属 §14 阶段 4。
    const bytes = await this.download(urls[0] as string, dest);

    const spec = input.lookSpec;
    // `spec` 必然存在 —— 缺了的话 `buildGenerateRequest` 已经抛过(见那里的注释)。
    // 这里再取一次只为拿到 describeLook 的输入;不要改成非空断言以外的写法。
    const look: Look = {
      // ★ 与 `MockEngine`('mock')/`ReplayEngine`('replay')**同一套命名**:按做法,不按厂商。
      //   这条不是洁癖:`look.engine` 与本类的 `name`(`image:<model>`,它会进
      //   `JobResult.engine`)是**同一件事的两种说法**,不一致时排查的人得先猜哪个算数。
      //   厂商信息在 `look.model` 与配置里已经写明了,不靠这个字段重复第二遍。
      engine: 'image',
      // ★ `style` 复用 `describeLook`:确定性的、与 `LookSpec` 一一对应的那一份说法。
      //   不另写一个"风格名"——那会是**第二套说法**,而两者不一致时用户会照着错的那个判断
      //   (`narration.ts` / `look-description.ts` 都记过这条教训)。
      style: spec ? describeLook(spec) : '',
      model: opts.model,
      templateVersion: TEMPLATE_VERSION,
    };

    if (this.opts.fixturesDir) {
      this.record(req, json, dest, bytes);
    }

    console.log(
      `[makeup] 出图 ${(bytes / 1024).toFixed(0)}KB · ${(json as ApiSuccess).request_id ?? '无 request_id'}` +
        ` · template=${TEMPLATE_VERSION}`,
    );

    return { resultFilePath: dest, mimeType: 'image/png', look };
  }

  /**
   * 发一次生成请求,带**连接阶段**重试。
   * ★ 绝不打印 `apiKey` 的值——日志里只有长度与掩码前缀(与 LLM 适配器同一条规矩)。
   */
  private async post(req: GenerateRequest): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(req.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });

        const text = await res.text();
        if (!res.ok) {
          // 鉴权失败 / 限流 / 5xx。**不重试**:这些不是连接抖动,再撞三次只会更糟。
          throw new AppError(
            ErrorCode.INTERNAL_ERROR,
            `生图返回 HTTP ${res.status}:${text.slice(0, 300)}`,
          );
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new AppError(ErrorCode.INTERNAL_ERROR, `生图响应不是 JSON:${text.slice(0, 300)}`);
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (attempt < ATTEMPTS && isConnectPhaseError(err)) {
          const wait = 1000 * 2 ** (attempt - 1);
          console.warn(
            `[makeup] 生图连接阶段错误,${wait}ms 后重试(${attempt}/${ATTEMPTS - 1}):` +
              describeError(err).split(' ← ')[0],
          );
          await sleep(wait);
          continue;
        }
        throw new AppError(ErrorCode.INTERNAL_ERROR, `生图请求失败:${describeError(err)}`);
      }
    }
  }

  /**
   * 下载结果图落地。★ **必须重试,这不是防御性编程**:
   * 本机到 OSS 结果域名的连通是抖的(实测同一个域名一会儿超时、一会儿通)。
   * **生成已经成功、只是没下下来,是最亏的一种失败——次数花了,图没了。**
   */
  private async download(url: string, dest: string): Promise<number> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!res.ok) {
          throw new AppError(ErrorCode.INTERNAL_ERROR, `下载结果图失败 HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(dest, buf);
        return buf.length;
      } catch (err) {
        lastErr = err;
        if (attempt < ATTEMPTS) {
          const wait = 1000 * 2 ** (attempt - 1);
          await sleep(wait);
        }
      }
    }
    // ★ 图还在(URL 活 24h),把 URL 一并抛出去——**别让一次下载失败白烧一次计费**。
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      `结果图连续 ${ATTEMPTS} 次下载失败。图还在(URL 活 24 小时),可手动 curl 救:\n  ${url}\n  原因:${describeError(lastErr)}`,
    );
  }

  /** 录一份夹具。★ **写盘失败不影响出图**——录音是副产品,不是主流程的成败条件。 */
  private record(req: GenerateRequest, json: unknown, imageFile: string, bytes: number): void {
    const dir = this.opts.fixturesDir;
    if (!dir) return;
    try {
      const key = fixtureKeyOf(req);
      const recorded = imagePathOf(dir, key);
      mkdirSync(dir, { recursive: true });
      copyFileSync(imageFile, recorded);

      const fixture: EngineFixture = {
        formatVersion: FIXTURE_FORMAT_VERSION,
        templateVersion: TEMPLATE_VERSION,
        key,
        createdAt: new Date().toISOString(),
        request: {
          model: req.model,
          prompt: req.prompt,
          negativePrompt: req.negativePrompt,
          parameters: req.body.parameters as Record<string, unknown>,
          inputs: req.inputDigests,
        },
        response: {
          ...((json as ApiSuccess).request_id ? { requestId: (json as ApiSuccess).request_id } : {}),
          imageFile: path.basename(recorded),
          mimeType: 'image/png',
          bytes,
        },
      };
      const written = writeFixture(dir, fixture);
      console.log(`[makeup] 已录夹具 ${written}`);
    } catch (err) {
      console.warn(`[makeup] 录夹具失败(不影响出图):${describeError(err)}`);
    }
  }
}
