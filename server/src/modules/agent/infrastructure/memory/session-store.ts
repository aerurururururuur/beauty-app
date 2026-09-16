/**
 * infrastructure/memory/session-store.ts —— 内存会话存储。
 *
 * ⚠️ **进程重启即丢。** 这一点仍然是故意的(§9 只要求"存服务端",内存是在服务端;
 * 落盘是 `README` 里另一笔待办,替换点就是 `compose.ts` 一行——端口已经把形状定死了)。
 *
 * ★ **但盘上那份是会留下的**(照片与产物在 `dataDir` 下),所以本实现有一个后果:
 * **重启之后,上一次进程留下的照片没有会话能认领。**
 *
 * ⚠️ 这个后果**曾经是漏的,现在已由清理任务自己兜住**(2026-09-16):
 * `PurgeExpiredSessions` 扫**两遍**,第二遍从盘反查"没有会话认领的目录"并真删
 * (见 `purge-expired-sessions.ts` 文件头)。所以 `[I8]` 的「真删」
 * **不再只在"没重启过"的前提下成立**。
 *
 * ★ 所以本实现的这条性质现在只影响**会话本身**(重启后用户看到的是新会话),
 *   不再影响**隐私承诺**——那是两条此前被绑在一起、现在拆开了的事。
 *   会话落盘仍然是一笔待办(为了"接着聊"),但它**不再是隐私那条的前提**。
 *
 * 目录名用 `memory/` 而不是 `json/`:后者会让人以为它落盘。
 */
import type { Session } from '../../domain/entities/session.js';
import type { SessionStore } from '../../domain/ports/session-store.js';

export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.map.set(session.id, session);
  }

  async find(id: string): Promise<Session | null> {
    return this.map.get(id) ?? null;
  }

  async save(session: Session): Promise<void> {
    this.map.set(session.id, session);
  }

  async findUpdatedBefore(cutoffIso: string): Promise<Session[]> {
    // ISO-8601 是定长格式,字符串比较即时间比较(不用 `Date` 解析,免得时区来回转)。
    return [...this.map.values()].filter((s) => s.updatedAt < cutoffIso);
  }

  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }

  /** 断言/清理辅助(演示与测试用)。 */
  size(): number {
    return this.map.size;
  }
}
