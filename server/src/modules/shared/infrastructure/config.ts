/**
 * infrastructure/config.ts —— 运行配置。
 * 从 .env / 环境变量读取;不依赖任何框架。组装根在启动前先 loadDotEnvIfPresent。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 天气源开关。与 `weather/compose.ts` 的 WeatherProviderKind 同形(那边独立声明,
 * 免得业务模块反向依赖组装层);两处要一起改。
 */
export type WeatherProviderKind = 'mock' | 'live';

/**
 * 参考源开关。与 `references/compose.ts` 的同名 union 同形,两处要一起改。
 *
 * ★ **刻意不复用别的 union**：曾经的 `AdapterKind` 由 `referenceProvider` 与 `makeupEngine`
 *   共用，往里加 `'live'` 会顺带让 `MAKEUP_ENGINE=live` 变成一个语法合法但语义荒谬的取值。
 *   2026-09-16 引擎接线时把那个共用 union 拆掉了——现在每类开关各有一个。
 */
export type ReferenceProviderKind = 'mock' | 'live';

/**
 * 上妆引擎开关。与 `makeup/compose.ts` 的同名 union 同形,两处要一起改。
 *
 * ★ **刻意没有 `off`。** 这一条从 `server/README.md` 到 `src/index.ts` 已经写过三遍:
 *   流水线没有引擎就出不了成品,**接一个 off 分支只会得到又一个假开关**。
 *
 * ★ **`replay` 不是"离线兜底",是"CI 模式"**(§5.4):它只回放录好的夹具,
 *   **未命中就报错**。所以它既不联网、也不出账单、**也不假装能处理任意输入**——
 *   这三件事与 `mock` 都不同,别把两者当同一类东西。
 *
 * ★ **三个取值一律按「行为」命名,不按厂商**(2026-09-17 改)。
 *   改之前是 `mock | qwen | replay` —— `mock` / `replay` 是按行为,`qwen` 却是按厂商,
 *   一套枚举里混了两种命名法。而类名那边本来是对的(`MockEngine` / `ImageEngine` /
 *   `ReplayEngine`,后者的注释里明写"类名刻意不带厂商"),所以这一处是**配置层
 *   单方面把厂商名焊进了枚举**,读者会以为"真实出图"这件事本身就叫 qwen。
 *   现在 `image` 与类名逐一对齐,**再接第二家生图 API 时不必动这个枚举**。
 *
 * ⚠️ **旧名 `qwen` 刻意不做兼容**(2026-09-17 定):它和任何拼错的值一样,
 *   **启动即失败**,并把合法取值连说明一起打进报错(见 `asKind`)。
 *   ★ 2026-09-18 之前这里是"回落 `mock` 再打一声 `warn`"。改成抛错,是因为那声警告
 *   拦不住:`MAKEUP_ENGINE=qwen` 的 `.env` 会照常启动,而出图那一步悄悄把原图交回来
 *   ——正是本项目反复点名的"假开关",只不过是带着一行日志的假开关。
 */
export type MakeupEngineKind = 'mock' | 'image' | 'replay';

/**
 * 对话 agent 的 LLM 开关。与 `agent/compose.ts` 的同名 union 同形,两处要一起改。
 *
 * ★ **刻意没有 `off`**:对话 agent 没有 LLM 就什么也做不了——这跟 `weather` 那种
 *   "接不上就降级为空列表"的增强项不同。离线要兜底就用 `mock`。
 *
 * ★ **缺省是 `mock`**,与 `weatherProvider` 缺省 `live` 的选择相反,理由是**花钱**:
 *   天气实拉是免费公开接口,模型调用按 token 计费。**缺省值必须是"不会意外产生账单"的那个**,
 *   要用真实模型就显式写 `AGENT_LLM=real`。
 */
export type AgentLlmKind = 'mock' | 'real';

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: string;
  /** 数据目录(任务记录 + 输入/产物文件都在这下面)的绝对路径。 */
  dataDir: string;
  maxUploadMb: number;
  referenceProvider: ReferenceProviderKind;
  /** 参考检索站点基址;仅 referenceProvider='live' 用。换镜像/代理只改这里。 */
  referenceBaseUrl: string;
  /** 参考检索超时毫秒;仅 referenceProvider='live' 用。 */
  referenceTimeoutMs: number;
  /** 上妆引擎:mock(骨架,缺省)| image(真实生图,计费)| replay(回放夹具,CI)。 */
  makeupEngine: MakeupEngineKind;
  /** 生图模型名。缺省 `qwen-image-edit-plus`(§4.4 的四次实测全部基于它)。 */
  makeupModel: string;
  /** 生图模型端点基址(与对话模型共用 DASHSCOPE_API_HOST,但可单独覆盖)。 */
  makeupApiHost: string;
  /** 引擎成品图的落盘目录。 */
  makeupOutDir: string;
  /**
   * record/replay 夹具目录。`image` 时给了就**录**,`replay` 时**必填**(缺了启动即失败)。
   * ★ 缺省不设:与所有开关同一条规矩——缺省值必须没有意外副作用,这里的副作用是**写盘**。
   */
  makeupFixturesDir?: string;
  /** 天气源:live(无 key 实拉,缺省)| mock(离线示意兜底)。 */
  weatherProvider: WeatherProviderKind;
  /** 对话 agent 的模型来源:mock(离线兜底,缺省)| real(真实模型,按 token 计费)。 */
  agentLlm: AgentLlmKind;
  /** 对话模型名。实测可用的候选见 `scripts/probe-tool-calling.ts`。 */
  agentModel: string;
  /** 对话模型端点基址。默认由 DASHSCOPE_API_HOST 拼出兼容模式路径。 */
  agentBaseUrl: string;
  /**
   * §10 `[I3]`:单个会话最多出几张图。`0` 表示**不限制**。
   * 上限存在的理由不是省钱(单张才几分钱),是**失控**:
   * 没有上限时,一个循环里的模型可以连续要求出图,而每一次都要用户点确认——
   * 用户点烦了就会开始闭眼点,那时候"每次确认"这道闸门就已经失效了。
   */
  agentMaxRenders: number;
  /**
   * §10 `[I8]`:会话空闲多少小时算过期(到期**真删**照片与成品图,见 `[I8]` 隐私红线)。
   * 取值见 `.env.example` 那段说明;填 0 无意义(`asPositiveInt` 会回落到缺省)。
   */
  agentSessionTtlHours: number;
  /**
   * 产品库内容目录(`products/<库>/`)的绝对路径。缺省 `server/../products`。
   *
   * ★ **这是全项目唯一一个「指向不存在 = 关掉功能」的配置项**,所以它的解析方式
   *   也和其他目录**刻意不同**:`makeupFixturesDir` 走 `optionalAbsDir`
   *   (空串 = 没给 = 变成 `undefined`),这里**永远返回一个路径**,不存在就让它不存在。
   *
   *   区别的理由:夹具目录"没给"和"给了但不存在"是两件事(前者是正常,后者是配错);
   *   而产品库的**"不存在"本身就是那个开关**——`products/compose.ts` 靠它决定
   *   agent 注不注册产品工具。若这里也做 `optionalAbsDir`,就没人能表达
   *   "我确实不想装产品库"了。回归测试指向一个不存在的路径,靠的正是这一点。
   */
  productsDir: string;
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

const MAKEUP_ENGINE_CHOICES: readonly KindChoice<MakeupEngineKind>[] = [
  { value: 'mock', note: '骨架,把输入照片原样当成品返回' },
  { value: 'image', note: '真实出图,按次计费' },
  { value: 'replay', note: '回放录好的夹具,不联网' },
];

const WEATHER_PROVIDER_CHOICES: readonly KindChoice<WeatherProviderKind>[] = [
  { value: 'mock', note: '离线示意' },
  { value: 'live', note: '无 key 实拉' },
];

const REFERENCE_PROVIDER_CHOICES: readonly KindChoice<ReferenceProviderKind>[] = [
  { value: 'mock', note: '离线兜底,只出文字' },
  { value: 'live', note: '外部检索' },
];

const AGENT_LLM_CHOICES: readonly KindChoice<AgentLlmKind>[] = [
  { value: 'mock', note: '离线演示脚本,不是模型' },
  { value: 'real', note: '真实模型,按 token 计费' },
];

/**
 * ★ **开关取值的唯一解析口。认不出来就抛错——这就是「启动即失败」。**
 *
 * 三种情况分开处置:
 *   1. **没设 / 空串** → 用缺省。这不是错误,是"不配就用缺省"这个正常形态
 *      (`loadDotEnvIfPresent` 会把 `K=` 原样送进来,空串按没给算,同 `optionalAbsDir`)。
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

/** 可选目录:空串/空白视同**没给**(而不是"当前目录"),其余解析成绝对路径。 */
function optionalAbsDir(value: string | undefined): string | undefined {
  const dir = (value ?? '').trim();
  return dir === '' ? undefined : path.resolve(dir);
}

/** 正整数毫秒;非法值回落到缺省,不抛错(与其它开关同一口径)。 */
function asPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * 非负整数。与 `asPositiveInt` **只差在允不允许 0**——
 * 出图上限的 `0` 是一个有意义的取值("不限制"),而 TTL 的 `0` 没有意义,
 * 所以两者不能共用一个函数:共用就得在一处把 0 悄悄改成 1,那是撒谎。
 */
function asNonNegativeInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const makeupFixturesDir = optionalAbsDir(env.MAKEUP_FIXTURES_DIR);

  return {
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 3000),
    logLevel: env.LOG_LEVEL ?? 'info',
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 25),
    // 参考检索缺省仍是 mock:不联网、启动即用。要用真实检索显式设为 live
    // (它失败会降级为空列表,不会拖垮任务,但会让每个任务多几次网络往返)。
    referenceProvider: asKind(
      'REFERENCE_PROVIDER',
      env.REFERENCE_PROVIDER,
      'mock',
      REFERENCE_PROVIDER_CHOICES,
    ),
    referenceBaseUrl: env.REFERENCE_BASE_URL ?? 'https://cn.bing.com',
    referenceTimeoutMs: asPositiveInt(env.REFERENCE_TIMEOUT_MS, 5000),
    // 引擎缺省**仍是 mock**:它不联网、不出账单,是"不会意外花钱"的那一个
    // (与 AGENT_LLM 缺省 mock 同一条理由)。
    makeupEngine: asKind('MAKEUP_ENGINE', env.MAKEUP_ENGINE, 'mock', MAKEUP_ENGINE_CHOICES),
    // 四次实测(§4.4)全部基于 -plus;`-max` / `-2.0-pro` 值不值得换,本文没有对比数据(§14.1)。
    makeupModel: env.QWEN_IMAGE_MODEL ?? 'qwen-image-edit-plus',
    // 与对话模型共用一个域名开关(一个 key 打通两层,§7.5),但允许单独覆盖。
    makeupApiHost: env.DASHSCOPE_API_HOST ?? 'https://dashscope.aliyuncs.com',
    // 引擎的中间产物放 dataDir 下:**它现在没有任何地方清理**(见 makeup/README 的待办,
    // 属 §10 [I8] 那条"会话 TTL 到期照片与产物被真实删除"的同一笔债)。
    makeupOutDir: path.join(env.DATA_DIR ?? './data', 'engine-out'),
    // 夹具目录缺省**不设**(见 ServerConfig 里那条注释:缺省不能有写盘副作用)。
    ...(makeupFixturesDir ? { makeupFixturesDir } : {}),
    // 天气唯一「实拉」的源:缺省就接通,离线演示再用 WEATHER_PROVIDER=mock 关掉。
    weatherProvider: asKind('WEATHER_PROVIDER', env.WEATHER_PROVIDER, 'live', WEATHER_PROVIDER_CHOICES),
    // 对话模型缺省 mock:不联网、不出账单(理由见 AgentLlmKind 的注释)。
    agentLlm: asKind('AGENT_LLM', env.AGENT_LLM, 'mock', AGENT_LLM_CHOICES),
    // qwen-flash 实测 847ms 能跑完整两轮工具调用,是这三项里最快的一档。
    agentModel: env.AGENT_MODEL ?? 'qwen-flash',
    // 复用 DASHSCOPE_API_HOST(与生图脚本同一个域名开关),只是接上兼容模式路径;
    // 端点整体可被 AGENT_BASE_URL 覆盖(换自建代理时不必动代码)。
    agentBaseUrl:
      env.AGENT_BASE_URL ??
      `${env.DASHSCOPE_API_HOST ?? 'https://dashscope.aliyuncs.com'}/compatible-mode/v1`,
    // ★ 缺省 3 与 `agent/application/tools/render-look.ts` 的 `DEFAULT_MAX_RENDERS`
    //   是**同一个数**,两处要一起改(同上面那几个 union 的规矩)。
    agentMaxRenders: asNonNegativeInt(env.AGENT_MAX_RENDERS, 3),
    // ★ 缺省 24 与 `agent/application/usecases/purge-expired-sessions.ts` 的
    //   `DEFAULT_SESSION_TTL_HOURS` 是同一个数,两处要一起改。
    //   这个数**不是调优参数**:它同时是"用户本人的照片在服务端留多久"这个承诺,
    //   改它等于改隐私条款,不该在没有告知的情况下悄悄放大。
    agentSessionTtlHours: asPositiveInt(env.AGENT_SESSION_TTL_HOURS, 24),
    // 缺省指向仓库里真实存在的 `products/`(cwd 按 server/ 算),开箱即有产品库。
    // **不校验存在性**:目录不在 = 关掉产品库,是合法形态(见 ServerConfig 里那条注释);
    // 而"目录在但内容坏"由 `products/compose.ts` 启动即失败,那才是要拦的那种错。
    productsDir: path.resolve(env.PRODUCTS_DIR ?? '../products'),
  };
}
