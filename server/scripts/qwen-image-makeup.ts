/**
 * scripts/qwen-image-makeup.ts —— 【实验脚本,不在服务运行路径上】
 *
 * 用途:拿**我们自己的照片**调阿里云百炼(DashScope)的千问图像编辑模型,让它把妆容画上去,
 * 把结果 PNG 落到本地。用来回答一个问题:**生成式这条路,妆效够不够「像本人 + 自然」**。
 *
 * ★ 状态要说清楚(别把它读大):
 *   - 它**不是** `Engine` 端口的实现,`src/` 一个字节都没改,`MAKEUP_ENGINE` 也不认它;
 *   - 它只产出**离线素材**(预录图),给演示/对照用;要进流水线得先按
 *     `docs/plan/ai-engine-api-spike.md` §4.5 的 record/replay 固化成夹具;
 *   - 现场真人自拍**能不能过百炼的人脸审核,本脚本没验过**——这是接入前的第 0 步。
 *
 * 接口形状(一手来源:阿里云百炼《千问-图像编辑API参考》,2026-09-15 用 curl 取原文核对):
 *   POST {DASHSCOPE_API_HOST}/api/v1/services/aigc/multimodal-generation/generation
 *   Header: Authorization: Bearer sk-xxx · Content-Type: application/json
 *   Body:   { model, input: { messages: [{ role:'user', content:[{image},…,{text}] }] },
 *             parameters: { n, negative_prompt, prompt_extend, watermark, size, seed } }
 *   返回:   output.choices[0].message.content[].image  ← PNG 的 URL,**有效期 24 小时**
 *
 * ★ 三个从文档里读出来的坑,已在本脚本里处理:
 *   1. **同步接口,没有异步 task 轮询**——直接等响应即可(与万相系的 image-synthesis 不同)。
 *   2. **多图输入时,输出比例以「最后一张」为准**。所以本脚本把**本人照片放在最后**,
 *      参考妆照放在前面;prompt 里也据此措辞。反过来放会让输出尺寸跟着参考图走。
 *   3. **`qwen-image-edit`(无后缀)不支持 `size` / `prompt_extend` / 多图输出**,传了会报错。
 *      本脚本会在 model 无后缀时把这些参数摘掉。
 *
 * 用法:
 *   npx tsx scripts/qwen-image-makeup.ts --image ./me.jpg --occasion date
 *   npx tsx scripts/qwen-image-makeup.ts --image ./me.jpg --ref ./look.png --n 3 --seed 42
 *   npx tsx scripts/qwen-image-makeup.ts --image ./me.jpg --dry-run   # 只看请求体,不花钱
 *
 * 先决条件:.env 里有 DASHSCOPE_API_KEY(见 .env.example 的「千问图像编辑」一节)。
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDotEnvIfPresent } from '../src/modules/shared/infrastructure/config.js';
import { SCENE_RULES } from '../src/modules/shared/domain/scene-rules.js';
import { OCCASIONS, SKIN_TONES } from '../src/modules/shared/domain/entities/brief.js';
import type { Occasion, SkinTone } from '../src/modules/shared/domain/entities/brief.js';

// ── 配置 ────────────────────────────────────────────────────────────────────

/** 华北 2(北京)地域的老域名,文档说仍可用;新域名形如 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com。 */
const DEFAULT_API_HOST = 'https://dashscope.aliyuncs.com';
const GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

/** 文档:图像不超过 10MB,超了建议先压。 */
const MAX_IMAGE_MB = 10;
/** 文档:content 里最多 3 张图(含本人照片)。 */
const MAX_IMAGES = 3;
/** 文档:仅支持一个 text,其它模型上限 800 token。 */
const MAX_PROMPT_CHARS = 1200;

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

/**
 * 反向提示词。★ 第一组四项(变形/换脸/改五官/改脸型)是**身份保真**的护栏——
 * 这类编辑模型最大的失败模式不是妆难看,是**把脸换了**。其余是去掉常见的生成瑕疵。
 */
const DEFAULT_NEGATIVE_PROMPT = [
  '变形',
  '换脸',
  '改变五官',
  '改变脸型',
  '改变人物身份',
  '改变背景',
  '多余的饰品',
  '文字',
  '水印',
  '过度磨皮',
  '塑料感',
  '浓妆艳抹',
].join('、');

// ── 参数解析 ────────────────────────────────────────────────────────────────

interface Argv {
  image: string;
  refs: string[];
  occasion?: Occasion;
  tone?: SkinTone;
  /** `--prompt`:整段替换提示词(不是追加)。 */
  promptText?: string;
  /** `--prompt-file`:从文件读提示词,优先级高于 `--prompt`。 */
  promptFile?: string;
  /** `--template`:改用按场合生成的内置模板(对照组)。 */
  useOccasionTemplate: boolean;
  /** `--keep-identity`:在最前面插「只改妆、别动脸和背景」的锚句。 */
  keepIdentity: boolean;
  negativePrompt: string;
  model: string;
  size?: string;
  n: number;
  seed?: number;
  promptExtend: boolean;
  outDir: string;
  name: string;
  dryRun: boolean;
  timeoutMs: number;
}

function usage(): never {
  console.error(
    [
      '用法: npx tsx scripts/qwen-image-makeup.ts --image <本地路径|URL> [选项]',
      '',
      '可选(都有着落,不加参数就能跑):',
      `  --image <path>      本人正面照片(本地文件路径,或 http(s) 公网 URL)`,
      '                      缺省用 scripts/assets/face-local.webp',
      '',
      '  --ref <path>        妆容参考图,可重复;与本人照片合计最多 ' + MAX_IMAGES + ' 张',
      '  --occasion <k>      ' + OCCASIONS.join(' | ') + '(缺省 daily)',
      '  --tone <k>          ' + SKIN_TONES.join(' | ') + '(只在 --template 的 prompt 里作为肤色约束)',
      '  --prompt <text>     整段替换提示词(不是追加);缺省用内置那份妆面稿',
      '  --prompt-file <p>   从文件读提示词,长稿改措辞用这个,优先级高于 --prompt',
      '  --template          改用按场合生成的内置模板(与妆面稿做对照)',
      '  --keep-identity     在提示词最前面插「只改妆、别动脸和背景」的锚句',
      '  --negative <text>   覆盖默认反向提示词',
      '  --model <name>      缺省 qwen-image-edit-plus;可选 qwen-image-edit / qwen-image-edit-max',
      '  --size <W*H>        如 1024*1536;缺省不给,由接口按输入图比例推(缺省更省心)',
      '  --n <1-6>           出图张数,缺省 1',
      '  --seed <int>        固定随机种子,便于同一 prompt 复现对比',
      '  --no-prompt-extend  关掉提示词智能改写(缺省开)',
      '  --out <dir>         产物目录,缺省 ./out/qwen-image-makeup',
      '  --name <slug>       产物文件名前缀,缺省取输入图文件名',
      '  --timeout-ms <int>  单次请求超时,缺省 180000',
      '  --dry-run           只打印请求体(不含 base64),不发请求、不花钱',
    ].join('\n'),
  );
  process.exit(2);
}

function parseArgv(argv: string[]): Argv {
  const opt = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined || !a.startsWith('--')) usage();
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      opt.set(key, [...(opt.get(key) ?? []), next]);
      i++;
    } else {
      flags.add(key);
    }
  }

  const one = (k: string): string | undefined => opt.get(k)?.[0];
  const image = one('image') ?? DEFAULT_IMAGE_FILE;

  const occasion = one('occasion');
  if (occasion !== undefined && !(OCCASIONS as readonly string[]).includes(occasion)) usage();
  const tone = one('tone');
  if (tone !== undefined && !(SKIN_TONES as readonly string[]).includes(tone)) usage();

  const model = one('model') ?? process.env.QWEN_IMAGE_MODEL ?? 'qwen-image-edit-plus';

  let n = Number(one('n') ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 6) usage();

  const seedRaw = one('seed');
  const timeoutRaw = one('timeout-ms');

  // ★ 参数归一化**只在这里做一次**,下游拿到什么就发什么:
  //   否则会出现「打了告警但仍然照发」这种说一套做一套的状态(argparse 层的经典坑)。
  let refs = opt.get('ref') ?? [];
  if (refs.length > MAX_IMAGES - 1) {
    console.warn(`⚠ 参考图最多 ${MAX_IMAGES - 1} 张(连本人照片合计 ${MAX_IMAGES} 张),多出的 ${refs.length - MAX_IMAGES + 1} 张已忽略`);
    refs = refs.slice(0, MAX_IMAGES - 1);
  }
  // 无后缀的 qwen-image-edit 不吃 size / prompt_extend,且**固定只出 1 张**(见文件头 ★3)。
  let size = one('size');
  if (!supportsSizeParams(model)) {
    if (size !== undefined || n > 1) {
      console.warn('⚠ qwen-image-edit 不支持 size / 多图输出,size 与 n 已按该模型的能力归一化');
    }
    size = undefined;
    n = 1;
  }

  return {
    image,
    refs,
    ...(occasion !== undefined ? { occasion: occasion as Occasion } : {}),
    ...(tone !== undefined ? { tone: tone as SkinTone } : {}),
    ...(one('prompt') !== undefined ? { promptText: one('prompt') } : {}),
    ...(one('prompt-file') !== undefined ? { promptFile: one('prompt-file') } : {}),
    useOccasionTemplate: flags.has('template'),
    keepIdentity: flags.has('keep-identity'),
    negativePrompt: one('negative') ?? DEFAULT_NEGATIVE_PROMPT,
    model,
    ...(size !== undefined ? { size } : {}),
    n,
    ...(seedRaw !== undefined ? { seed: Number(seedRaw) } : {}),
    promptExtend: !flags.has('no-prompt-extend'),
    outDir: one('out') ?? './out/qwen-image-makeup',
    name: one('name') ?? slugify(path.parse(image).name || 'out'),
    dryRun: flags.has('dry-run'),
    timeoutMs: Number(timeoutRaw ?? 180_000),
  };
}

function slugify(s: string): string {
  return s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'out';
}

/**
 * 这个模型吃不吃 `size` / `prompt_extend` / 多图输出。
 * 文档口径:`qwen-image-edit`(无后缀)是**单图进、单图出**的简化版,传了那几个参数会报错。
 * 去掉版本后缀再比,免得 `qwen-image-edit-2025-xx` 这类带日期的名字判错。
 */
function supportsSizeParams(model: string): boolean {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '') !== 'qwen-image-edit';
}

// ── 输入图 → Base64 data URL ────────────────────────────────────────────────

/**
 * 本地文件走 Base64(文档支持的三种输入之一:公网 URL / oss:// 临时 URL / data URL)。
 * ★ 之所以默认走 Base64 而不是先传 OSS:少一步外部依赖,且**照片不落到第三方存储桶**——
 *   与「用户自拍不上传第三方」那条红线同向。
 */
function toImageField(input: string): string {
  if (/^https?:\/\//i.test(input) || input.startsWith('data:')) return input;

  const abs = path.resolve(input);
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`不支持的图片扩展名 ${ext || '(无)'}:${abs}`);

  const bytes = statSync(abs).size;
  if (bytes > MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(
      `图片过大会被接口拒:${abs} 是 ${(bytes / 1024 / 1024).toFixed(1)}MB,上限 ${MAX_IMAGE_MB}MB`,
    );
  }
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
}

// ── 提示词 ──────────────────────────────────────────────────────────────────

/**
 * 缺省提示词 = `prompts/look-sheet.txt`(2026-09-15 owner 给的妆面稿,逐字使用)。
 *
 * ★ 为什么放**文件**而不是常量:这份稿子会反复改措辞,而改措辞不该动代码。
 *   同时避免「代码里一份、文档里一份」的漂移——它只有这一份,`--prompt-file` 指向的也是同一个机制。
 *   路径按**脚本所在目录**解析,所以从哪个 cwd 跑都找得到。
 *
 * ★ 读这段要留意它包含了**什么**:除了妆面(唇/颊/眼/眉/瞳),它还写了**头发**、
 *   **构图**(极近距离特写)、**服装**(裸肩)、**背景**(纯白工作室)。
 *   也就是说它不是「在本人照片上补妆」的指令,而是一份**整幅重画**的取景单。
 *   这两件事对 `qwen-image-edit` 是相反的取向:模型会照着这段重摆构图与背景,
 *   于是成片更像「按这套妆生成的一张人像」,而不是「我的照片上了妆」。
 *   要回到「只改妆、脸和背景都不动」,用 `--keep-identity`,或 `--template` 走场合模板。
 */
const DEFAULT_PROMPT_FILE = path.join(import.meta.dirname, 'prompts', 'look-sheet.txt');

/** 读缺省妆面稿。文件丢了就得炸——静默回落到空 prompt 会让请求照样发出去、白花一次调用。 */
function readDefaultPrompt(): string {
  const body = readFileSync(DEFAULT_PROMPT_FILE, 'utf8').trim();
  if (!body) throw new Error(`缺省提示词文件是空的:${DEFAULT_PROMPT_FILE}`);
  return body;
}

/**
 * `--keep-identity`:把「只改妆、别动脸和背景」的锚句**顶在提示词最前面**。
 *
 * ★ 正面提示词里放什么,模型就重画什么:凡未声明要保留的(背景、服装、构图、脸),
 *   它都有权改。这段锚句就是用来把「有权改」收窄的。副作用是它**会与上面那段
 *   妆面稿里的构图/背景/裸肩条款打架**,所以做开关而不是默认打开。
 */
const KEEP_IDENTITY_PREFIX =
  '最后一张图是我本人的正面照片,前面是妆容参考。请以我本人的照片为底图,只修改妆容。' +
  '必须保持:我的身份、五官形状、脸型、发型、皮肤真实纹理与毛孔、拍摄角度、背景、光线,全部不变。' +
  '不要磨皮,不要改变肤色深浅,不要让我看起来像另一个人。';

/**
 * `--template`:按场合走内置模板(与前端同一份 `SCENE_RULES` 场合语义)。
 * 作为上面那段妆面稿的**对照组**保留:两者出图放一起才看得出「妆面稿」到底买到了什么。
 */
function buildOccasionPrompt(a: Argv): string {
  const scene = SCENE_RULES[a.occasion ?? 'daily'];

  const lines = [
    KEEP_IDENTITY_PREFIX,
    `妆容方向:${scene.direction}(场合:${scene.cn};关键词:${scene.tags.join('、')})。`,
  ];

  if (a.tone) {
    // roadmap:肤色是「按真实肤色走、禁止默认浅肤色审美」的落点,所以显式钉住。
    lines.push(`按我本人的真实肤色(${a.tone} 档)上妆,不要把肤色提亮或改成浅肤色。`);
  }
  lines.push('成片要像真人化完妆拍的照片,有真实皮肤质感和自然的高光,不要像贴纸或滤镜。');

  return lines.join('\n');
}

/**
 * 提示词的**唯一**组装处。优先级(高→低):
 *   `--prompt-file` > `--prompt` > `--template` > 内置妆面稿
 * 前三者都带 `--keep-identity` 时会在最前面插锚句,第四项本身不含锚句(它就是妆面稿)。
 */
function resolvePrompt(a: Argv): string {
  const body = a.promptFile
    ? readFileSync(path.resolve(a.promptFile), 'utf8').trim()
    : (a.promptText ?? (a.useOccasionTemplate ? buildOccasionPrompt(a) : readDefaultPrompt()));

  const full = a.keepIdentity ? `${KEEP_IDENTITY_PREFIX}${body}` : body;
  if (full.length > MAX_PROMPT_CHARS) {
    console.warn(`⚠ 提示词 ${full.length} 字,已按 ${MAX_PROMPT_CHARS} 字截断(接口侧 800 token 上限)`);
  }
  return full.slice(0, MAX_PROMPT_CHARS);
}

// ── 请求 ────────────────────────────────────────────────────────────────────

/**
 * 缺省输入照片 = `assets/face-local.webp`(从 `tespro/learn/blend/` 拷来的那张基准脸)。
 *
 * ★ 它是**从网上抓的图**,按那个实验的 README 只能本地学习用 —— `.gitignore` 已挡住它进库。
 *   换自己的照片就直接覆盖这个文件,或 `--image` 指别处。
 * ★ 303×303,**低于接口建议的 384px 下限**(文档:分辨率过低可能导致生成效果模糊)。
 *   拿它验"身份保没保住、审核拦不拦"可以,拿它评画质不行。
 */
const DEFAULT_IMAGE_FILE = path.join(import.meta.dirname, 'assets', 'face-local.webp');

interface BuildResult {
  url: string;
  body: Record<string, unknown>;
}

function buildRequest(a: Argv, prompt: string): BuildResult {
  const apiHost = (process.env.DASHSCOPE_API_HOST ?? DEFAULT_API_HOST).replace(/\/+$/, '');

  // ★ 顺序有讲究:最后一张决定输出比例,所以本人照片必须压轴(见文件头 ★2)。
  //   refs 的长度已在 parseArgv 里归一化过,这里只管拼。
  const images = [...a.refs, a.image];

  const parameters: Record<string, unknown> = { n: a.n, watermark: false };
  if (a.seed !== undefined) parameters.seed = a.seed;
  if (a.negativePrompt) parameters.negative_prompt = a.negativePrompt;
  // size / prompt_extend 只在支持的模型上出现;是否支持已在 parseArgv 判定并归一化(见文件头 ★3)。
  if (supportsSizeParams(a.model)) {
    parameters.prompt_extend = a.promptExtend;
    if (a.size) parameters.size = a.size;
  }

  return {
    url: `${apiHost}${GENERATION_PATH}`,
    body: {
      model: a.model,
      input: {
        messages: [
          {
            role: 'user',
            content: [...images.map((image) => ({ image: toImageField(image) })), { text: prompt }],
          },
        ],
      },
      parameters,
    },
  };
}

interface ApiSuccess {
  output?: { choices?: { message?: { content?: { image?: string }[] } }[] };
  usage?: { image_count?: number; width?: number; height?: number };
  request_id?: string;
}

interface ApiFailure {
  code?: string;
  message?: string;
  request_id?: string;
}

/**
 * 只该重试的**连接阶段**错误码。
 *
 * ★ 判据是「请求**不可能已经送达**」:连都没连上,重试不会产生第二次计费。
 *   **刻意不含 `TimeoutError`**(即 `AbortSignal.timeout` 触发的那个)——那是「已经发出去、
 *   只是没等到响应」,服务端可能真的跑完并计费了,盲目重试会重复烧钱。这一格宁可让用户手动重跑。
 */
const RETRYABLE_CONNECT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
]);

function isConnectPhaseError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    const code = (cur as { code?: string }).code;
    if (code !== undefined && RETRYABLE_CONNECT_CODES.has(code)) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * 一次生成请求(不重试)。
 * ★ 本机到阿里云的路由是**抖的**:同一个主机一次 370ms 通、几分钟后 `Connect Timeout
 *   Error (timeout: 10000ms)`。所以外面必须重试 —— 见 `generate`。
 */
async function postOnce(a: Argv, req: BuildResult): Promise<ApiSuccess | ApiFailure> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      '缺 DASHSCOPE_API_KEY。去 https://bailian.console.aliyun.com 建一个,写进 server/.env(见 .env.example)',
    );
  }
  const res = await fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(a.timeoutMs),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`响应不是 JSON(HTTP ${res.status}):${text.slice(0, 500)}`);
  }
  if (!res.ok) return json as ApiFailure;
  return json as ApiSuccess;
}

async function generate(a: Argv, req: BuildResult, attempts = 3): Promise<ApiSuccess | ApiFailure> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await postOnce(a, req);
    } catch (err) {
      lastErr = err;
      // 非连接阶段的错误(含整体超时)一律不重试,原样抛出。
      if (!isConnectPhaseError(err) || i === attempts) throw err;
      const wait = 1000 * 2 ** (i - 1);
      console.warn(`⚠ 连接失败(第 ${i}/${attempts} 次):${describeError(err).split('\n')[0]} — ${wait}ms 后重试`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 结果 URL 有效期只有 24 小时,所以拿完立刻下载落地。
 *
 * ★ **必须重试**,这不是防御性编程:本机到 OSS 结果域名(`dashscope-*.oss-cn-*.aliyuncs.com`)
 *   的连通是**抖的** —— 实测同一台机器上,一次 `dashscope-a717.oss-cn-beijing...` 直接
 *   `Connect Timeout Error (timeout: 10000ms)`(undici 的默认连接超时,没装 `undici` 包就改不动),
 *   而几分钟后同一个域名返回 403(通)、另一张图从 `oss-cn-hangzhou` 下 1.1MB 走了 11.6 秒。
 *   生成已经成功、只是没下下来,是最亏的一种失败:次数花了,图没了。
 */
async function download(url: string, dest: string, attempts = 3): Promise<number> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`下载结果图失败 HTTP ${res.status}:${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      return buf.length;
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const wait = 1000 * 2 ** (i - 1);
        console.warn(`⚠ 第 ${i}/${attempts} 次下载失败(${describeError(err).split('\n')[0]}),${wait}ms 后重试`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`结果图下载连续 ${attempts} 次失败。图还在(URL 活 24h),可手动 curl 救:\n  ${url}\n  原因:${describeError(lastErr)}`);
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadDotEnvIfPresent(path.resolve(process.cwd(), '.env'));
  const a = parseArgv(process.argv.slice(2));
  const prompt = resolvePrompt(a);
  const promptSource = a.promptFile
    ? `file:${a.promptFile}`
    : a.promptText !== undefined
      ? 'cli:--prompt'
      : a.useOccasionTemplate
        ? `builtin:occasion-template${a.occasion ? `(${a.occasion})` : ''}`
        : `file:${path.relative(process.cwd(), DEFAULT_PROMPT_FILE)}`;
  const req = buildRequest(a, prompt);

  console.log(`模型     ${a.model}`);
  console.log(`端点     ${req.url}`);
  console.log(`输入     本人照片=${a.image}${a.refs.length ? ` · 参考图=${a.refs.join(', ')}` : ''}`);
  console.log(`提示词源 ${promptSource}${a.keepIdentity ? ' + keep-identity 锚句' : ''}`);
  console.log(`提示词   ${prompt.replace(/\n/g, '\n         ')}`);

  if (a.dryRun) {
    // base64 有几 MB,打印出来没法看,替换成占位符即可——这里只为核对**结构**。
    const redacted = JSON.parse(
      JSON.stringify(req.body, (k, v) => (k === 'image' && typeof v === 'string' && v.length > 200 ? `<base64 ${v.length} chars>` : v)),
    );
    console.log('\n--dry-run:请求体(未发送)\n' + JSON.stringify(redacted, null, 2));
    return;
  }

  const startedAt = Date.now();
  const res = await generate(a, req);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  const choices = (res as ApiSuccess).output?.choices;
  const urls = (choices ?? [])
    .flatMap((c) => c.message?.content ?? [])
    .map((c) => c.image)
    .filter((u): u is string => typeof u === 'string');

  if (urls.length === 0) {
    const f = res as ApiFailure;
    console.error(`\n✗ 失败(${elapsed}s)HTTP 返回错误码 ${f.code ?? '?'}:${f.message ?? '(无 message)'}`);
    console.error(`  request_id=${f.request_id ?? '(无)'} —— 排查时带上它`);
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve(a.outDir);
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

  const saved: string[] = [];
  for (const [i, url] of urls.entries()) {
    const dest = path.join(outDir, `${stamp}-${a.name}-${i + 1}.png`);
    const bytes = await download(url, dest);
    saved.push(dest);
    console.log(`✓ ${dest}  (${(bytes / 1024).toFixed(0)} KB)`);
  }

  // ★ 落一份 sidecar:同一套 prompt + 同一张输入图 + 同一个 seed 才谈得上「可对比」。
  //   没有它,过两天没人说得清这张图是哪组参数出的(见 api-spike.md 的夹具与评分表)。
  const sidecar = path.join(outDir, `${stamp}-${a.name}.json`);
  writeFileSync(
    sidecar,
    JSON.stringify(
      {
        model: a.model,
        parameters: req.body.parameters,
        prompt,
        promptSource,
        keepIdentity: a.keepIdentity,
        inputs: { face: a.image, references: a.refs },
        request_id: (res as ApiSuccess).request_id,
        usage: (res as ApiSuccess).usage,
        resultUrls: urls,
        files: saved,
        elapsedSec: Number(elapsed),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\n✓ 耗时 ${elapsed}s · request_id=${(res as ApiSuccess).request_id ?? '(无)'}`);
  console.log(`✓ 参数存档 ${sidecar}`);
  console.log('  注:结果 URL 只活 24 小时,图已落到本地。');
}

/**
 * ★ `fetch` 失败时 `err.message` **只有 `fetch failed` 三个词**,真正的原因
 * (ECONNRESET / 证书 / DNS / 代理 / 超时)全在 `err.cause` 里。
 * 不把它打出来,排查就只能靠猜 —— 这个坑第一版就踩了。
 */
function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur instanceof Error; depth++) {
    const code = (cur as { code?: string }).code;
    parts.push(`${cur.message}${code ? ` [${code}]` : ''}`);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.join('\n  ← ') || String(err);
}

main().catch((err: unknown) => {
  console.error(`\n✗ ${describeError(err)}`);
  process.exitCode = 1;
});
