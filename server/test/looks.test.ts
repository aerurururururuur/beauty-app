/**
 * looks.test.ts —— 「我的妆容档案」模块单测。
 *
 * 守四条,按重要性排:
 *   ① ★★ **封面扛得住 agent 的孤儿清扫**:档案字节在 `look-covers/` 新根上,
 *      `listIds()` 枚举不到它,所以清扫不会碰它(最后一组,对着真盘验)。
 *   ② **存不下来时盘上什么都没写**:源图解析不到 / 字节复制失败 / 记录写失败,
 *      三种半截状态都不许留 —— `look-covers/` **没有清扫器**兜底,漏下的字节永远在盘上。
 *   ③ **归属**:不符一律 `LOOK_NOT_FOUND`,且记录与字节一个字都不动。
 *   ④ **删的顺序**:先字节后记录(字节删失败时记录还在,用户能再删一次)。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import type { ResolvedImage } from '../src/modules/shared/index.js';
import { FileSystemArtifactStore } from '../src/modules/assets/index.js';
import { InMemorySessionStore, PurgeExpiredSessions } from '../src/modules/agent/index.js';
import {
  AddLook,
  JsonLookRepository,
  ListLooks,
  Look,
  MAX_ITEMS_PER_USER,
  MAX_KEYWORDS,
  MAX_STEPS,
  ReadLookCover,
  RemoveLook,
  createLook,
  lookSchema,
  validateCreateInput,
  validateLookId,
  validateOwnerQuery,
} from '../src/modules/looks/index.js';
import type { CreateLookInput } from '../src/modules/looks/index.js';
import { createSessionArtifacts, renderId } from '../src/session-artifacts.js';
import {
  FakeLookCoverStore,
  FakeLookRepository,
  FakeRenderSource,
  FakeUserDirectory,
} from './helpers/fakes.js';

const IMAGE: ResolvedImage = { filePath: '/fake/results/s1/r1/result.png', mimeType: 'image/png' };

/** 一份合法的存档入参;用例按需覆盖其中几格。 */
function payload(overrides: Partial<CreateLookInput> = {}): CreateLookInput {
  return {
    userId: 'u1',
    sessionId: 's1',
    seq: 1,
    sceneId: '',
    sceneName: '聚会',
    styleId: 'natural',
    styleName: '清透日常妆',
    lookDescription: '一套清透的日常妆',
    summary: '轻底妆 + 蜜桃色腮红',
    keywords: ['清透', '日常'],
    stepCount: 2,
    palette: [{ code: 'B01', name: '蜜桃色', hex: '#f0a0a0' }],
    products: [{ pid: 'p1', code: 'B01', name: '腮红', hex: '#f0a0a0' }],
    steps: [
      { id: 'natural-01', name: '打底', desc: '先上一层薄薄的底妆', tips: ['少量多次'] },
      { id: 'natural-02', name: '腮红', desc: '扫在苹果肌', tips: [] },
    ],
    personalized: [
      {
        id: 'f1',
        group: 'face',
        groupName: '脸型',
        name: '圆脸',
        desc: '脸型偏圆',
        fix: '腮红斜向上扫',
        products: ['腮红'],
      },
    ],
    ...overrides,
  };
}

/** 直接造一条落盘行(绕过用例,给"列表里有几条"这类场景铺数据)。 */
function makeLook(
  id: string,
  overrides: Partial<CreateLookInput> = {},
  createdAt?: string,
): Look {
  const look = createLook({ ...payload(overrides), id, coverMime: 'image/png' });
  return createdAt ? new Look({ ...look, createdAt }) : look;
}

function setup(
  options: {
    users?: string[];
    images?: Record<string, Record<number, ResolvedImage>>;
  } = {},
) {
  const items = new FakeLookRepository();
  const users = new FakeUserDirectory(options.users ?? ['u1', 'u2']);
  const renders = FakeRenderSource.of(options.images ?? { s1: { 1: IMAGE } });
  const covers = new FakeLookCoverStore();
  return {
    items,
    users,
    renders,
    covers,
    addLook: new AddLook({ items, users, renders, covers }),
    listLooks: new ListLooks({ items, users }),
    removeLook: new RemoveLook({ items, covers }),
    readLookCover: new ReadLookCover({ items, covers }),
  };
}

describe('AddLook', () => {
  it('存一版:回视图,字节复制到档案名下,记录落库', async () => {
    const s = setup();

    const view = await s.addLook.execute(payload());

    expect(view.styleName).toBe('清透日常妆');
    expect(view.sceneName).toBe('聚会');
    expect(view.keywords).toEqual(['清透', '日常']);
    expect(view.steps[0]).toEqual({
      id: 'natural-01',
      name: '打底',
      desc: '先上一层薄薄的底妆',
      tips: ['少量多次'],
    });
    expect(view.personalized[0]?.products).toEqual(['腮红']);
    // ★ coverUrl 是**裸路径**:不含基址、不含 userId(前端拼)。
    expect(view.coverUrl).toBe(`/looks/${view.id}/cover`);
    expect(view.coverUrl).not.toContain('http');
    expect(view.coverUrl).not.toContain('u1');

    // 复制的是**解析出来的源路径**,而且是复制不是引用(键由 lookId 推导)。
    expect(s.covers.saved).toEqual([
      { lookId: view.id, sourceFilePath: IMAGE.filePath, mimeType: IMAGE.mimeType },
    ]);
    expect(s.covers.has(view.id)).toBe(true);
    expect(s.items.size()).toBe(1);
    // mime 由服务端从解析结果写,不信客户端。
    expect((await s.items.findById(view.id))?.coverMime).toBe('image/png');
  });

  it('★ 源图解析不到 ⇒ LOOK_COVER_UNAVAILABLE,且**盘上什么都没写**', async () => {
    // 会话里没有第 1 张图(或会话已经过期被清)——四种"拿不到"都收敛成这一步。
    const s = setup({ images: {} });

    const err = await s.addLook.execute(payload()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(ErrorCode.LOOK_COVER_UNAVAILABLE);

    // 红线:接缝问过一次,但**一次复制、一条记录都没发生**。
    expect(s.renders.calls).toEqual([{ sessionId: 's1', seq: 1, userId: 'u1' }]);
    expect(s.covers.saved).toEqual([]);
    expect(s.items.size()).toBe(0);
  });

  it('未知账号 ⇒ USER_NOT_FOUND,不落库、也不去解析源图', async () => {
    const s = setup({ users: [] });

    await expect(s.addLook.execute(payload())).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
    expect(s.items.size()).toBe(0);
    // 账号都不存在,不该先去问图。
    expect(s.renders.calls).toEqual([]);
  });

  it(`到上限(${MAX_ITEMS_PER_USER} 版)⇒ LOOK_FULL,details 带着上限`, async () => {
    const s = setup();
    for (let i = 0; i < MAX_ITEMS_PER_USER; i += 1) {
      await s.items.save(makeLook(`l${i}`, { sessionId: `other-${i}` }));
    }

    const err = await s.addLook.execute(payload()).catch((e: unknown) => e);
    expect((err as AppError).code).toBe(ErrorCode.LOOK_FULL);
    expect((err as AppError).details).toEqual({ limit: MAX_ITEMS_PER_USER });
    expect(s.items.size()).toBe(MAX_ITEMS_PER_USER);
    expect(s.covers.saved).toEqual([]);
  });

  it('★ 幂等:同一张图再存一次直接回那条,不重复建档、不重复复制字节', async () => {
    const s = setup();

    const first = await s.addLook.execute(payload());
    const again = await s.addLook.execute(payload());

    expect(again.id).toBe(first.id);
    expect(s.items.size()).toBe(1);
    expect(s.covers.saved).toHaveLength(1);
    // 第二次连源图都不必解析。
    expect(s.renders.calls).toHaveLength(1);
  });

  it('★ 幂等优先于上限:档案满了,重存已有的那一版照样成功', async () => {
    const s = setup();
    const first = await s.addLook.execute(payload());
    for (let i = 1; i < MAX_ITEMS_PER_USER; i += 1) {
      await s.items.save(makeLook(`l${i}`, { sessionId: `other-${i}` }));
    }
    expect(s.items.size()).toBe(MAX_ITEMS_PER_USER);

    // 满了,但这是"把同一张图再存一次"——无害重放,不该被上限挡住。
    await expect(s.addLook.execute(payload())).resolves.toMatchObject({ id: first.id });
    expect(s.items.size()).toBe(MAX_ITEMS_PER_USER);
  });

  it('★ 记录写失败 ⇒ 刚刚复制的字节被清掉,错误照抛(不留没人认领的目录)', async () => {
    const s = setup();
    s.items.failSaveWith = new Error('盘满了');

    await expect(s.addLook.execute(payload())).rejects.toThrow('盘满了');
    expect(s.items.size()).toBe(0);
    // 复制过,但事后被清了 —— `look-covers/` 没有清扫器,这里不clean就永远留着。
    expect(s.covers.saved).toHaveLength(1);
    expect(s.covers.removed).toEqual([s.covers.saved[0]!.lookId]);
    expect(s.covers.has(s.covers.saved[0]!.lookId)).toBe(false);
  });

  it('★ 字节复制失败 ⇒ 记录一条都不写(反过来的半截状态同样不许留)', async () => {
    const s = setup();
    s.covers.failSaveWith = new Error('磁盘只读');

    await expect(s.addLook.execute(payload())).rejects.toThrow('磁盘只读');
    expect(s.items.size()).toBe(0);
  });
});

describe('ListLooks', () => {
  it('只列自己的,按 createdAt 倒序(最新的在最上面)', async () => {
    const s = setup();
    await s.items.save(makeLook('old', { sessionId: 'a' }, '2026-01-01T00:00:00.000Z'));
    await s.items.save(makeLook('new', { sessionId: 'b' }, '2099-01-01T00:00:00.000Z'));
    await s.items.save(makeLook('other', { userId: 'u2', sessionId: 'c' }));

    const list = await s.listLooks.execute({ userId: 'u1' });
    expect(list.items.map((v) => v.id)).toEqual(['new', 'old']);
  });

  it('账号不存在 ⇒ USER_NOT_FOUND(不静默回一个空列表)', async () => {
    const s = setup({ users: [] });
    await expect(s.listLooks.execute({ userId: 'u1' })).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
  });
});

describe('RemoveLook', () => {
  it('删一版:字节与记录都没了', async () => {
    const s = setup();
    const view = await s.addLook.execute(payload());

    await s.removeLook.execute(view.id, { userId: 'u1' });

    expect(await s.items.findById(view.id)).toBeNull();
    expect(s.covers.has(view.id)).toBe(false);
    expect(s.covers.removed).toEqual([view.id]);
  });

  it('★ 先删字节:**字节删失败时记录还在**,用户能再删一次', async () => {
    const s = setup();
    const view = await s.addLook.execute(payload());
    s.covers.failRemoveWith = new Error('文件被占用');

    await expect(s.removeLook.execute(view.id, { userId: 'u1' })).rejects.toThrow('文件被占用');
    // 顺序反了的话这里会是 null —— 字节就永远漏在盘上,没有清扫器兜底。
    expect(await s.items.findById(view.id)).not.toBeNull();
  });

  it('★ 越权 ⇒ LOOK_NOT_FOUND,记录与字节一个字都不动', async () => {
    const s = setup();
    const view = await s.addLook.execute(payload());

    await expect(s.removeLook.execute(view.id, { userId: 'u2' })).rejects.toMatchObject({
      code: ErrorCode.LOOK_NOT_FOUND,
    });
    expect(await s.items.findById(view.id)).not.toBeNull();
    expect(s.covers.has(view.id)).toBe(true);
    expect(s.covers.removed).toEqual([]);
  });

  it('不存在的 id ⇒ 同一句 LOOK_NOT_FOUND(不外泄存在性)', async () => {
    const s = setup();
    await expect(s.removeLook.execute('nope', { userId: 'u1' })).rejects.toMatchObject({
      code: ErrorCode.LOOK_NOT_FOUND,
    });
  });
});

describe('ReadLookCover', () => {
  it('回解析出来的路径 + MIME', async () => {
    const s = setup();
    const view = await s.addLook.execute(payload());

    await expect(s.readLookCover.execute(view.id, { userId: 'u1' })).resolves.toEqual({
      filePath: `/fake/look-covers/${view.id}/cover`,
      mimeType: 'image/png',
    });
  });

  it('★ 记录在、字节读不到 ⇒ LOOK_COVER_NOT_FOUND(不静默回落)', async () => {
    const s = setup();
    const view = await s.addLook.execute(payload());
    await s.covers.remove(view.id);

    await expect(s.readLookCover.execute(view.id, { userId: 'u1' })).rejects.toMatchObject({
      code: ErrorCode.LOOK_COVER_NOT_FOUND,
    });
  });

  it('★ 越权 ⇒ LOOK_NOT_FOUND(与"不存在"同一句)', async () => {
    const s = setup();
    const view = await s.addLook.execute(payload());
    await expect(s.readLookCover.execute(view.id, { userId: 'u2' })).rejects.toMatchObject({
      code: ErrorCode.LOOK_NOT_FOUND,
    });
  });
});

describe('validator', () => {
  it('逐格 trim', () => {
    const input = validateCreateInput(payload({ styleName: '  清透日常妆  ', sceneName: ' 聚会 ' }));
    expect(input.styleName).toBe('清透日常妆');
    expect(input.sceneName).toBe('聚会');
  });

  it('场景 id 允许空串(刷新后的 /result 推不出它,如实留空)', () => {
    expect(validateCreateInput(payload({ sceneId: '' })).sceneId).toBe('');
  });

  it('seq 必须是正整数', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => validateCreateInput(payload({ seq: bad })), `seq=${bad}`).toThrow(AppError);
    }
  });

  it('styleName 不能为空(它是列表标题的唯一来源)', () => {
    expect(() => validateCreateInput(payload({ styleName: '   ' }))).toThrow(AppError);
  });

  it(`关键词最多 ${MAX_KEYWORDS} 条、步骤最多 ${MAX_STEPS} 步`, () => {
    expect(() =>
      validateCreateInput(payload({ keywords: Array.from({ length: MAX_KEYWORDS + 1 }, () => 'k') })),
    ).toThrow(AppError);
    expect(() =>
      validateCreateInput(
        payload({
          steps: Array.from({ length: MAX_STEPS + 1 }, (_, i) => ({
            id: `s${i}`,
            name: '一步',
            desc: '',
            tips: [],
          })),
        }),
      ),
    ).toThrow(AppError);
  });

  it('控制字符一律拒收(这些值要进 JSON 与 UI)', () => {
    expect(() => validateCreateInput(payload({ styleName: '清透\n日常妆' }))).toThrow(AppError);
  });

  it('★ 档案 id 被当成封面目录名,`../` 之类一律拒', () => {
    for (const bad of ['../etc', 'a/b', '', 'a b', 'x'.repeat(81)]) {
      expect(() => validateLookId(bad), JSON.stringify(bad)).toThrow(AppError);
    }
    expect(validateLookId('5a1c-9f')).toBe('5a1c-9f');
  });

  it('归属查询串只认 userId 一个键', () => {
    expect(validateOwnerQuery({ userId: 'u1' })).toEqual({ userId: 'u1' });
    expect(() => validateOwnerQuery({ userId: 'u1', extra: 1 })).toThrow(AppError);
  });
});

describe('JsonLookRepository', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function repoDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'looks-repo-'));
    dirs.push(dir);
    return dir;
  }

  it('落盘后按 id / 按账号都能读回,新实例(重启)也读得到', async () => {
    const dir = repoDir();
    const repo = new JsonLookRepository(dir);

    await repo.save(createLook({ ...payload(), id: 'l1', coverMime: 'image/png' }));
    await repo.save(createLook({ ...payload({ userId: 'u2' }), id: 'l2', coverMime: 'image/png' }));

    expect((await repo.findById('l1'))?.styleName).toBe('清透日常妆');
    expect((await repo.findById('l1'))?.steps[0]?.tips).toEqual(['少量多次']);
    expect(await repo.findById('nope')).toBeNull();
    expect((await repo.listByUser('u1')).map((l) => l.id)).toEqual(['l1']);

    const reopened = new JsonLookRepository(dir);
    expect((await reopened.findById('l1'))?.summary).toBe('轻底妆 + 蜜桃色腮红');
  });

  it('删除后不再读回;删不存在的 id 是幂等的(不抛)', async () => {
    const dir = repoDir();
    const repo = new JsonLookRepository(dir);

    await repo.save(createLook({ ...payload(), id: 'l1', coverMime: 'image/png' }));
    await repo.remove('l1');
    expect(await repo.findById('l1')).toBeNull();
    await expect(repo.remove('l1')).resolves.toBeUndefined();
  });

  /**
   * ★ 往返:盘上一条记录的**键集合**必须与 `lookSchema` 一格不差。
   * 钉的是那种看不见的失守 —— schema 加了一格而没有对应的搬运路径,**编译不报错**,
   * 只在某次写盘时把这一格悄悄丢掉。
   */
  it('★ 落盘的键集合与 lookSchema 一格不差(字段只有一份定义)', async () => {
    const dir = repoDir();
    const repo = new JsonLookRepository(dir);

    const look = createLook({ ...payload(), id: 'l1', coverMime: 'image/png' });
    await repo.save(look);

    const onDisk = JSON.parse(readFileSync(path.join(dir, 'items.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(onDisk.l1!).sort()).toEqual(Object.keys(lookSchema.shape).sort());
    expect(onDisk.l1).toEqual(look);
  });

  it('★ 文件被手改坏 → 报的是「哪个文件、坏在哪」', async () => {
    const dir = repoDir();
    writeFileSync(path.join(dir, 'items.json'), '{ 这不是 JSON', 'utf8');
    await expect(new JsonLookRepository(dir).findById('l1')).rejects.toThrow(/items\.json/);
  });

  it('★ 形状对不上的落盘数据读不进来(§7.2:不拿 as 硬说"我知道它是什么形状")', async () => {
    const dir = repoDir();
    // 少一格 `coverMime`:发字节时的 content-type 就没了依据。
    writeFileSync(
      path.join(dir, 'items.json'),
      JSON.stringify({ l1: { id: 'l1', userId: 'u1', createdAt: 'x' } }),
      'utf8',
    );
    await expect(new JsonLookRepository(dir).findById('l1')).rejects.toThrow(/items\.json/);
  });

  it('★ 键与行里的 id 对不上 → 读不进来(那会让「按 id 查得到、按账号列不出来」)', async () => {
    const dir = repoDir();
    writeFileSync(
      path.join(dir, 'items.json'),
      JSON.stringify({
        l1: createLook({ ...payload(), id: 'other', coverMime: 'image/png' }),
      }),
      'utf8',
    );
    await expect(new JsonLookRepository(dir).findById('l1')).rejects.toThrow(/两者必须一致/);
  });
});

/**
 * ★★ 本仓最重要的一条断言:**档案封面扛得住 agent 的孤儿清扫**。
 *
 * 清扫(`PurgeExpiredSessions` 的第二遍)每小时跑一次、**不看 TTL**:
 * 它 `listIds()` 拿到的每个 id,只要没有活会话认领就**当场删掉**。
 * 封面若落在 `inputs/` 或 `results/` 里,下一次清扫就会删光用户的全部档案,
 * 而且 200、日志干净 —— 本仓头号 bug 的形状。
 *
 * 这组对着**真盘**跑(真 `FileSystemArtifactStore` + 真清扫),因为它要证的正是
 * "两条路径真的不相交",用假对象证不了。
 */
describe('★★ 封面与 agent 的孤儿清扫互不相干', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('清扫删掉会话的渲染图,而档案封面**原样还在**', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'looks-sweep-'));
    dirs.push(dataDir);
    const store = new FileSystemArtifactStore(dataDir);
    const artifacts = createSessionArtifacts(store, {
      engineOutDir: path.join(dataDir, 'engine-out'),
    });

    // ① 造一个会话的渲染图(results/<sessionId>/r1/result.png)。
    const scratch = path.join(dataDir, 'engine-out', 'r1.png');
    mkdirSync(path.dirname(scratch), { recursive: true });
    writeFileSync(scratch, 'RENDER-BYTES');
    await artifacts.putRender('sess-1', 1, scratch, 'image/png');

    const render = await store.resolveResult(renderId('sess-1', 1));
    expect(render).not.toBeNull();

    // ② 把这张图存成档案封面(复制字节到 look-covers/<lookId>/)。
    await store.putLook('look-1', render!.filePath, render!.mimeType);

    // ③ ★★ 钉住 listIds() 的不变量:它枚举的是**会话名下**的存储,不含 look-covers/。
    //    这一条红了就说明有人把 look-covers/ 加进了 listIds() —— 那等于让清扫去删档案。
    expect(await store.listIds()).not.toContain('look-1');
    expect(await store.listIds()).toContain('sess-1');

    // ④ 跑一轮清扫(会话存储是空的 ⇒ 过期那遍无事可做,孤儿那遍会删掉 sess-1)。
    const purge = new PurgeExpiredSessions({
      sessions: new InMemorySessionStore(),
      artifacts,
      ttlHours: 24,
    });
    await purge.execute();

    // ⑤ 渲染图真没了(隐私承诺成立)……
    expect(await store.resolveResult(renderId('sess-1', 1))).toBeNull();
    expect(await store.listIds()).not.toContain('sess-1');

    // ……而档案封面**逐字节原样还在** —— 这正是"复制而不是引用"要换来的东西。
    const cover = await store.resolveLook('look-1');
    expect(cover).not.toBeNull();
    expect(cover!.mimeType).toBe('image/png');
    expect(readFileSync(cover!.filePath, 'utf8')).toBe('RENDER-BYTES');
  });

  it('★ `removeLook` 真删封面目录,且是幂等的', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'looks-sweep-'));
    dirs.push(dataDir);
    const store = new FileSystemArtifactStore(dataDir);
    const source = path.join(dataDir, 'src.png');
    writeFileSync(source, 'COVER');

    await store.putLook('look-9', source, 'image/png');
    expect(await store.resolveLook('look-9')).not.toBeNull();

    await store.removeLook('look-9');
    expect(await store.resolveLook('look-9')).toBeNull();

    await expect(store.removeLook('look-9')).resolves.toBeUndefined();
    await expect(store.removeLook('从没存在过')).resolves.toBeUndefined();
  });
});
