/**
 * infrastructure/config.ts —— 运行配置。
 * 从 .env / 环境变量读取;不依赖任何框架。组装根在启动前先 loadDotEnvIfPresent。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ★ **2026-10-02:演示模式的三个开关连同假实现一起删了** ——
 *   `MAKEUP_ENGINE` / `AGENT_LLM` / `WEATHER_PROVIDER` 都不再看环境变量:
 *   引擎一律 `ImageEngine`、对话一律 `DashScopeLlm`、天气一律 open-meteo。
 *   三个假件(`MockEngine` / `DemoLlm` / `MockWeatherProvider`)搬去了 `test/helpers/`,
 *   只给测试当替身,生产代码里再也拿不到它们。
 *   ⇒ 代价是**服务不再有离线档**:没配 `DASHSCOPE_API_KEY` 就**启动即失败**
 *     (见 `src/index.ts` 开头那道检查)。
 */

/**
 * 读图分析开关(`face` / `scene` / `style`)。与 `makeup/compose.ts` 的同名 union
 * 同形,两处要一起改。
 *
 * ★ **这个开关可以有 `off`,与引擎/模型那种「刻意没有 off」不矛盾:**
 *   没有引擎就出不了成品;而**分析今天本来就等于没有**,`off` 说的正是当下的真实状态。
 *   代价是一条纪律:**`off` 时入口一条都不出现**——不许"收了图但什么都不发生",
 *   那就是标准的假开关。
 *
 * ★ **刻意没有 `mock`。** 引擎的 mock 是安全的——它的产物**就是输入照**,假得**看得见**;
 *   而分析的 mock 是**造一个结论**:一个编出来的肤色会一路流进妆面单和提示词,
 *   **假得看不见**。测试要的假货放 `test/helpers/fakes.ts`,不进运行时。
 */
export type VisionAnalyzerKind = 'off' | 'real';

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: string;
  /** 数据目录(会话记录 + 输入/产物文件都在这下面)的绝对路径。 */
  dataDir: string;
  maxUploadMb: number;
  /** 生图模型名。缺省 `qwen-image-edit-plus`(§4.4 的四次实测全部基于它)。 */
  makeupModel: string;
  /** 生图模型端点基址(与对话模型共用 DASHSCOPE_API_HOST,但可单独覆盖)。 */
  makeupApiHost: string;
  /** 引擎成品图的落盘目录。 */
  makeupOutDir: string;
  /** 读图分析:off(缺省,分析入口根本不注册)| real(真实多模态模型,按 token 计费)。 */
  visionAnalyzer: VisionAnalyzerKind;
  /** 视觉模型名。与生图模型并列的第二个模型名(同 key、同域名,不新增凭据)。 */
  visionModel: string;
  /** 视觉模型的兼容模式基址。拼法与 `agentBaseUrl` 相同(见那里的注释)。 */
  visionBaseUrl: string;
  /** 对话模型名。实测可用的候选见 `scripts/probe-tool-calling.ts`。 */
  agentModel: string;
  /** 对话模型端点基址。默认由 DASHSCOPE_API_HOST 拼出兼容模式路径。 */
  agentBaseUrl: string;
  /**
   * §10 `[I8]`:会话空闲多少小时算过期(到期**真删**照片与成品图,见 `[I8]` 隐私红线)。
   * 取值见 `.env.example` 那段说明;填 0 无意义(`asPositiveInt` 会回落到缺省)。
   */
  agentSessionTtlHours: number;
  /**
   * 产品库内容目录(`products/<库>/`)的绝对路径。缺省 `server/../products`。
   *
   * ★ **这是全项目唯一一个「指向不存在 = 关掉功能」的配置项**,所以它**永远返回一个路径**,
   *   不存在就让它不存在(而不是解析成 `undefined`)——`products/compose.ts` 靠它决定
   *   agent 注不注册产品工具。若这里也做"空串 = 没给"那套,就没人能表达
   *   "我确实不想装产品库"了。回归测试指向一个不存在的路径,靠的正是这一点。
   */
  productsDir: string;
  /**
   * 面部词表内容目录的绝对路径。缺省 `server/../assests/face-catalog`。
   *
   * ⚠️ **与 `productsDir` 相反:指向不存在的路径 = 启动即失败**,不是"关掉识别"。
   *   词表是 `skinTone` 合法档位的来源,缺了它整条 brief 校验无从谈起 ——
   *   所以"没有词表"不是一种部署形态,是配置错误(详见 `face-catalog/compose.ts`)。
   */
  faceCatalogDir: string;
}

/**
 * ★ **读 key 的函数,而不是 `ServerConfig` 的一个字段。**
 *
 * 理由:`ServerConfig` 会被传进 `buildApp` 并长期挂在 `app` 上,任何一次
 * `app.log.info(config)` 式的调试都会把整个配置对象打进日志。
 * **secret 不进那个对象**是最省事的防线——不需要靠"记得别打印它"来保证。
 * (同类先例:用户密码从不进 config,只存 scrypt 凭据。)
 */
export function readDashScopeApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return (env.DASHSCOPE_API_KEY ?? '').trim();
}

/** 若存在 .env 文件则把它读入 process.env(已有的环境变量优先,不覆盖)。 */
export function loadDotEnvIfPresent(file = '.env'): void {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined && key) process.env[key] = value;
  }
}

/**
 * 开关的合法取值表。★ **解析与报错共用这一份**——两处各抄一遍的话,
 * 迟早出现"报错说合法、解析却不认"的错位。
 */
interface KindChoice<T extends string> {
  value: T;
  /** 报错里跟在取值后面的短说明,形如 `real(真实模型,按 token 计费)`。 */
  note: string;
}

const VISION_ANALYZER_CHOICES: readonly KindChoice<VisionAnalyzerKind>[] = [
  { value: 'off', note: '不注册分析入口(缺省)' },
  { value: 'real', note: '真实读图,按 token 计费' },
];

/**
 * ★ **开关取值的唯一解析口。认不出来就抛错——这就是「启动即失败」。**
 *
 * 三种情况分开处置:
 *   1. **没设 / 空串** → 用缺省。这不是错误,是"不配就用缺省"这个正常形态
 *      (`loadDotEnvIfPresent` 会把 `K=` 原样送进来,空串按没给算)。
 *   2. **认得的取值** → 用它。
 *   3. **设了但不认得** → 抛错,并把合法取值**连同说明**列全。
 *
 * 第 3 条在 2026-09-18 之前是静默回落(只有 `MAKEUP_ENGINE` 会打一声 `warn`)。
 * 改成抛错,是因为那两种处置都会得到**同一样东西——假开关**:
 * 旧 `.env` 里写着 `AGENT_LLM=dashscope`,服务照常启动、端口通、日志干净,
 * 而模型调用已经悄悄换成了那段离线脚本。**这种事该在启动那一秒暴露,不是演示当天。**
 * 一声 `warn` 拦不住它:日志会被刷过去,而故障现场在几分钟之后。
 *
 * `note` 写进报错里,是为了让那一行**直接可照抄**——只说"非法取值",
 * 等于把人丢回 `.env.example` 再翻一遍。
 */
function asKind<T extends string>(
  name: string,
  value: string | undefined,
  fallback: T,
  choices: readonly KindChoice<T>[],
): T {
  const raw = (value ?? '').trim();
  if (raw === '') return fallback;
  if (choices.some((c) => c.value === raw)) return raw as T;
  const list = choices
    .map((c) => `${c.value}(${c.note}${c.value === fallback ? ',缺省' : ''})`)
    .join(' / ');
  throw new Error(
    `${name} 不认识 "${raw}"。合法取值:${list};留空或不设则用缺省 ${fallback}。` +
      '合法取值与说明见 .env.example。',
  );
}

/** 正整数毫秒;非法值回落到缺省,不抛错(与其它开关同一口径)。 */
function asPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 3000),
    logLevel: env.LOG_LEVEL ?? 'info',
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 25),
    // 四次实测(§4.4)全部基于 -plus;`-max` / `-2.0-pro` 值不值得换,本文没有对比数据(§14.1)。
    makeupModel: env.QWEN_IMAGE_MODEL ?? 'qwen-image-edit-plus',
    // 与对话模型共用一个域名开关(一个 key 打通两层,§7.5),但允许单独覆盖。
    makeupApiHost: env.DASHSCOPE_API_HOST ?? 'https://dashscope.aliyuncs.com',
    // 引擎的中间产物放 dataDir 下:**它现在没有任何地方清理**(见 makeup/README 的待办,
    // 属 §10 [I8] 那条"会话 TTL 到期照片与产物被真实删除"的同一笔债)。
    makeupOutDir: path.join(env.DATA_DIR ?? './data', 'engine-out'),
    // 分析缺省 off:今天的真实状态就是"没有这个能力"。
    // ✏️ 2026-09-30:它现在管**两族**入口——agent 的 `/images` `/analyses`,
    //    加上 user 的 `POST /personas/analyze`(读脸)。两边同一条纪律:
    //    `off` ⇒ 路由**根本不注册**,且 `canAnalyzeFace: false`。
    visionAnalyzer: asKind('VISION_ANALYZER', env.VISION_ANALYZER, 'off', VISION_ANALYZER_CHOICES),
    // ⚠️ 这个缺省名**没实测过**:别把一次"模型不存在"的失败读成"读图形状不对"。
    //    用之前先 `npm run probe:vision` 确认这个名字在该端点上存在。
    visionModel: env.QWEN_VISION_MODEL ?? 'qwen-vl-max',
    // 与 agentBaseUrl 同一个拼法(同 key、同域名开关);它没有单独的开盖变量,理由见 .env.example。
    visionBaseUrl: `${env.DASHSCOPE_API_HOST ?? 'https://dashscope.aliyuncs.com'}/compatible-mode/v1`,
    // qwen-flash 实测 847ms 能跑完整两轮工具调用,是这三项里最快的一档。
    agentModel: env.AGENT_MODEL ?? 'qwen-flash',
    // 复用 DASHSCOPE_API_HOST(与生图脚本同一个域名开关),只是接上兼容模式路径;
    // 端点整体可被 AGENT_BASE_URL 覆盖(换自建代理时不必动代码)。
    agentBaseUrl:
      env.AGENT_BASE_URL ??
      `${env.DASHSCOPE_API_HOST ?? 'https://dashscope.aliyuncs.com'}/compatible-mode/v1`,
    // ★ 缺省 24 与 `agent/application/usecases/purge-expired-sessions.ts` 的
    //   `DEFAULT_SESSION_TTL_HOURS` 是同一个数,两处要一起改。
    //   这个数**不是调优参数**:它同时是"用户本人的照片在服务端留多久"这个承诺,
    //   改它等于改隐私条款,不该在没有告知的情况下悄悄放大。
    agentSessionTtlHours: asPositiveInt(env.AGENT_SESSION_TTL_HOURS, 24),
    // 缺省指向仓库里真实存在的 `products/`(cwd 按 server/ 算),开箱即有产品库。
    // **不校验存在性**:目录不在 = 关掉产品库,是合法形态(见 ServerConfig 里那条注释);
    // 而"目录在但内容坏"由 `products/compose.ts` 启动即失败,那才是要拦的那种错。
    productsDir: path.resolve(env.PRODUCTS_DIR ?? '../products'),
    // 缺省指向仓库里真实存在的那一份。★ 这里**不校验存在性**,但也不像 productsDir
    // 那样"不存在 = 关掉功能":不存在会在 `createFaceCatalogModule` 里启动即失败。
    faceCatalogDir: path.resolve(env.FACE_CATALOG_DIR ?? '../assests/face-catalog'),
  };
}
