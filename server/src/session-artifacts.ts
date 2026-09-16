/**
 * src/session-artifacts.ts —— ★ `agent` 的 `SessionArtifacts` 端口 → `assets` 的 `ArtifactStore`。
 *
 * **为什么单独一个文件,而不是写在 `src/index.ts` 里**:`index.ts` 一 import 就会
 * 跑 `main()`(起服务、连外部),所以它里面的东西**没法被测**。而这个适配器里有**两条**
 * 一旦写错就会静默丢数据的规则——① 那条嵌套 id(少了它第二张图覆盖第一张);
 * ② 收编后删源文件的那道边界(少了它删掉用户上传的照片)。它们恰恰是最该被钉住的两段。
 * 放到这里,`test/session-artifacts.test.ts` 就能直接对着真实文件系统验它们。
 *
 * ★ **它属于组装根那类代码**(§7.1:消费者声明端口,组装根包一层),
 *   所以它在 `src/` 而不是在 `modules/agent/` 里——
 *   `agent` **一行都不该知道** `ArtifactStore` 长什么样。
 *
 * ── 映射规则 ────────────────────────────────────────────────────────────────
 *
 * | 端口这边 | `ArtifactStore` 那边 |
 * |---|---|
 * | 照片 | `inputs/<sessionId>/face/<随机名>`(**原样**,kind 写死 `'face'`) |
 * | 第 n 张成品图 | `results/<sessionId>/r<n>/result.<ext>` |
 * | 删一个会话 | `remove(<sessionId>)`(递归,连上面两者一起删) |
 * | 引擎写的中间产物 | **收编之后删掉**——⚠️ 只看落在 `engineOutDir` 里的(理由见 `disposeScratch`) |
 *
 * ★ **为什么要嵌 `r<seq>` 这一层**:`putResult(id, …)` **固定**写
 *   `results/<id>/result.<ext>`——一个会话出第二张图时会把第一张**覆盖掉**。
 *   一个会话能出多张图是 `[I3]` 的前提,所以这一层是必须的,不是整理癖。
 *   (`remove` 是递归删,所以删会话时那层嵌套不会变成删不掉的垃圾。)
 *
 * ⚠️ **`url` 被丢掉了**:`putResult` 返回的 `url` 是 `jobs` 形状的
 *   (`/jobs/<id>/result`),而这里的取图路由是 agent 自己的
 *   `/agent/sessions/:id/renders/:seq`(由 `turn-view.mapper.ts` 生成)。
 *   两套 URL 混用会让前端去请求一条不存在的路由。
 *
 * ★ **`putRender` 收编之后会把引擎那份原图删掉**——但**只在它确实是引擎的临时产物时**。
 *   理由是隐私,边界为什么是必需的见 `disposeScratch` 的注释。
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactStore } from './modules/assets/index.js';
import type { SessionArtifacts } from './modules/agent/index.js';

export interface SessionArtifactsOptions {
  /**
   * ★ 引擎写中间产物的那个目录(配置里的 `makeupOutDir`,`缺省 <DATA_DIR>/engine-out`)。
   * **只有落在这个目录里的源文件才会在收编后被删掉。**
   * 传 `undefined` = 一份都不删(那会留下一份真人照的副本,见 `disposeScratch` 的注释)。
   */
  engineOutDir?: string;
}

/** 把 `assets` 的存储适配成 agent 要的会话产物端口。 */
export function createSessionArtifacts(
  store: ArtifactStore,
  options: SessionArtifactsOptions = {},
): SessionArtifacts {
  const engineOutDir =
    options.engineOutDir === undefined ? undefined : path.resolve(options.engineOutDir);

  return {
    putFace: (sessionId, file) => store.putInputFile(sessionId, 'face', file),
    resolveFace: (sessionId, ref) => store.resolveToFilePath(sessionId, ref),
    putRender: async (sessionId, seq, sourceFilePath, mimeType) => {
      const { ref } = await store.putResult(renderId(sessionId, seq), sourceFilePath, mimeType);

      await disposeScratch(sourceFilePath, engineOutDir);
      return ref;
    },
    readRender: (sessionId, seq) => store.readResult(renderId(sessionId, seq)),
    removeAll: (sessionId) => store.remove(sessionId),
    // ★ 直接透传:`store.listIds()` 给的已经是**顶层那一段**
    //   (`results/<sessionId>/r1/` 报的是 `<sessionId>`),与端口要的形状一致。
    //   这里**不做** `r<seq>` 那层的还原 —— 端口那边要的是能交给 `removeAll` 的 id。
    listStored: () => store.listIds(),
  };
}

/**
 * ★ **收编之后把引擎那份中间产物删掉**——这是隐私上的必需项,不是清理癖。
 *
 * 真引擎把成品写在 `<DATA_DIR>/engine-out/<时间戳>.png`(`image-engine.ts`),
 * 而那张图**就是用户的脸上了妆**,且**不归任何会话**——TTL 清理永远枚举不到它。
 * 不删的话,`[I8]` 那句"TTL 到期照片与产物被真实删除"就是**假的**:
 * 会话那份删了,`engine-out/` 里的副本永远留着。
 *
 * ⚠️ **但它必须带一道边界,否则会删掉用户的照片。** 不是理论风险,是**已经踩到的**:
 * `MockEngine` 返回的 `resultFilePath` **就是 `input.face.filePath`**(它不出图,
 * 只把输入当输出),而那个路径落在 `inputs/<sessionId>/face/` 下。
 * 无边界地删下去,第一次出图就会**把用户上传的照片删掉**——
 * 会话里 `faceRef` 还在、第二次出图 `resolveFace` 却解析到一个不存在的文件。
 * 所以这里只删**确实落在引擎输出目录里**的源文件;
 * 不落在里面的(照片自己、以及任何别的模块交来的路径)**一律不动**。
 *
 * ⚠️ **删失败不算出图失败**:图已经存好了,只是盘上多留一份。
 * 所以这里只告警、不抛——把它变成失败会让用户以为图没出来,而那更糟。
 */
async function disposeScratch(sourceFilePath: string, engineOutDir: string | undefined): Promise<void> {
  if (engineOutDir === undefined) return;
  const resolved = path.resolve(sourceFilePath);
  // 同 `ArtifactStore.toAbs` 的规矩:必须**真在目录里**,只比前缀会被 `…/engine-out-2` 混过去。
  if (!resolved.startsWith(engineOutDir + path.sep)) return;

  try {
    await rm(resolved, { force: true });
  } catch (err) {
    console.warn(
      `[agent] 收编后删不掉引擎的中间产物 ${resolved}:` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 第 n 张成品图的存储 id。★ **它是这个文件存在的理由**,所以单独一个函数:
 * 写入与读取必须用**同一个**公式,而"两处各拼一遍字符串"正是它们会漂开的方式。
 */
export function renderId(sessionId: string, seq: number): string {
  return `${sessionId}/r${seq}`;
}
