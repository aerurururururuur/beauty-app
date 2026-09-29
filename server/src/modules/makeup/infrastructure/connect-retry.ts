/**
 * makeup/infrastructure/connect-retry.ts —— **付费调用**的失败判据与重试零件。
 *
 * 从 `engine/image-engine.ts` 原样搬出来(出图与读图共用),行为一个字节没变。
 *
 * ★ **为什么特意不含 `TimeoutError`**(`AbortSignal.timeout` 触发的那个):
 *   整体超时意味着"已经发出去、没等到响应",服务端**可能已经跑完并计费**,
 *   盲目重试会重复烧钱。只重试**连接阶段**错误 —— 判据是「请求**不可能已经送达**」。
 *
 * ⚠️ `agent/infrastructure/llm/dashscope-llm.ts` 那份**没有并进来,而且不该并**:
 *   它是纯文本 LLM,一次调用几乎不要钱,所以它的集合刻意**不含 `EPIPE`**
 *   (写请求体时对端断开,理论上"可能写进去了一半")。这是**两条成本模型不同的策略**,
 *   不是同一份的两份拷贝 —— 别看到相似就合并(同 `shared/.../zod-issues.ts` 文件头那条)。
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

/** 错误链上任何一环命中可重试的 code 就算连接阶段错误。 */
export function isConnectPhaseError(err: unknown): boolean {
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
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as NodeJS.ErrnoException).code;
    parts.push(`${cur.message}${code ? ` [${code}]` : ''}`);
    cur = cur.cause;
  }
  return parts.join(' ← ') || String(err);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
