/**
 * infrastructure/config.ts —— 运行配置。
 * 从 .env / 环境变量读取;不依赖任何框架。组装根在启动前先 loadDotEnvIfPresent。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type AdapterKind = 'mock' | 'off';

/**
 * 天气源开关。与 `weather/compose.ts` 的 WeatherProviderKind 同形(那边独立声明,
 * 免得业务模块反向依赖组装层);两处要一起改。
 */
export type WeatherProviderKind = 'mock' | 'open-meteo';

/**
 * 参考源开关。与 `references/compose.ts` 的同名 union 同形,两处要一起改。
 *
 * ★ **刻意不复用 `AdapterKind`**：那个 union 由 `referenceProvider` 与 `makeupEngine` 共用，
 *   往里加 `'bing'` 会顺带让 `MAKEUP_ENGINE=bing` 变成一个语法合法但语义荒谬的取值。
 */
export type ReferenceProviderKind = 'mock' | 'off' | 'bing';

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: string;
  /** 数据目录(任务记录 + 输入/产物文件都在这下面)的绝对路径。 */
  dataDir: string;
  maxUploadMb: number;
  referenceProvider: ReferenceProviderKind;
  /** 参考检索站点基址;仅 referenceProvider='bing' 用。换镜像/代理只改这里。 */
  referenceBaseUrl: string;
  /** 参考检索超时毫秒;仅 referenceProvider='bing' 用。 */
  referenceTimeoutMs: number;
  makeupEngine: AdapterKind;
  /** 天气源:open-meteo(无 key 实拉,缺省)| mock(离线示意兜底)。 */
  weatherProvider: WeatherProviderKind;
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

function asAdapterKind(value: string | undefined, fallback: AdapterKind): AdapterKind {
  if (value === 'mock' || value === 'off') return value;
  return fallback;
}

function asWeatherKind(value: string | undefined, fallback: WeatherProviderKind): WeatherProviderKind {
  if (value === 'mock' || value === 'open-meteo') return value;
  return fallback;
}

function asReferenceKind(
  value: string | undefined,
  fallback: ReferenceProviderKind,
): ReferenceProviderKind {
  if (value === 'mock' || value === 'off' || value === 'bing') return value;
  return fallback;
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
    // 参考检索缺省仍是 mock:不联网、启动即用。要用真实检索显式设为 bing
    // (它失败会降级为空列表,不会拖垮任务,但会让每个任务多几次网络往返)。
    referenceProvider: asReferenceKind(env.REFERENCE_PROVIDER, 'mock'),
    referenceBaseUrl: env.REFERENCE_BASE_URL ?? 'https://cn.bing.com',
    referenceTimeoutMs: asPositiveInt(env.REFERENCE_TIMEOUT_MS, 5000),
    makeupEngine: asAdapterKind(env.MAKEUP_ENGINE, 'mock'),
    // 天气唯一「实拉」的源:缺省就接通,离线演示再用 WEATHER_PROVIDER=mock 关掉。
    weatherProvider: asWeatherKind(env.WEATHER_PROVIDER, 'open-meteo'),
  };
}
