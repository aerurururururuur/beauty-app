/**
 * 组装根那段适配的单测:`SessionArtifacts` → 真实 `FileSystemArtifactStore`。
 *
 * ★ 为什么值得单独一组:`src/index.ts` 一 import 就跑 `main()`,**它里面的代码测不到**,
 *   而这个适配器里有一条一旦写错就**静默丢数据**的规则——
 *   `putResult(id, …)` 固定写 `results/<id>/result.<ext>`,id 不区分图号就会互相覆盖。
 *   所以那段逻辑搬到了 `src/session-artifacts.ts`,在这里对着**真盘**验。
 *
 * ⚠️ 它测的仍然是"本仓库自己的路径拼得对不对",**不是**"盘上的字节真的没了"
 *   (那是文件系统的责任,`rm` 的行为不由本项目保证)。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSystemArtifactStore } from '../src/modules/assets/index.js';
import { InMemorySessionStore, PurgeExpiredSessions } from '../src/modules/agent/index.js';
import { createSessionArtifacts, renderId } from '../src/session-artifacts.js';

const tempDirs: string[] = [];

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'session-artifacts-'));
  tempDirs.push(dataDir);
  const store = new FileSystemArtifactStore(dataDir);
  // ★ 引擎输出目录按真实配置传(`config.makeupOutDir` = `<DATA_DIR>/engine-out`)——
  //   它就是"哪些源文件可以被删"的那道边界。
  const engineOutDir = path.join(dataDir, 'engine-out');
  return { dataDir, store, artifacts: createSessionArtifacts(store, { engineOutDir }) };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const face = () => ({
  originalName: 'me.png',
  mimeType: 'image/png',
  stream: Readable.from(['face-bytes']),
});

/**
 * 模拟引擎产出的一件中间产物:写在 `<dataDir>/engine-out/<name>`。
 * ★ **每次调用都是一份新的**:引擎按时间戳命名,而收编会把它删掉——
 *   所以"复用同一个路径"不是引擎的行为,测试里也不该那么写。
 */
function engineOutput(dataDir: string, content: string, name = 'out.png'): string {
  const file = path.join(dataDir, 'engine-out', name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString();
}

describe('createSessionArtifacts', () => {
  it('照片:存进去能解析成一个**真实存在**的本机路径(引擎要的是路径,不是流)', async () => {
    const { dataDir, artifacts } = setup();

    const ref = await artifacts.putFace('s1', face());
    const filePath = await artifacts.resolveFace('s1', ref);

    expect(path.isAbsolute(filePath)).toBe(true);
    // ★ 它必须真的在数据目录里(越界会被 store 拦,这里顺手钉住"落在哪")。
    expect(filePath.startsWith(path.resolve(dataDir))).toBe(true);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toBe('face-bytes');
  });

  it('★ 两张图落在**不同**的键上——第二张不许覆盖第一张', async () => {
    const { dataDir, artifacts } = setup();

    const first = await artifacts.putRender('s1', 1, engineOutput(dataDir, '第一张'), 'image/png');
    const second = await artifacts.putRender('s1', 2, engineOutput(dataDir, '第二张'), 'image/png');

    expect(first.storeKey).not.toBe(second.storeKey);
    // ★ 顺手把"落在哪"写死:换掉这一行就等于换掉了盘上的目录布局,该被人看见。
    expect(first.storeKey).toBe('results/s1/r1/result.png');
    expect(second.storeKey).toBe('results/s1/r2/result.png');

    // 两张都读得回来,而且是各自那份。
    const a = await artifacts.readRender('s1', 1);
    const b = await artifacts.readRender('s1', 2);
    expect(await streamText(a!.stream)).toBe('第一张');
    expect(await streamText(b!.stream)).toBe('第二张');
  });

  it('★ 收编之后把引擎那份原图删掉 —— 不删的话 `[I8]` 的"真删"就是假的', async () => {
    const { dataDir, artifacts } = setup();
    const src = engineOutput(dataDir, '上了妆的用户的脸', '20260916-abc.png');

    await artifacts.putRender('s1', 1, src, 'image/png');

    // 盘上那份副本没了,而存储里那份好好的 —— 这正是"收编"该有的样子。
    expect(existsSync(src)).toBe(false);
    const kept = await artifacts.readRender('s1', 1);
    expect(await streamText(kept!.stream)).toBe('上了妆的用户的脸');
  });

  it('★★ 源文件**不在**引擎输出目录里 → 一个字节都不许动它', async () => {
    // ⚠️ 这条防的是一个**真踩过的** bug,不是假想的:
    //    `MockEngine` 返回的 `resultFilePath` 就是 `input.face.filePath`(它不出图,只把输入当输出),
    //    那个路径落在 `inputs/<sid>/face/` 下。没有这道边界的话,第一次出图就会
    //    **把用户上传的照片删掉** —— 而会话里的 `faceRef` 还在,第二次出图 `resolveFace` 解析到空气。
    const { artifacts } = setup();
    const ref = await artifacts.putFace('s1', face());
    const facePath = await artifacts.resolveFace('s1', ref);

    // 引擎"产出"的就是这张照片自己(mock 的行为)。
    await artifacts.putRender('s1', 1, facePath, 'image/png');

    expect(existsSync(facePath)).toBe(true);
    expect(readFileSync(facePath, 'utf8')).toBe('face-bytes');
    // 而且照片还解析得出来(第二次出图靠它)。
    expect(await artifacts.resolveFace('s1', ref)).toBe(facePath);
  });

  it('前缀相近的目录不算"在引擎输出目录里"(`engine-out-2` 不许被删)', async () => {
    const { dataDir, artifacts } = setup();
    // ★ 只比字符串前缀的实现会把这个目录误判成 `engine-out/` —— 同 `ArtifactStore.toAbs` 的规矩。
    const src = engineOutput(dataDir, '不是引擎的产物', path.join('..', 'engine-out-2', 'x.png'));

    await artifacts.putRender('s1', 1, src, 'image/png');

    expect(existsSync(src)).toBe(true);
  });

  it('没配 `engineOutDir` → 不删任何源文件(缺省不产生副作用)', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'session-artifacts-'));
    tempDirs.push(dataDir);
    const artifacts = createSessionArtifacts(new FileSystemArtifactStore(dataDir));
    const src = engineOutput(dataDir, '引擎产物');

    await artifacts.putRender('s1', 1, src, 'image/png');

    // ⚠️ 那就意味着盘上会留下一份真人照:所以组装根**必须**传这一项。
    expect(existsSync(src)).toBe(true);
  });

  it('★ 每一份源文件只被收编一次 —— 源文件是**被消费掉**的', async () => {
    const { dataDir, artifacts } = setup();
    const src = engineOutput(dataDir, '只有这一份');

    await artifacts.putRender('s1', 1, src, 'image/png');

    // ⚠️ 这条是为了把**语义**钉住,不是找 bug:`putResult` 的语义是"拷进来",
    //    而这里额外承担了"收编后处置源文件"。于是**同一个路径不能再 put 第二次**
    //    (调 `putResult` 时会 ENOENT)。生产里不会有事——引擎每次出图都按时间戳
    //    写**新的**文件名(`image-engine.ts` 的 `newFileStamp()`),`replay` 每次也重写一份。
    //    但**写完这条之后要记住**:别写出"一份源文件喂给两次 putRender"的代码。
    await expect(artifacts.putRender('s1', 2, src, 'image/png')).rejects.toThrow();
    expect(await artifacts.readRender('s1', 2)).toBeNull();
  });

  it('读一张不存在的图 → `null`(不是抛错:调用方用它判 404)', async () => {
    const { artifacts } = setup();
    expect(await artifacts.readRender('s1', 7)).toBeNull();
  });

  it('★ `removeAll` 把照片与**全部**成品图一起删掉,且不碰别的会话', async () => {
    const { dataDir, artifacts } = setup();

    const ref = await artifacts.putFace('s1', face());
    const facePath = await artifacts.resolveFace('s1', ref);
    await artifacts.putRender('s1', 1, engineOutput(dataDir, 'img'), 'image/png');
    await artifacts.putRender('s1', 2, engineOutput(dataDir, 'img'), 'image/png');
    // 邻居:前缀相近的另一个会话。
    await artifacts.putRender('s10', 1, engineOutput(dataDir, '邻居的图'), 'image/png');

    await artifacts.removeAll('s1');

    expect(existsSync(facePath)).toBe(false);
    expect(existsSync(path.join(dataDir, 'results', 's1'))).toBe(false);
    expect(await artifacts.readRender('s1', 1)).toBeNull();
    // ★ `s1` 与 `s10` 只差一个字符,但删的边界不许糊。
    const neighbor = await artifacts.readRender('s10', 1);
    expect(neighbor).not.toBeNull();
    // ⚠️ **必须把流读掉**:留着不读的 `fs.ReadStream` 会在 `afterEach` 删掉临时目录之后
    //    才去 open,于是抛一个**没人接的** ENOENT(vitest 会把它记成本次运行的 unhandled error)。
    expect(await streamText(neighbor!.stream)).toBe('邻居的图');
  });

  it('同一份 id,`putRender` 与 `readRender` 用的是**同一个**公式', async () => {
    const { dataDir, artifacts } = setup();

    for (const seq of [1, 2, 3]) {
      // 每张写的是**不同**内容:只比 mimeType 的话,"读回的是别的那张"也照样能过。
      const src = engineOutput(dataDir, `第 ${seq} 张`);
      await artifacts.putRender('s1', seq, src, 'image/png');
      const back = await artifacts.readRender('s1', seq);
      expect(back).not.toBeNull();
      expect(back!.mimeType).toBe('image/png');
      // 读掉流(理由同上一条):不读就是漏一个会抛 ENOENT 的句柄。
      expect(await streamText(back!.stream)).toBe(`第 ${seq} 张`);
    }
    expect(renderId('s1', 2)).toBe('s1/r2');
  });
});

/**
 * ★ `listStored` —— 那个"重启之后照片留在盘上"缺口的钥匙。
 * 它在 TTL 清理的第二遍扫描里被用到(见 `purge-expired-sessions.ts`)。
 */
describe('listStored(盘上有哪些会话)', () => {
  it('照片与产物都算;多张图**只报一个** id(交给 removeAll 一次删干净)', async () => {
    const { dataDir, artifacts } = setup();
    await artifacts.putFace('s1', face());
    await artifacts.putRender('s1', 1, engineOutput(dataDir, '第一张'), 'image/png');
    await artifacts.putRender('s1', 2, engineOutput(dataDir, '第二张'), 'image/png');
    await artifacts.putFace('s2', face());

    const ids = (await artifacts.listStored()).sort();
    // ★ `results/s1/r1/` 那一层嵌套**不能**冒出来当 id:交给 `removeAll` 的必须是
    //   能一次删掉整个会话的那个键。报 `s1/r1` 的话,`s2` 没被漏,但 `s1` 只删掉一张图。
    expect(ids).toEqual(['s1', 's2']);
  });

  it('空数据目录 → 空数组,**不抛**(清理任务会重复跑)', async () => {
    const { artifacts } = setup();
    expect(await artifacts.listStored()).toEqual([]);
  });

  it('★ 只报**目录**,不报文件名(`results/<id>/` 里躺着的是 `result.png`)', async () => {
    const { dataDir, artifacts } = setup();
    await artifacts.putRender('s1', 1, engineOutput(dataDir, '图'), 'image/png');

    const ids = await artifacts.listStored();
    // 少了 `isDirectory()` 那道过滤的话,这里会混进 `result.png` 之类的东西,
    // 而"盘上有哪些会话"这个答案就变成假的了。
    expect(ids).toEqual(['s1']);
    expect(ids.some((id) => id.includes('.'))).toBe(false);
  });
});

/**
 * ★★ 端到端:**真盘 + 真适配器 + 真清理用例**,验"重启之后照片会留下"那个缺口真的关掉了。
 *
 * 上面那两组各自只覆盖一半(一边用假存储验逻辑,一边用真盘验列目录)。
 * 这一条把它们接起来跑——因为这里承诺的是**盘上的字节真的没了**,
 * 而"两半各自都对、接起来不对"正是这种承诺最容易失守的地方。
 */
describe('★ 重启残骸的端到端:真盘上那张照片真的被删掉', () => {
  /**
   * 盘上留一份"上一轮进程"的照片。
   * ⚠️ 文件名是 `putInputFile` **随机生成**的,所以路径要拿返回的 `storeKey` 拼,
   *   不能自己按 `originalName` 猜(猜出来就是一个不存在的路径)。
   */
  const leftoverPhoto = async (dataDir: string) => {
    const store = new FileSystemArtifactStore(dataDir);
    const artifacts = createSessionArtifacts(store, { engineOutDir: path.join(dataDir, 'engine-out') });
    const ref = await artifacts.putFace('ghost', face());
    const abs = path.join(dataDir, ...ref.storeKey.split('/'));
    return { artifacts, abs };
  };

  /** 造一个"还活着"的会话(未到期),用来当对照组。 */
  const liveSession = (id: string) => ({
    id,
    userId: 'u1',
    messages: [],
    renders: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('★ 会话存储空的 + 盘上有照片 → 跑一次清理,照片真的没了', async () => {
    const { dataDir } = setup();
    const { artifacts, abs } = await leftoverPhoto(dataDir);
    expect(readFileSync(abs, 'utf8')).toBe('face-bytes');

    // 重启后的状态:会话存储是**新的、空的**(内存实现,上一轮的全丢了)。
    const sessions = new InMemorySessionStore();
    const { orphans } = await new PurgeExpiredSessions({
      sessions,
      artifacts,
      ttlHours: 24,
    }).execute();

    expect(orphans).toBe(1);
    // ★ 这两句才是 `[I8]` 要的东西:不是"记录没了",是**照片从盘上消失了**。
    expect(existsSync(abs)).toBe(false);
    expect(existsSync(path.join(dataDir, 'inputs', 'ghost'))).toBe(false);
  });

  it('★ 对照组:会话还在(未到期)→ 同一个盘上那份**一个字节都不动**', async () => {
    const { dataDir } = setup();
    const { artifacts, abs } = await leftoverPhoto(dataDir);

    // 这一次 `ghost` 是有主的(还活着)。
    const sessions = new InMemorySessionStore();
    await sessions.create(liveSession('ghost'));

    const { orphans } = await new PurgeExpiredSessions({
      sessions,
      artifacts,
      ttlHours: 24,
    }).execute();

    expect(orphans).toBe(0);
    expect(readFileSync(abs, 'utf8')).toBe('face-bytes');
  });
});
