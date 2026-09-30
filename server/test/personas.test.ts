/**
 * test/personas.test.ts —— ★ **人设库落地的回归测试**(✏️ 2026-09-30 新建)。守的是这一族
 * **错了也不报错**的不变量:归属不符报 404 不报 403;照片字节的落/换/删三条路径;
 * 播种记账(没有它,删掉的种子会自己回来);`off` 时读脸那条口 404;`buildApp` 那一行转发。
 * ⚠️ 用**真文件系统**(`mkdtemp` 一个临时 dataDir),假端口只用在读脸那一条(那底下要花钱)。
 * ⚠️ 跨机器看到同一份人设只能人工走一遍,**单测全绿不等于那条已经验过**。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createAssetsModule } from '../src/modules/assets/index.js';
import { createSessionArtifacts } from '../src/session-artifacts.js';
import { createAgentModule } from '../src/modules/agent/index.js';
import { createCabinetModule } from '../src/modules/cabinet/index.js';
import { createUserModule } from '../src/modules/user/index.js';
import { createWeatherModule } from '../src/modules/weather/index.js';
import type { Engine } from '../src/modules/makeup/index.js';
import type { FaceReader } from '../src/modules/user/index.js';
// ★ 深路径:组装层的配置不进 `shared` 的 barrel(同 `test/analysis.test.ts`)。
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import {
  MAX_CUSTOM_FEATURES_PER_USER,
  MAX_FEATURE_TEXT,
  MAX_NOTES,
  MAX_TONES_PER_USER,
  PERSONA_SEED_VERSION,
} from '../src/modules/user/index.js';
import { FakeFaceReader } from './helpers/fakes.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'personas-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 一个只会在被调用时炸的引擎:这一组里没有任何一条口该走到出图。 */
const stubEngine: Engine = {
  name: 'stub',
  generate: async () => {
    throw new Error('这一组用例不该出图');
  },
};

interface Fixture {
  app: FastifyInstance;
  dir: string;
  /** 直接调用例建账号(比走 HTTP 少一层,这一组关心的不是注册)。 */
  register: (nickname: string) => Promise<string>;
}

/**
 * 装一个**真的** `buildApp`(人设库那一摞用真 compose + 真落盘)。
 * ★ 为什么必须走装配层:④⑤ 两条都是**装配**的事 —— 读脸那条口在不在,
 *   由"组合根有没有把端口接上"决定,在用例层怎么断言都验不到。
 */
async function makeFixture(faceReader?: FaceReader): Promise<Fixture> {
  const dir = tempDir();
  const config = loadConfig({
    DATA_DIR: dir,
    WEATHER_PROVIDER: 'mock',
    // 指到不存在的目录 = 这个部署没有产品库(合法形态,见 products/compose.ts)。
    PRODUCTS_DIR: path.join(dir, 'no-products'),
  });
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const userExists = async (): Promise<boolean> => true;

  const user = createUserModule({
    dataDir: config.dataDir,
    ...(faceReader ? { faceReader } : {}),
  });

  const agent = createAgentModule({
    kind: 'mock',
    real: { apiKey: '', baseUrl: '', model: '' },
    cosmetics: { listByUser: async () => [] },
    userExists,
    engine: stubEngine,
    artifacts: createSessionArtifacts(artifactStore, { engineOutDir: config.makeupOutDir }),
    // 这两样只在 propose_look 那一步被读,这一组不碰妆面校验。
    palette: { toneKeysFor: () => undefined, labelOf: () => undefined },
    features: { byId: () => undefined },
  });

  const app = await buildApp({
    config,
    user,
    weather: createWeatherModule({ kind: config.weatherProvider }),
    cabinet: createCabinetModule({ dataDir: config.dataDir, userExists }),
    agent,
  });

  return {
    app,
    dir,
    register: async (nickname) => (await user.registerUser.execute({ nickname, password: 'secret1' })).id,
  };
}

/* ------------------------------ 小工具 ------------------------------ */

/** 一张**真的**能被解码的极小 PNG(1×1)。字节不重要,重要的是它是一份合法的 base64 图片。 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const BODY = {
  name: '表妹',
  relation: 'family',
  skinTone: 'yellow-2',
  features: ['eye-up'],
};

interface ListBody {
  personas: {
    id: string;
    name: string;
    relation: string;
    skinTone: string;
    features: string[];
    /** 「补充说明」。★ 恒在(没写就是 `''`),所以它是 `string` 不是 `string | undefined`。 */
    notes: string;
    photoUrl: string;
    photoSource: string;
    createdAt: string;
    updatedAt?: string;
  }[];
  /** 自建肤色档。★ 预置那 8 档**不在这里**(它们是前端 kb,不占服务端一张表)。 */
  skinTones: { id: string; name: string; hex: string }[];
  /** 自建特征。★ 前端 kb 里那 31 条目录**不在这里**;`text` 不含分组前缀。 */
  customFeatures: { id: string; group: string; text: string }[];
  canAnalyzeFace: boolean;
}

async function listPersonas(app: FastifyInstance, userId: string): Promise<ListBody> {
  const res = await app.inject({ method: 'GET', url: `/api/personas?userId=${userId}` });
  expect(res.statusCode).toBe(200);
  return res.json() as ListBody;
}

/* ============================ ① 建档 / 列表 / 改 / 删 ============================ */

describe('人设库 —— 增删改查', () => {
  it('首次列表给 5 份种子;建档后是 6 份', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const first = await listPersonas(app, userId);
    expect(first.personas).toHaveLength(5);
    expect(first.personas.map((p) => p.id).sort()).toEqual([
      'ps-colleague',
      'ps-friend',
      'ps-mom',
      'ps-self',
      'ps-sister',
    ]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY },
    });
    expect(created.statusCode).toBe(201);
    const view = created.json() as ListBody['personas'][number];
    expect(view.name).toBe('表妹');
    expect(view.photoSource).toBe('none');
    expect(view.photoUrl).toBe('');
    // ★ id 是服务端生成的 UUID,不是前端那种 `ps-<时间戳>`(那套写 id 的方式随本地存储一起没了)。
    expect(view.id).toMatch(/^[0-9a-f-]{36}$/);

    expect((await listPersonas(app, userId)).personas).toHaveLength(6);
  });

  it('★ 列表按 createdAt 倒序(新的在前),不是种子数组的原序', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const { personas } = await listPersonas(app, userId);
    // 种子那 5 份的 createdAt 是写死的,顺序因此是**可断言的**(见 `persona-seeds.ts` 文件头)。
    expect(personas.map((p) => p.id)).toEqual([
      'ps-sister',
      'ps-colleague',
      'ps-friend',
      'ps-mom',
      'ps-self',
    ]);
  });

  it('改档只动传来的那一格,别的原样保留', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({ method: 'POST', url: '/api/personas', payload: { userId, ...BODY } })
    ).json() as ListBody['personas'][number];

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/personas/${created.id}`,
      payload: { userId, name: '表妹小云' },
    });
    expect(patched.statusCode).toBe(200);
    const after = patched.json() as ListBody['personas'][number];
    expect(after.name).toBe('表妹小云');
    // ★ 「改个名字顺手把肤色/特征清了」是这一类部分更新最容易犯的错。
    expect(after.skinTone).toBe(BODY.skinTone);
    expect(after.features).toEqual(BODY.features);
    expect(after.relation).toBe(BODY.relation);
    expect(after.updatedAt).toBeDefined();
  });

  it('★ 一个字段都不给的改档 ⇒ 422(空操作不该看起来像改成了)', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    const created = (
      await app.inject({ method: 'POST', url: '/api/personas', payload: { userId, ...BODY } })
    ).json() as ListBody['personas'][number];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/personas/${created.id}`,
      payload: { userId },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { message: string } }).error.message).toContain('至少要修改一项');
  });

  it('删掉之后再改 —— 404', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    const created = (
      await app.inject({ method: 'POST', url: '/api/personas', payload: { userId, ...BODY } })
    ).json() as ListBody['personas'][number];

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${created.id}?userId=${userId}`,
    });
    expect(removed.statusCode).toBe(204);
    expect((await listPersonas(app, userId)).personas).toHaveLength(5);

    const again = await app.inject({
      method: 'PATCH',
      url: `/api/personas/${created.id}`,
      payload: { userId, name: '还在?' },
    });
    expect(again.statusCode).toBe(404);
  });

  it('★ 关系自由填也收(「同事」不再被那三个词的白名单打回)', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    const res = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, relation: '同事' },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as ListBody['personas'][number]).relation).toBe('同事');

    // ★ 存下来还要读得回来 —— 放开成自由文本之后,「收下但存不进」正是这一类最像成功的事故。
    const { personas } = await listPersonas(app, userId);
    expect(personas.map((p) => p.relation)).toContain('同事');
  });

  it('关系是空白 / 超长 ⇒ 422(放开的是取值,不是形状)', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    for (const relation of ['   ', '一二三四五六七八九十十一十二十三']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, relation },
      });
      expect(res.statusCode, `relation=${relation}`).toBe(422);
    }
  });
});

/* ================================ ② 归属 ================================ */

describe('归属不符一律 404(不是 403,不外泄存在性)', () => {
  it('★ 另一个账号去读 / 改 / 删 / 取照片,四条口**都是 404**', async () => {
    const { app, register } = await makeFixture();
    const owner = await register('阿桃');
    const stranger = await register('路人');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId: owner, ...BODY, photo: DATA_URL },
      })
    ).json() as ListBody['personas'][number];

    const cases = [
      { method: 'PATCH' as const, url: `/api/personas/${created.id}` },
      { method: 'DELETE' as const, url: `/api/personas/${created.id}?userId=${stranger}` },
      { method: 'GET' as const, url: `/api/personas/${created.id}/photo?userId=${stranger}` },
    ];
    for (const one of cases) {
      const res = await app.inject({
        ...one,
        ...(one.method === 'PATCH' ? { payload: { userId: stranger, name: '我的了' } } : {}),
      });
      expect(res.statusCode, `${one.method} ${one.url}`).toBe(404);
      expect((res.json() as { error: { code: string } }).error.code).toBe('PERSONA_NOT_FOUND');
    }

    // ★ 列表是按账号过滤的:路人的列表里没有那份,也没有种子里没有的东西。
    expect((await listPersonas(app, stranger)).personas).toHaveLength(5);
    // 而且**原主那份一格都没被改**(404 那条路不许动数据)。
    const mine = (await listPersonas(app, owner)).personas.find((p) => p.id === created.id);
    expect(mine?.name).toBe(BODY.name);
  });

  it('压根不存在的账号 ⇒ 404 桃妆账号不存在(不是空列表)', async () => {
    const { app } = await makeFixture();
    const res = await app.inject({ method: 'GET', url: '/api/personas?userId=nobody-here' });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { message: string } }).error.message).toBe('桃妆账号不存在');
  });
});

/* ================================ ③ 照片 ================================ */

describe('照片:字节落盘、换、删,以及超限', () => {
  it('dataURL 落盘 ⇒ `photoSource: stored`,取回来字节与 content-type 都对得上', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, photo: DATA_URL },
      })
    ).json() as ListBody['personas'][number];

    expect(created.photoSource).toBe('stored');
    // ★ 给出来的是**不带 `/api`** 的路径 —— 前缀由前端补(理由见 `application/persona-view.ts`)。
    expect(created.photoUrl).toBe(`/personas/${created.id}/photo`);

    const photo = await app.inject({
      method: 'GET',
      url: `/api${created.photoUrl}?userId=${userId}`,
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toContain('image/png');
    // ★★ 没有它,换过照片之后任何一层缓存都会**继续发旧的那张脸**。
    expect(photo.headers['cache-control']).toBe('private, no-store');
    expect(photo.rawPayload.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
  });

  it('★ 种子那份静态图**不进**服务端照片目录,取它那条路由 404 且说的是实话', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const seeds = await listPersonas(app, userId);
    const sister = seeds.personas.find((p) => p.id === 'ps-sister');
    expect(sister?.photoSource).toBe('static');
    expect(sister?.photoUrl).toBe('/assets/img/ph-sister.svg');

    const res = await app.inject({ method: 'GET', url: `/api/personas/ps-sister/photo?userId=${userId}` });
    expect(res.statusCode).toBe(404);
    // ★ 说「这份人设没有服务端保存的照片」,不借 `PERSONA_NOT_FOUND` 那句
    //   「人设库里没有这份人设」—— 那份**就在**列表里,那会是一句和事实相反的话。
    expect((res.json() as { error: { code: string } }).error.code).toBe('PERSONA_PHOTO_NOT_FOUND');
  });

  it('★ 换照片:新字节到、旧字节删(不留没人认领的脸)', async () => {
    const { dir, app, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, photo: DATA_URL },
      })
    ).json() as ListBody['personas'][number];

    const photosDir = path.join(dir, 'personas', 'photos');
    expect(readFileSync(path.join(photosDir, `${created.id}.png`)).length).toBeGreaterThan(0);

    // 换一张 jpeg:扩展名会从 .png 变成 .jpg,旧的那个必须被删掉。
    const jpeg = `data:image/jpeg;base64,${PNG_BASE64}`;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/personas/${created.id}`,
      payload: { userId, photo: jpeg },
    });
    expect(patched.statusCode).toBe(200);

    const names = readFileSync(path.join(photosDir, `${created.id}.jpg`));
    expect(names.length).toBeGreaterThan(0);
    expect(() => readFileSync(path.join(photosDir, `${created.id}.png`))).toThrow();

    const photo = await app.inject({ method: 'GET', url: `/api/personas/${created.id}/photo?userId=${userId}` });
    expect(photo.headers['content-type']).toContain('image/jpeg');
  });

  it('`photo: ""` ⇒ 清空,字节与那一格一起没', async () => {
    const { dir, app, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, photo: DATA_URL },
      })
    ).json() as ListBody['personas'][number];

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/personas/${created.id}`,
      payload: { userId, photo: '' },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as ListBody['personas'][number]).photoSource).toBe('none');
    expect(() => readFileSync(path.join(dir, 'personas', 'photos', `${created.id}.png`))).toThrow();
  });

  it('★ 删掉人设 ⇒ 字节跟着删(不是只删行)', async () => {
    const { dir, app, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, photo: DATA_URL },
      })
    ).json() as ListBody['personas'][number];

    await app.inject({ method: 'DELETE', url: `/api/personas/${created.id}?userId=${userId}` });
    expect(() => readFileSync(path.join(dir, 'personas', 'photos', `${created.id}.png`))).toThrow();
  });

  it('★ 不支持的 mime / 不是 dataURL / 超过上限 ⇒ 422,而且是人话', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const badMime = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, photo: `data:image/gif;base64,${PNG_BASE64}` },
    });
    expect(badMime.statusCode).toBe(422);
    expect((badMime.json() as { error: { message: string } }).error.message).toContain('照片类型不支持');

    // ★ 详情页把种子的 `photoUrl`(静态路径)原样回传时的现场:必须当场拒掉,
    //   不许被静默当成"一张名叫 /assets/... 的照片"。
    const notDataUrl = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, photo: '/assets/img/ph-sister.svg' },
    });
    expect(notDataUrl.statusCode).toBe(422);
    expect((notDataUrl.json() as { error: { message: string } }).error.message).toContain('照片格式不对');

    const tooBig = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, photo: `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}` },
    });
    expect(tooBig.statusCode).toBe(422);
    expect((tooBig.json() as { error: { message: string } }).error.message).toContain('照片太大了');
  });
});

/* ================================ ④ 种子 ================================ */

describe('种子:播种只发生一次', () => {
  it('★ 删掉一份种子之后,再列表**不会自己回来**', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    expect((await listPersonas(app, userId)).personas).toHaveLength(5);
    await app.inject({ method: 'DELETE', url: `/api/personas/ps-self?userId=${userId}` });

    const after = await listPersonas(app, userId);
    expect(after.personas).toHaveLength(4);
    expect(after.personas.map((p) => p.id)).not.toContain('ps-self');
  });

  it('★ 改名之后不被播种打回原样', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    await listPersonas(app, userId);
    await app.inject({
      method: 'PATCH',
      url: '/api/personas/ps-mom',
      payload: { userId, name: '妈妈(用黄二白)' },
    });

    const again = await listPersonas(app, userId);
    expect(again.personas.find((p) => p.id === 'ps-mom')?.name).toBe('妈妈(用黄二白)');
  });

  it('★ 播种版本号没到 ⇒ **只补缺失的**,已有的、用户自建的一律不动', async () => {
    const { dir, app, register } = await makeFixture();
    const userId = await register('阿桃');

    // 造一个「播过一版、删掉了一份、然后记账被退回上一版」的现场。
    await listPersonas(app, userId);
    await app.inject({ method: 'DELETE', url: `/api/personas/ps-friend?userId=${userId}` });
    writeFileSync(
      path.join(dir, 'personas', 'seeded.json'),
      JSON.stringify({ [userId]: PERSONA_SEED_VERSION - 1 }),
    );

    const reseeded = await listPersonas(app, userId);
    // 补回来了(版本没到 ⇒ 那条 id 不在表里 ⇒ 补)
    expect(reseeded.personas.map((p) => p.id)).toContain('ps-friend');
    // 而**别的没有重复**:还是 5 份,不是 5 + 补的那一份。
    expect(reseeded.personas).toHaveLength(5);
  });

  it('★ 播种是**按账号各一份**:另一个账号拿到的是它自己的', async () => {
    const { app, register } = await makeFixture();
    const a = await register('阿桃');
    const b = await register('阿李');

    const forA = await listPersonas(app, a);
    const forB = await listPersonas(app, b);

    // id 相同(种子是写死的),但它们在服务端是**两份行** —— 改一份不动另一份。
    await app.inject({
      method: 'PATCH',
      url: '/api/personas/ps-self',
      payload: { userId: a, name: '我(A 改的)' },
    });
    const bAfter = await listPersonas(app, b);
    expect(bAfter.personas.find((p) => p.id === 'ps-self')?.name).toBe('我的形象');
    expect(forA.personas).toHaveLength(5);
    expect(forB.personas).toHaveLength(5);
  });
});

/* ================================ ⑤ 读脸 ================================ */

describe('读脸:端口不在就没有入口,在就只给后端档 id', () => {
  it('★ 端口缺席 ⇒ 路由 **404**,列表里 `canAnalyzeFace: false`', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId, photo: DATA_URL },
    });
    expect(res.statusCode).toBe(404);

    const list = await listPersonas(app, userId);
    expect(list.canAnalyzeFace).toBe(false);
  });

  it('★ 端口在场 ⇒ 回后端档 id,而且**一行都不落库**', async () => {
    const reader = new FakeFaceReader({ ok: true, skinTone: 'olive' });
    const { app, register } = await makeFixture(reader);
    const userId = await register('阿桃');

    const before = (await listPersonas(app, userId)).personas.length;
    expect((await listPersonas(app, userId)).canAnalyzeFace).toBe(true);

    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId, photo: DATA_URL },
    });
    expect(res.statusCode).toBe(200);
    // ★ 回的是**后端**那套档 id。翻成前端展示档(`yellow-2` 那种)由前端那张反查表做,
    //   翻译只在一处发生 —— 这条断言钉的就是"别在后端悄悄翻一次"。
    expect(res.json()).toEqual({ skinTone: 'olive' });
    expect(reader.calls).toBe(1);

    // ★ 「建议」不是「档案」:这一次读脸不许写任何东西(落档由用户确认后的 POST 完成)。
    expect((await listPersonas(app, userId)).personas).toHaveLength(before);
  });

  it('★ 读不出来 ⇒ 422 + 人话(不是"服务坏了")', async () => {
    const { app, register } = await makeFixture(new FakeFaceReader({ ok: false, reason: 'unreadable' }));
    const userId = await register('阿桃');

    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId, photo: DATA_URL },
    });
    expect(res.statusCode).toBe(422);
    // ★ 那句话里**不提模型、不提档位表** —— 用户能做的只有换一张照片。
    expect((res.json() as { error: { message: string } }).error.message).toContain('换一张光线均匀的正面照');
  });

  it('★★ 端口抛出来的**非**"读不出来"异常原样变成 500(不许说成读不出来)', async () => {
    // 这条是本组的重点:把"网断了 / key 过期了"说成"这张照片读不出来",
    // 用户会去换一张本来没问题的照片 —— 而真正的问题一次也不会出现在日志之外。
    const boom = new FakeFaceReader(new Error('连接超时'));
    const { app, register } = await makeFixture(boom);
    const userId = await register('阿桃');

    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId, photo: DATA_URL },
    });
    expect(res.statusCode).toBe(500);
  });

  it('★ 读脸的 `AppError(VALIDATION_ERROR)` 才是"读不出来"那一支', async () => {
    // 组装根那条 glue 收到的是 `makeup` 的失败:模型答 `unknown` ⇒ `validateFaceReading`
    // 抛 `AppError(VALIDATION_ERROR)`。这里从**端口的出口**验那一条映射是稳的:
    // 端口只回 `{ok:false}`,别的异常(上面那条)照旧往上走。
    const { app, register } = await makeFixture(new FakeFaceReader({ ok: false, reason: 'unreadable' }));
    const userId = await register('阿桃');
    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId, photo: DATA_URL },
    });
    expect((res.json() as { error: { code: string } }).error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('★ 不存在的账号不许拿别人的照片来烧钱 ⇒ 404', async () => {
    const reader = new FakeFaceReader({ ok: true, skinTone: 'olive' });
    const { app } = await makeFixture(reader);
    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId: 'nobody-here', photo: DATA_URL },
    });
    expect(res.statusCode).toBe(404);
    // ★ 归属没过就**一次都没调** —— 不是"调了但没用"(那是白花钱)。
    expect(reader.calls).toBe(0);
  });

  it('★ 照片超限时**一次都不花**', async () => {
    const reader = new FakeFaceReader({ ok: true, skinTone: 'olive' });
    const { app, register } = await makeFixture(reader);
    const userId = await register('阿桃');
    const res = await app.inject({
      method: 'POST',
      url: '/api/personas/analyze',
      payload: { userId, photo: `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}` },
    });
    expect(res.statusCode).toBe(422);
    expect(reader.calls).toBe(0);
  });
});

/* ========================= ⑥ 落盘形状与"重启后还在" ========================= */

describe('落盘:重启后还在,而且读得回来', () => {
  it('★ 换一个 module 实例读同一个 dataDir ⇒ 人设还在(这就是本轮交付物)', async () => {
    const { app, dir, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, photo: DATA_URL },
      })
    ).json() as ListBody['personas'][number];
    await app.close();

    // 「重启」:同一个 dataDir,另起一套 compose。
    const config = loadConfig({
      DATA_DIR: dir,
      WEATHER_PROVIDER: 'mock',
      PRODUCTS_DIR: path.join(dir, 'no-products'),
    });
    expect(config.dataDir).toBe(dir);
    const restarted = createUserModule({ dataDir: dir });
    const list = await restarted.listPersonas.execute({ userId });

    expect(list).toHaveLength(6);
    const found = list.find((p) => p.id === created.id);
    expect(found?.name).toBe(BODY.name);
    expect(found?.features).toEqual(BODY.features);
    expect(found?.photoSource).toBe('stored');
  });

  it('落盘行**逐格**对得上 `personaRowSchema`(多一格少一格的账在这里结)', async () => {
    const { dir, app, register } = await makeFixture();
    const userId = await register('阿桃');
    // ★ 先列一次:种子是**读时**播的,不先列一次盘上就只有下面那一份。
    await listPersonas(app, userId);
    await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, photo: DATA_URL },
    });

    const table = JSON.parse(readFileSync(path.join(dir, 'personas', 'personas.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    const rows = Object.values(table);
    // 5 份种子 + 1 份新建
    expect(rows).toHaveLength(6);

    const { personaRowSchema } = await import('../src/modules/user/index.js');
    for (const row of rows) {
      // ★ `.strict()` 会拒掉多余的键 —— 于是"盘上写的键集合"与这份 schema 是同一份,
      //   新加一格字段时这里会红(同 `user.test.ts` 的往返那条)。
      expect(personaRowSchema.safeParse(row).success).toBe(true);
      // ★ 照片那一格存的是**指向**,不是路径也不是字节。
      expect(['none', 'seed', 'file']).toContain((row.photo as { kind: string }).kind);
    }
  });

  it('★ 盘上的数据坏了 ⇒ 抛错(不是静默当成空表)', async () => {
    const { dir, app, register } = await makeFixture();
    const userId = await register('阿桃');
    await listPersonas(app, userId);

    // 把键和行里的 id 改得不一致 —— 「按 id 查得到、按用户却列不出来」的那个现场。
    const file = path.join(dir, 'personas', 'personas.json');
    const table = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { id: string }>;
    const self = table['ps-self'];
    if (!self) throw new Error('测试现场没准备好:盘上找不到 ps-self');
    self.id = 'ps-someone-else';
    writeFileSync(file, JSON.stringify(table));

    // ★ 断言落在**响应**上(500),不复用上面那个"必须 200"的小工具:
    //   这条口的正确表现就是**这一次请求失败**,而不是拿一份少了人的列表当成功。
    const res = await app.inject({ method: 'GET', url: `/api/personas?userId=${userId}` });
    expect(res.statusCode).toBe(500);
  });
});

/* ============================ ⑦ 「补充说明」 ============================ */

describe('补充说明:人设档案里那格自由文本', () => {
  it('建档带补充说明 ⇒ 列表带得回来;没写的那几份是**空串**不是缺键', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, notes: '左脸有一道疤' },
      })
    ).json() as ListBody['personas'][number];
    expect(created.notes).toBe('左脸有一道疤');

    const { personas } = await listPersonas(app, userId);
    expect(personas.find((p) => p.id === created.id)?.notes).toBe('左脸有一道疤');
    // ★ 恒在的空串:前端那个 textarea 拿它当受控值,`undefined` 会让它变成半受控。
    expect(personas.find((p) => p.id === 'ps-self')?.notes).toBe('');
  });

  it('★ 单独 PATCH 一个空串就是**清空** —— 不被「至少要修改一项」拒,盘上也不留空键', async () => {
    const { app, dir, register } = await makeFixture();
    const userId = await register('阿桃');
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, notes: '戴眼镜' },
      })
    ).json() as ListBody['personas'][number];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/personas/${created.id}`,
      payload: { userId, notes: '' },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as ListBody['personas'][number]).notes).toBe('');

    const table = JSON.parse(
      readFileSync(path.join(dir, 'personas', 'personas.json'), 'utf8'),
    ) as Record<string, Record<string, unknown>>;
    // ★ 空串**不落盘**:清空之后那一格该消失,而不是留一个空字符串。
    expect('notes' in (table[created.id] ?? {})).toBe(false);
  });

  it('多行是允许的(它就是个多行输入框);控制字符不是', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, notes: '第一行\r\n第二行' },
    });
    expect(ok.statusCode).toBe(201);
    // ★ 换行统一成 `\n`:盘上存的是同一件事,不该因为客户端用 CRLF 就存出第二份写法。
    expect((ok.json() as ListBody['personas'][number]).notes).toBe('第一行\n第二行');

    const bad = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, notes: '带个响铃\u0007' },
    });
    expect(bad.statusCode).toBe(422);
  });

  it(`超过 ${MAX_NOTES} 字 ⇒ 422`, async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    const res = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, notes: '妆'.repeat(MAX_NOTES + 1) },
    });
    expect(res.statusCode).toBe(422);
  });
});

/* ======================= ⑧ 自建肤色档(账号共用一份) ======================= */

/** 建一档自建肤色,返回响应(断言留给用例各写各的)。 */
function addTone(app: FastifyInstance, userId: string, name: string, hex: string) {
  return app.inject({ method: 'POST', url: '/api/personas/tones', payload: { userId, name, hex } });
}

describe('自建肤色档:整账号共用一份小库', () => {
  it('★ 建一档 ⇒ 搭 GET /personas 一起回来,而且人设真的能用它', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const res = await addTone(app, userId, '暖麦', '#8d5a3b');
    expect(res.statusCode).toBe(201);
    const tone = res.json() as ListBody['skinTones'][number];
    expect(tone.name).toBe('暖麦');
    expect(tone.hex).toBe('#8d5a3b');

    // ★ 这张表里**只有自建的**:预置那 8 档是前端 kb,混进来前端会摆出两份同名的档。
    expect((await listPersonas(app, userId)).skinTones.map((t) => t.id)).toEqual([tone.id]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, skinTone: tone.id },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as ListBody['personas'][number]).skinTone).toBe(tone.id);
  });

  it('名字 / 色值不合法 ⇒ 422', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    const bad = [
      { name: '   ', hex: '#8d5a3b' },
      { name: '一二三四五六七八九', hex: '#8d5a3b' },
      { name: '暖麦', hex: '8d5a3b' },
      { name: '暖麦', hex: '#8d5a3' },
      { name: '暖麦', hex: '#gggggg' },
    ];
    for (const payload of bad) {
      const res = await addTone(app, userId, payload.name, payload.hex);
      expect(res.statusCode, JSON.stringify(payload)).toBe(422);
    }
  });

  it('★ 还有人在用就不给删(409);改用别档之后删得掉(204)', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const tone = (await addTone(app, userId, '暖麦', '#8d5a3b')).json() as ListBody['skinTones'][number];
    const persona = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, skinTone: tone.id },
      })
    ).json() as ListBody['personas'][number];

    // ★ 静默删会留下悬空 id:前端渲染成「未定档」+ 无色块,200、日志干净、只有结果是错的。
    const blocked = await app.inject({
      method: 'DELETE',
      url: `/api/personas/tones/${tone.id}?userId=${userId}`,
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: { code: string } }).error.code).toBe('SKIN_TONE_IN_USE');
    // 被拒之后档**完好还在**(不是删到一半)。
    expect((await listPersonas(app, userId)).skinTones.map((t) => t.id)).toEqual([tone.id]);

    await app.inject({
      method: 'PATCH',
      url: `/api/personas/${persona.id}`,
      payload: { userId, skinTone: 'yellow-2' },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/personas/tones/${tone.id}?userId=${userId}`,
    });
    expect(removed.statusCode).toBe(204);
    expect((await listPersonas(app, userId)).skinTones).toHaveLength(0);
  });

  it('★ 跨账号删别人的档 ⇒ 404(不是 403,不外泄存在性)', async () => {
    const { app, register } = await makeFixture();
    const owner = await register('阿桃');
    const stranger = await register('路人');

    const tone = (await addTone(app, owner, '暖麦', '#8d5a3b')).json() as ListBody['skinTones'][number];

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/tones/${tone.id}?userId=${stranger}`,
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SKIN_TONE_NOT_FOUND');
    // 而且**原主那一档没被碰**。
    expect((await listPersonas(app, owner)).skinTones.map((t) => t.id)).toEqual([tone.id]);
  });

  it(`第 ${MAX_TONES_PER_USER + 1} 档 ⇒ 409(上限是明说的规则,不是静默丢弃)`, async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    for (let i = 0; i < MAX_TONES_PER_USER; i += 1) {
      const res = await addTone(app, userId, `档${i}`, '#8d5a3b');
      expect(res.statusCode, `第 ${i + 1} 档`).toBe(201);
    }

    const over = await addTone(app, userId, '多出来的', '#8d5a3b');
    expect(over.statusCode).toBe(409);
    expect((over.json() as { error: { code: string } }).error.code).toBe('SKIN_TONE_FULL');
  });
});

/* ======================= ⑨ 自建特征(账号共用一份) ======================= */

/** 建一条自建特征,返回响应(断言留给用例各写各的)。 */
function addFeature(app: FastifyInstance, userId: string, group: string, text: string) {
  return app.inject({ method: 'POST', url: '/api/personas/features', payload: { userId, group, text } });
}

describe('自建特征:整账号共用一份小库', () => {
  it('★ 建一条 ⇒ 搭 GET /personas 一起回来,而且人设真的能用它', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const res = await addFeature(app, userId, 'eye', '眼尾有点垂');
    expect(res.statusCode).toBe(201);
    const item = res.json() as ListBody['customFeatures'][number];
    expect(item.group).toBe('eye');
    expect(item.text).toBe('眼尾有点垂');

    // ★ 这张表里**只有自建的**:predefined 那 31 条是前端 kb,混进来前端会摆出两份同名的 chip。
    expect((await listPersonas(app, userId)).customFeatures.map((f) => f.id)).toEqual([item.id]);

    // ★★ 人设行里存的是 `分组/原话` 那串,**不是**库行的 id —— 这就是 F1 的现场。
    const created = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, features: ['eye/眼尾有点垂'] },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as ListBody['personas'][number]).features).toEqual(['eye/眼尾有点垂']);
    // 再读一遍列表:那一串原样带着(不是靠前端现拼)。
    expect((await listPersonas(app, userId)).personas.find((p) => p.id === (created.json() as { id: string }).id)?.features).toEqual(['eye/眼尾有点垂']);
  });

  it('分组 / 原话不合法 ⇒ 422', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');
    const bad = [
      { group: 'eye', text: '   ' },
      { group: 'eye', text: '字'.repeat(MAX_FEATURE_TEXT + 1) },
      { group: 'eye', text: '两\n行' },
      { group: '   ', text: '眼尾有点垂' },
      { group: 'g'.repeat(17), text: '眼尾有点垂' },
    ];
    for (const payload of bad) {
      const res = await addFeature(app, userId, payload.group, payload.text);
      expect(res.statusCode, JSON.stringify(payload)).toBe(422);
    }

    // ★ 多给一个键也是 422(`.strict()`):漏登一个键就是"看着收下了,其实丢了"。
    const extra = await app.inject({
      method: 'POST',
      url: '/api/personas/features',
      payload: { userId, group: 'eye', text: '眼尾有点垂', note: '多余的' },
    });
    expect(extra.statusCode).toBe(422);

    // ★ 原话**要 trim**:存进去的不许带首尾空格(否则和前端拼出来的那串对不上,在用判定就永远不中)。
    const trimmed = await addFeature(app, userId, ' eye ', '  眼尾有点垂  ');
    expect(trimmed.statusCode).toBe(201);
    expect((trimmed.json() as ListBody['customFeatures'][number]).text).toBe('眼尾有点垂');
  });

  it('★ 还有人在用就不给删(409);那几份人设去掉它之后删得掉(204)', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    const item = (
      await addFeature(app, userId, 'eye', '眼尾有点垂')
    ).json() as ListBody['customFeatures'][number];
    const persona = (
      await app.inject({
        method: 'POST',
        url: '/api/personas',
        payload: { userId, ...BODY, features: ['eye/眼尾有点垂'] },
      })
    ).json() as ListBody['personas'][number];

    // ★ 静默删会让用户写在脸上那句话消失,200、日志干净、只有结果是错的。
    const blocked = await app.inject({
      method: 'DELETE',
      url: `/api/personas/features/${item.id}?userId=${userId}`,
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: { code: string } }).error.code).toBe('CUSTOM_FEATURE_IN_USE');
    expect((await listPersonas(app, userId)).customFeatures.map((f) => f.id)).toEqual([item.id]);

    // ★ **同组不同原话不算在用**:判据是那一整串,不是分组。
    await app.inject({
      method: 'PATCH',
      url: `/api/personas/${persona.id}`,
      payload: { userId, features: ['eye/眼头偏圆'] },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/personas/features/${item.id}?userId=${userId}`,
    });
    expect(removed.statusCode).toBe(204);
    expect((await listPersonas(app, userId)).customFeatures).toHaveLength(0);
  });

  it('★ 跨账号删别人的条目 ⇒ 404(不是 403,不外泄存在性)', async () => {
    const { app, register } = await makeFixture();
    const owner = await register('阿桃');
    const stranger = await register('路人');

    const item = (
      await addFeature(app, owner, 'eye', '眼尾有点垂')
    ).json() as ListBody['customFeatures'][number];

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/features/${item.id}?userId=${stranger}`,
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe('CUSTOM_FEATURE_NOT_FOUND');
    expect((await listPersonas(app, owner)).customFeatures.map((f) => f.id)).toEqual([item.id]);
  });

  it(`第 ${MAX_CUSTOM_FEATURES_PER_USER + 1} 条 ⇒ 409(上限是明说的规则,不是静默丢弃)`, async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    for (let i = 0; i < MAX_CUSTOM_FEATURES_PER_USER; i += 1) {
      const res = await addFeature(app, userId, 'eye', `第${i}条`);
      expect(res.statusCode, `第 ${i + 1} 条`).toBe(201);
    }

    const over = await addFeature(app, userId, 'eye', '多出来的');
    expect(over.statusCode).toBe(409);
    expect((over.json() as { error: { code: string } }).error.code).toBe('CUSTOM_FEATURE_FULL');
  });

  it('★ 两个上限必须对得上:库里建得成的那条,写进人设也一定收得下', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('阿桃');

    // 最长的一串:16 字分组 + `/` + 40 字原话。
    const group = 'g'.repeat(16);
    const text = '字'.repeat(MAX_FEATURE_TEXT);
    const item = (await addFeature(app, userId, group, text)).json() as ListBody['customFeatures'][number];

    // ★ 对不上的坏法很隐蔽:库里**建得成**,422 却发生在**另一个动作**(建档)上。
    const created = await app.inject({
      method: 'POST',
      url: '/api/personas',
      payload: { userId, ...BODY, features: [`${group}/${item.text}`] },
    });
    expect(created.statusCode).toBe(201);
  });
});
