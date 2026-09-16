/**
 * agent/domain/ports/session-artifacts.ts —— 会话的照片与产物存取。
 *
 * ★ **它底下就是 `assets` 那份 `ArtifactStore`,没有第二套存储实现。**
 *   (2026-09-16 拍板:照片**复用 `ArtifactStore`**,不新写一个照片存储。)
 *   由**组装根**(`src/index.ts`)包一层注进来,照 `cabinet` 那条先例(§7.1)。
 *
 * ★ **那为什么还要这个端口,而不是让本模块直接用 `ArtifactStore`?** 两个理由:
 *
 * 1. **`ArtifactStore` 的 id 参数叫 `jobId`,而这里装的是会话。**
 *    直接把 `session.id` 传进一个叫 `jobId` 的参数,读起来是"任务",实际是"会话"——
 *    而 `jobs` 已经冻结(§8.1),照着它的词汇写新代码是在给一个停用的概念续命。
 *    适配层里那一次改名是有意的,不是绕远路。
 * 2. **一个会话可以出多张图**,而 `ArtifactStore` 的 `putResult(id, …)` 固定写
 *    `results/<id>/result.<ext>` —— **第二次就覆盖第一次**。所以映射到
 *    `${sessionId}/r${seq}` 这个嵌套 id 是必须的(见适配器),而 `remove(sessionId)`
 *    能连带删掉嵌套目录。这层映射不该长在业务代码里。
 *
 * ⚠️ 端口**故意很窄**(只有 `render_look` 与 TTL 清理要用的四件事)。
 * 不做成 `ArtifactStore` 的镜像:`jobId` 那套里跟会话无关的能力(多张 scene 输入、
 * 下载 URL)在这里没有消费者,提前搬过来只会是没有验证场合的代码。
 */
import type { Readable } from 'node:stream';
import type { ImageRef } from '../../../shared/index.js';

/**
 * 一个上传文件。★ **形状与 `assets` 的 `UploadFile` 逐字相同**,但**刻意各声明一份**:
 * 本模块不 import `assets` 的内部(模块间只经 barrel),而它要的就是
 * `@fastify/multipart` 交出来的那三个字段。适配器透传,不做转换。
 */
export interface PhotoUpload {
  originalName: string;
  mimeType: string;
  stream: Readable;
}

export interface SessionArtifacts {
  /** 存用户上传的本人照片。 */
  putFace(sessionId: string, file: PhotoUpload): Promise<ImageRef>;
  /** 把照片引用解析成本机绝对路径——引擎要的是路径,不是流。 */
  resolveFace(sessionId: string, ref: ImageRef): Promise<string>;
  /**
   * 收编引擎产出的成品图。`seq` 即 `RenderRecord.seq`(**从 1 开始**)——
   * 它进存储键,所以两张图不会互相覆盖。
   */
  putRender(
    sessionId: string,
    seq: number,
    sourceFilePath: string,
    mimeType: string,
  ): Promise<ImageRef>;
  /** 读回一张成品图(对外的取图路由用)。 */
  readRender(sessionId: string, seq: number): Promise<{ stream: Readable; mimeType: string } | null>;
  /**
   * ★ **连照片带全部产物一起真删**(§10 `[I8]` / 隐私红线)。
   * 这是"TTL 到期"与"会话被删"的**唯一落点**——只删会话记录不删文件,
   * 就等于照片永远留在盘上,而那正是 `[I8]` 不许的。
   *
   * ⚠️ 幂等:删一个不存在的东西**不算错**(清理任务可能会重复跑)。
   */
  removeAll(sessionId: string): Promise<void>;
  /**
   * ★ **列出存储里现有的全部会话 id**——注意它问的是**盘**,不是会话存储。
   *
   * 它存在的唯一理由是那条已知缺口:会话是**内存**实现,进程重启即丢,
   * 于是上一次进程留下的照片**没有任何会话能认领,清理任务也枚举不到**——
   * `[I8]` 的"真删"在重启之后就不成立了。
   * 有了这个"从盘这边反查"的能力,清理任务才问得出那句话:
   * **盘上这个 id,还有会话认领吗?** 没有的就是上一轮的残骸,该真删。
   *
   * ⚠️ 返回的是**会话 id**,不是存储键:一个会话的多张图(`<id>/r1`)在这里
   *   只算一个 id,交给 `removeAll` 一次删干净(见适配器)。
   */
  listStored(): Promise<string[]>;
}
