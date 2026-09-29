/**
 * scripts/probe-vision.ts —— 【实验脚本,不在服务运行路径上 / **本轮未跑过**】
 *
 * 用途:定**三件**在写 `dashscope-vision.ts` 时标了 `[未验证]` 的事——
 *   ① content 分片的确切形状:`image_url` 是 `{url: "data:..."}` 还是直接一个字符串;
 *   ② 图片排在文本**之前**还是之后;
 *   ③ 回复正文是 `message.content` **字符串**,还是分片数组。
 * 这三件决定请求组装对不对,而官方文档站被网络策略拦着(grep 不到原文,
 * 与 `probe-tool-calling.ts` 当初同一处境)。**实测是唯一出路。**
 *
 * ★★ **判据不是 HTTP 200,而是"模型说得出图的颜色"。** 这是本脚本存在的意义:
 *   一个只认状态码的探针,在**图片被静默丢掉**时照样全绿——那正是本仓头号 bug 的形状
 *   (照跑、200、日志干净,只有结果是错的)。所以下面喂的是一张**纯色图**,
 *   它的答案**不看图就编不出来**:模型要么说出颜色,要么说"我看不到图"。
 *   后者就是失败信号,这就是"图片到底有没有送到"的探测器。
 *
 * 用法:
 *   npx tsx scripts/probe-vision.ts --dry-run        # 只看请求体,不发送、不花钱
 *   npx tsx scripts/probe-vision.ts                  # 跑三个变体
 *   npx tsx scripts/probe-vision.ts --image a.jpg    # 换成真图(自带已知答案的话更好)
 *   npx tsx scripts/probe-vision.ts --models a,b
 *
 * 产物:`out/probe-vision/<时间戳>-summary.json`(原始响应,**是夹具不是日志**)。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { loadDotEnvIfPresent } from '../src/modules/shared/infrastructure/config.js';

// ── 配置 ────────────────────────────────────────────────────────────────────

const DEFAULT_API_HOST = 'https://dashscope.aliyuncs.com';

/**
 * 候选模型。★ **这是猜的,不是实测出来的** —— 与 `probe-tool-calling.ts` 那张表不同
 * (那张是拿 `--list` 实测过的)。跑之前先 `--list` 或用控制台确认视觉模型名,
 * 别把一个不存在的名字的失败读成"形状不对"。
 */
const DEFAULT_MODELS = ['qwen-vl-max', 'qwen-vl-plus'];

/** 纯色图的目标色(magenta)。挑它是因为中文里几乎不会被说成别的颜色。 */
const TARGET_RGB = { r: 255, g: 0, b: 255 } as const;
const TARGET_WORDS = ['洋红', '品红', '紫红', 'magenta', '紫', '粉'];

/** 模型的"我没看到图"话术。出现任何一个 ⇒ 图片没送到,该变体判负。 */
const NO_IMAGE_WORDS = ['看不到', '看不见', '没有图', '未提供图', '无法查看', '无法看到', 'no image', 'cannot see', 'can not see'];

const QUESTION = '这张图整体是什么颜色?只回一个中文颜色词,不要别的话。';

const OUT_DIR = path.join(import.meta.dirname, '..', 'out', 'probe-vision');
const TIMEOUT_MS = 30_000;

// ── PNG 生成:纯色图,**不引入任何依赖** ────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** 生成一张 `w×h` 的纯色 PNG(8 位真彩、无滤波)。 */
function solidPng(w: number, h: number, rgb: { r: number; g: number; b: number }): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 2; // 颜色类型:真彩 RGB
  // 10..12(压缩/滤波/隔行)已是 0。

  const stride = 1 + w * 3;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const off = y * stride;
    raw[off] = 0; // 滤波类型:无
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = rgb.r;
      raw[p + 1] = rgb.g;
      raw[p + 2] = rgb.b;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── argv ────────────────────────────────────────────────────────────────────

interface Argv {
  dryRun: boolean;
  models: string[];
  imagePath?: string;
  /** 把生成的那张纯色图写出来看看 —— 见 `--dump-image` 里那段理由。 */
  dumpImage?: string;
}

function usage(): never {
  console.error(`用法: tsx scripts/probe-vision.ts [选项]

  --dry-run               只打印请求体,不发送(不花钱)
  --dump-image <路径>     只把自动生成的那张纯色 PNG 写出来,别的什么都不做
  --image <路径>          用这张图代替自动生成的纯色图
  --models a,b            覆盖缺省候选模型表(逗号分隔)
  -h, --help              显示本帮助
`);
  process.exit(2);
}

function parseArgv(argv: string[]): Argv {
  const out: Argv = { dryRun: false, models: DEFAULT_MODELS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') usage();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--dump-image') {
      const v = argv[++i];
      if (!v) usage();
      out.dumpImage = v;
    } else if (a === '--image') {
      const v = argv[++i];
      if (!v) usage();
      out.imagePath = v;
    } else if (a === '--models') {
      const v = argv[++i];
      if (!v) usage();
      out.models = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      console.error(`未知参数:${a}`);
      usage();
    }
  }
  return out;
}

// ── 三个变体 ────────────────────────────────────────────────────────────────

/** `url` 放对象里还是直接放字符串 —— 这是未验证②。 */
type UrlShape = 'object' | 'string';

interface Variant {
  name: string;
  urlShape: UrlShape;
  imageFirst: boolean;
  /** 一句话说清它在测什么,失败时要能一眼看出是哪个未知数没定下来。 */
  tests: string;
}

const VARIANTS: Variant[] = [
  { name: 'A-obj-image-first', urlShape: 'object', imageFirst: true, tests: '① 对象形状 ② 图在文本前' },
  { name: 'B-obj-text-first', urlShape: 'object', imageFirst: false, tests: '② 图在文本后(只差顺序)' },
  { name: 'C-str-image-first', urlShape: 'string', imageFirst: true, tests: '① `image_url` 是纯字符串' },
];

/** 按变体拼 content 分片。★ 要改的地方**只有这里** —— 定下来之后改 `dashscope-vision.ts` 即可。 */
function contentOf(v: Variant, dataUrl: string): unknown[] {
  const imagePart =
    v.urlShape === 'object'
      ? { type: 'image_url', image_url: { url: dataUrl } }
      : { type: 'image_url', image_url: dataUrl };
  const textPart = { type: 'text', text: QUESTION };
  return v.imageFirst ? [imagePart, textPart] : [textPart, imagePart];
}

// ── HTTP ────────────────────────────────────────────────────────────────────

/**
 * 只重试连接阶段错误(判据与其余三个适配器一致):
 * 整体超时**刻意不重试** —— 请求可能已经到达服务端并计费。
 */
const RETRYABLE_CONNECT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'EPIPE',
]);

function isConnectPhaseError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CONNECT_CODES.has(code)) return true;
    if (cur.name === 'TimeoutError') return false; // 整体超时不重试
    cur = cur.cause;
  }
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  attempts = 3,
): Promise<{ status: number; json: unknown }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = { _unparsed: text.slice(0, 2000) };
      }
      return { status: res.status, json };
    } catch (err) {
      if (attempt < attempts && isConnectPhaseError(err)) {
        const wait = 500 * attempt;
        console.warn(`  · 连接阶段错误,${wait}ms 后重试(${attempt}/${attempts - 1})`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

// ── 探针主体 ────────────────────────────────────────────────────────────────

interface ProbeResult {
  variant: string;
  tests: string;
  httpStatus: number | null;
  /** ★ 判据:模型说出了一个颜色词 ⇒ 它**真的看到图了**。 */
  sawImage: boolean;
  /** 反向信号:模型说它看不到图 ⇒ 图片没送到(或形状被忽略了)。 */
  saidNoImage: boolean;
  /** 未验证③:`message.content` 是字符串还是数组。 */
  contentType: string;
  text?: string;
  finishReason?: string;
  latencyMs: number;
  error?: string;
  raw?: unknown;
}

function describeApiError(status: number, json: unknown): string {
  const j = json as { error?: { message?: string; code?: string }; message?: string };
  const detail = j?.error?.message ?? j?.message ?? JSON.stringify(json).slice(0, 300);
  const code = j?.error?.code ? ` [${j.error.code}]` : '';
  return `HTTP ${status}${code}: ${detail}`;
}

/** 回复正文 + 它的类型。★ 未验证③ 就靠这个 `typeof`。 */
function extractText(content: unknown): { text: string; kind: string } {
  if (typeof content === 'string') return { text: content, kind: 'string' };
  if (Array.isArray(content)) {
    const text = content
      .map((p) =>
        p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string'
          ? (p as { text: string }).text
          : '',
      )
      .join('');
    return { text, kind: 'array' };
  }
  return { text: '', kind: content === null ? 'null' : typeof content };
}

async function probeVariant(
  baseUrl: string,
  apiKey: string,
  model: string,
  variant: Variant,
  dataUrl: string,
): Promise<ProbeResult> {
  const started = Date.now();
  const result: ProbeResult = {
    variant: variant.name,
    tests: variant.tests,
    httpStatus: null,
    sawImage: false,
    saidNoImage: false,
    contentType: '(未取到)',
    latencyMs: 0,
  };

  try {
    const res = await postJson(`${baseUrl}/chat/completions`, apiKey, {
      model,
      messages: [{ role: 'user', content: contentOf(variant, dataUrl) }],
    });
    result.httpStatus = res.status;
    result.raw = res.json;
    result.latencyMs = Date.now() - started;

    if (res.status !== 200) {
      result.error = describeApiError(res.status, res.json);
      return result;
    }

    const choices = (res.json as { choices?: unknown }).choices;
    const choice = Array.isArray(choices) ? (choices[0] as { message?: unknown; finish_reason?: unknown }) : undefined;
    const message =
      choice?.message && typeof choice.message === 'object'
        ? (choice.message as Record<string, unknown>)
        : {};
    if (typeof choice?.finish_reason === 'string') result.finishReason = choice.finish_reason;

    const { text, kind } = extractText(message.content);
    result.contentType = kind;
    result.text = text.trim().slice(0, 200);

    // ★ 两个信号都按**文本**判,不按状态码。
    result.saidNoImage = NO_IMAGE_WORDS.some((w) => text.toLowerCase().includes(w.toLowerCase()));
    result.sawImage = TARGET_WORDS.some((w) => text.includes(w));
    if (!result.sawImage) {
      result.error = result.saidNoImage
        ? '模型明说看不到图 ⇒ **图片没送到**(形状不对,或这个模型不吃这个形状)'
        : `没说出目标色(期望含:${TARGET_WORDS.join(' / ')};实收:${text.trim().slice(0, 80) || '空'})`;
    }
  } catch (err) {
    result.error = `请求异常:${err instanceof Error ? err.message : String(err)}`;
    result.latencyMs = Date.now() - started;
  }

  return result;
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

function mimeOf(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function main(): Promise<void> {
  loadDotEnvIfPresent(path.join(import.meta.dirname, '..', '.env'));

  const apiKey = process.env.DASHSCOPE_API_KEY;
  const apiHost = process.env.DASHSCOPE_API_HOST ?? DEFAULT_API_HOST;
  const baseUrl = `${apiHost}/compatible-mode/v1`;
  const argv = parseArgv(process.argv.slice(2));

  const bytes = argv.imagePath
    ? readFileSync(argv.imagePath)
    : solidPng(64, 64, TARGET_RGB);
  const mime = argv.imagePath ? mimeOf(argv.imagePath) : 'image/png';

  // ★ 上面那个 PNG 是**手写编码的**(要零依赖)。它要是编错了,模型会答"看不到图",
  //   而这里会把那次失败读成"形状不对" —— 一个**误诊**。所以给一条独立通路:
  //   把这个字节流写出来,拿**别的**解码器打开看一眼。这跟「判据是结果不是状态码」同源。
  if (argv.dumpImage) {
    writeFileSync(argv.dumpImage, bytes);
    console.log(`已写出 ${argv.dumpImage}(${bytes.length} 字节) —— 拿去用任意看图工具打开确认。`);
    return;
  }

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

  console.log(`端点  ${baseUrl}`);
  console.log(`Key   ${apiKey ? `已提供(长度 ${apiKey.length})` : '缺失 → 见 .env 的 DASHSCOPE_API_KEY'}`);
  console.log(`图    ${argv.imagePath ?? '(自动生成的纯色 PNG)'}·${mime}·${(bytes.length / 1024).toFixed(1)}KB`);
  // ★ base64 约 1.33 倍。这类图**故意很小** —— 大图收不收是另一件事(见 plan「本轮不做」)。
  console.log(`     转 base64 后约 ${(dataUrl.length / 1024).toFixed(1)}KB`);
  console.log('');

  if (!apiKey) process.exit(1);

  if (argv.dryRun) {
    console.log('--dry-run:请求体(未发送)');
    for (const v of VARIANTS) {
      console.log(`\n── ${v.name}(${v.tests})──`);
      console.log(
        JSON.stringify(
          {
            model: `(逐个替换为:${argv.models.join(' | ')})`,
            messages: [{ role: 'user', content: contentOf(v, '<data:…,base64…>') }],
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  const results: ProbeResult[] = [];
  for (const model of argv.models) {
    console.log(`══ ${model} ══`);
    for (const v of VARIANTS) {
      const r = await probeVariant(baseUrl, apiKey, model, v, dataUrl);
      r.variant = `${model} · ${v.name}`;
      results.push(r);
      const mark = r.sawImage ? '✅' : '❌';
      console.log(`  ${mark} ${v.name.padEnd(18)} content=${r.contentType} (${r.latencyMs}ms)`);
      if (r.text) console.log(`     回复 → ${r.text}`);
      if (r.error) console.log(`     原因 → ${r.error}`);
    }
    console.log('');
  }

  // 落夹具:原始响应 + 汇总。有了它,以后不用重复烧这次调用。
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = path.join(OUT_DIR, `${stamp}-summary.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        probedAt: new Date().toISOString(),
        baseUrl,
        question: QUESTION,
        image: argv.imagePath ?? `纯色 PNG ${JSON.stringify(TARGET_RGB)}`,
        targetWords: TARGET_WORDS,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('── 汇总 ──');
  for (const r of results) console.log(`${r.sawImage ? '✅' : '❌'} ${r.variant}  ${r.error ?? 'OK'}`);
  console.log(`\n夹具已写入 ${file}`);

  // 退出码:任何一个变体"真的看到了图"就算过(接缝成立)。
  // ★ 不是"有任何 200 就算过" —— 见文件头那段。
  process.exit(results.some((r) => r.sawImage) ? 0 : 1);
}

main().catch((err) => {
  console.error('未捕获异常:', err);
  process.exit(1);
});
