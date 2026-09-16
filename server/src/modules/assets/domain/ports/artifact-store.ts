/**
 * domain/ports/artifact-store.ts —— 图片文件存储端口。
 * 负责输入落盘、产物保存、把存储键解析成本机文件路径(供引擎/分析器读取)。
 * 具体实现(本地文件系统 / 对象存储)属于 infrastructure。
 */
import type { Readable } from 'node:stream';
import type { ImageRef } from '../../../shared/index.js';

export interface UploadFile {
  originalName: string;
  mimeType: string;
  stream: Readable;
}

export type InputKind = 'face' | 'scene';

export interface StoredResult {
  ref: ImageRef; // 相对路径 + mimeType
  url: string; // 形如 /jobs/<id>/result
}

export interface ArtifactStore {
  /** 把上传流式写入输入区,返回 ImageRef(storeKey 相对路径)。 */
  putInputFile(jobId: string, kind: InputKind, file: UploadFile): Promise<ImageRef>;
  /** 把引擎产出的本地文件收编为任务产物,返回相对引用与下载 URL。 */
  putResult(jobId: string, sourceFilePath: string, mimeType: string): Promise<StoredResult>;
  /** 把 ImageRef 解析成可被引擎/分析器直接读取的本机文件路径。 */
  resolveToFilePath(jobId: string, ref: ImageRef): Promise<string>;
  /** 读取任务产物(若已生成)。 */
  readResult(jobId: string): Promise<{ stream: Readable; mimeType: string } | null>;
  /**
   * ★ **真删**这个 id 名下的全部东西:输入区(`inputs/<id>/`)与产物区(`results/<id>/`)。
   *
   * 起因是会话 TTL(§10 `[I8]` / 隐私红线"即用即删")——**只删记录不删文件等于没删**。
   * 在此之前本端口**只有写没有删**,所以盘上那份只增不减。
   *
   * ⚠️ **幂等**:删不存在的不算错(清理任务可能重复跑)。
   * ⚠️ `id` 允许含 `/`(会话用它给多张产物分层,如 `<sessionId>/r1`),
   *   仍然是**相对数据目录**的键——实现里的越界校验照常适用。
   */
  remove(id: string): Promise<void>;

  /**
   * ★ **列出存储里现有的全部顶层 id**(输入区与产物区的并集,去重)。
   *
   * 起因与会 `remove` 相同:会话 TTL 那条隐私红线(`[I8]`)。清理任务此前只能
   * **顺着会话记录**去找文件——而会话是**内存**实现,进程一重启记录就空了,
   * 上一次进程留下的照片于是**没有任何东西能枚举到它**,「真删」在重启后不成立。
   * 这个方法就是那把"从盘这边反查"的钥匙:有它才问得出"盘上这个 id,还有会话认领吗"。
   *
   * ⚠️ **只返回顶层那一段**:`results/<id>/r1/` 这种嵌套产物的 id 是 `<id>`,
   *   不是 `<id>/r1`——调用方要拿它去 `remove`,而 `remove` 是递归删。
   * ⚠️ 不存在的东西返回空数组,**不抛**(同 `remove` 的幂等口径:清理任务会重复跑)。
   */
  listIds(): Promise<string[]>;
}
