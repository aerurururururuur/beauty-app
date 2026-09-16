/**
 * agent/domain/ports/session-store.ts —— 会话持久化端口。
 *
 * 形状照 `jobs/domain/ports/job-repository.ts` 与 `cabinet/domain/ports/cosmetic-repository.ts`
 * 的既有分工:端口只声明行为,实现见 `infrastructure/`。
 *
 * ⚠️ **目前仍只有内存实现**(落盘是另一笔待办),但**TTL 的接口已经在这里了**——
 * 它到阶段 3 才有意义,而阶段 3 到了:`render_look` 一进来,**会话里就有真人照片了**,
 * 「即用即删」不再是空谈(红线 §13-4 / §10 `[I8]`)。
 */
import type { Session } from '../entities/session.js';

export interface SessionStore {
  create(session: Session): Promise<void>;
  /** 找不到返回 `null`(照仓库惯例:不抛,由用例翻译成语义错误码)。 */
  find(id: string): Promise<Session | null>;
  /** 整份覆盖保存(会话状态很小,不值得做增量更新)。 */
  save(session: Session): Promise<void>;
  /**
   * ★ 列出 `updatedAt` 早于 `cutoffIso` 的会话(TTL 清理用,§10 `[I8]`)。
   * 传时间戳而不是"TTL 小时数":**钟在用例那边**(可注入、可测),存储只管比较。
   */
  findUpdatedBefore(cutoffIso: string): Promise<Session[]>;
  /** ★ 真删。⚠️ 调用方**必须**同时删掉它的照片与产物,否则盘上留下的是孤片。 */
  delete(id: string): Promise<void>;
}
