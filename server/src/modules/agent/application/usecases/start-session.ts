/**
 * application/usecases/start-session.ts —— 开一个新会话。
 *
 * 很薄是**故意的**:开会话唯一真正的决定是"会话状态里放什么",而那已经由
 * `entities/session.ts` 定死了(`messages[]` + `brief` + `lookSpec`)。
 * 用例不再自己攒一份状态。
 *
 * ★ 唯一多出来的一道判断是**归属用户是否存在**(经 `UserDirectory` 端口)。
 *   为什么值得挡:见 `domain/ports/user-directory.ts` 的文件头——
 *   不挡的话,一个不存在的用户会拿到 201,然后聊到模型调 `list_cabinet`
 *   才撞上一个**它无法修复**的错误。同 `cabinet` 的 `AddCosmetic` 一道规矩。
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/index.js';
import type { SessionStore } from '../../domain/ports/session-store.js';
import type { UserDirectory } from '../../domain/ports/user-directory.js';
import type { Session } from '../../domain/entities/session.js';
import { createSession } from '../../domain/entities/session.js';

export class StartSession {
  constructor(
    private readonly deps: {
      sessions: SessionStore;
      users: UserDirectory;
    },
  ) {}

  async execute(userId: string): Promise<Session> {
    // ★ 顺序:**先问"这人存在吗",再谈存什么**——所以检查在建实体、落库之前。
    //   同 `AddCosmetic`,连错误文案都一致(`用户不存在:<id>`)。
    //   这和"多一条垃圾记录"不是一个量级的问题,理由见端口文件头。
    if (!(await this.deps.users.exists(userId))) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, `用户不存在:${userId}`);
    }

    // id 由调用方生成(同 `createCosmeticItem` 的约定:实体工厂不自己抽 id)。
    const session = createSession(randomUUID(), userId);
    await this.deps.sessions.create(session);
    return session;
  }
}
