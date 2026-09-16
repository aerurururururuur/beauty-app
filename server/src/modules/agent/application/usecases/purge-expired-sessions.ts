/**
 * application/usecases/purge-expired-sessions.ts —— ★ TTL 清理(§10 `[I8]` / 隐私红线)。
 *
 * 会话里存着**用户本人的照片**。所以到期不只是"会话翻不到了",而是
 * **照片与成品图必须真的从盘上消失**——只删会话记录等于照片永远留着,
 * 而那正是 `[I8]` 明写不许的。本文件就是那件事的落点。
 *
 * ── 两条顺序/容错上的取舍 ──────────────────────────────────────────────────
 *
 * 1. ★ **先删文件,再删记录。** 反过来的话,删记录成功、删文件失败,
 *    这个会话就**再也没人认领了**(清理任务是按会话记录去找文件的)——
 *    盘上留下一张永远删不掉的真人照片。反过来失败只是"这次没删干净",
 *    下一次扫描还会再遇到它,能自愈。
 * 2. ★ **一个一个来,失败不中断整轮。** 清理是后台任务,单个会话删不掉
 *    (权限、文件被占)不该让**其它**到期的照片继续留着。失败的记日志、跳过。
 *
 * ── 两遍扫描 ────────────────────────────────────────────────────────────────
 *
 * ★ 本任务跑**两遍**,因为"到期的会话"与"没人认领的文件"是两件事:
 *
 * 1. **顺会话记录找**(原来那遍):记录过期 → 删它的文件 → 删记录。
 * 2. **从盘反查**(补的那遍):列出存储里现有的 id,**没有会话认领的**直接真删。
 *
 * 第 2 遍补的是一个**曾经写在这里、现在已关掉的缺口**:会话此前是内存实现,
 * 进程重启即丢,上一次进程留下的照片**没有任何会话能认领、第 1 遍也枚举不到**——
 * 于是 `[I8]` 那条"TTL 到期照片与产物被真实删除"在**重启之后就漏了**。
 * 原文写的是"它随会话落盘一起关掉",但那是把一条**隐私承诺**挂在一个功能排期上:
 * 重启是常态(开发、发版、崩溃),而承诺是"最多留 24 小时",不是"最多留到我们做完落盘"。
 * 所以单独关掉,**不等落盘**。
 *
 * ⚠️ 第 2 遍**不需要判过期**:一个 id 没有任何会话认领,就**永远不可达**了
 *   (会话只能经会话存储取到),它是不是刚到 TTL 与用户无关——早点删只有好处。
 *   这也让这一遍不必去猜目录的 mtime(目录时间戳在跨平台上语义不一致,
 *   拿它当"年龄"是个会骗人的近似)。
 * ⚠️ 等会话真的落盘之后,第 2 遍**仍然保留**:那时它会从"唯一手段"变成
 *   "兜底自愈"(比如某次 `remove` 失败留下的残骸,下一轮扫到就清掉)。
 */
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { SessionStore } from '../../domain/ports/session-store.js';

/**
 * 默认会话空闲多久算过期(小时)。
 * ★ 与 `shared/infrastructure/config.ts` 的 `AGENT_SESSION_TTL_HOURS` 缺省值是同一个数,
 *   两处要一起改。
 *
 * **为什么是 24**:它同时是「用户本人的照片在服务端最多留多久」这个承诺。
 * 一次试妆的前后(挑妆、出图、给朋友看)都在一天之内;再长,留在盘上的照片
 * 对用户已经没有用处,只剩下风险。**改大它不是性能调优,是改隐私条款。**
 */
export const DEFAULT_SESSION_TTL_HOURS = 24;

export interface PurgeOptions {
  sessions: SessionStore;
  artifacts: SessionArtifacts;
  /** 会话空闲多久算过期。★ 由配置保证 > 0(`asPositiveInt` 会回落,不会给出 0)。 */
  ttlHours: number;
  /** 时钟注入,只为让用例可测(缺省 `Date.now`)。 */
  now?: () => number;
}

export class PurgeExpiredSessions {
  constructor(private readonly opts: PurgeOptions) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  /**
   * 扫两遍(见文件头)。返回删了几个**会话**(给日志用)。
   * ⚠️ 第 2 遍删掉的孤儿**不计入** `purged`:它删的不是会话,是没人认领的文件,
   *   混进同一个数会让日志读起来像"清掉了 N 个会话",而那不是发生的事。
   */
  async execute(): Promise<{ purged: number; orphans: number }> {
    const cutoffIso = new Date(
      this.now() - this.opts.ttlHours * 60 * 60 * 1000,
    ).toISOString();
    const expired = await this.opts.sessions.findUpdatedBefore(cutoffIso);

    let purged = 0;
    for (const session of expired) {
      try {
        // 见文件头取舍 1:文件在前。`removeAll` 幂等,重复跑不会出错。
        await this.opts.artifacts.removeAll(session.id);
        await this.opts.sessions.delete(session.id);
        purged++;
      } catch (err) {
        // 见文件头取舍 2:跳过这一条,继续扫下一条。
        console.warn(
          `[agent] 清理会话 ${session.id} 失败,跳过(下次扫描会再试):` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { purged, orphans: await this.sweepOrphans() };
  }

  /**
   * 第 2 遍:盘上那些**没有会话认领**的 id,真删。
   *
   * ★ 这是那个"重启之后照片留在盘上"缺口的落点,见文件头。
   * 判据只有一条:**`sessions.find(id)` 找不到**。找到了就说明它有主
   * (可能还没到期,也可能上一遍正好删失败、下一轮再试),一律不碰。
   */
  private async sweepOrphans(): Promise<number> {
    let orphans = 0;
    let stored: string[];
    try {
      stored = await this.opts.artifacts.listStored();
    } catch (err) {
      // 连盘都列不出来(权限、目录被占):记一声就走,**不要**让整轮清理抛出去——
      // 第 1 遍那些到期的会话已经删完了,把它们的成果一起rollback是不成立的。
      console.warn(
        `[agent] 列不出存储里的会话目录,跳过孤儿清理:` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }

    for (const sessionId of stored) {
      try {
        if (await this.opts.sessions.find(sessionId)) continue;
        await this.opts.artifacts.removeAll(sessionId);
        orphans++;
        // 孤儿是**异常情况**(正常流程里每个目录都有会话),所以要看得见。
        console.warn(`[agent] 清掉一个没有会话认领的存储目录:${sessionId}`);
      } catch (err) {
        // 同第 1 遍:单条失败不中断整轮。
        console.warn(
          `[agent] 清理孤儿目录 ${sessionId} 失败,跳过(下次扫描会再试):` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return orphans;
  }
}
