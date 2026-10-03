/**
 * looks-route.test.ts —— 「我的妆容档案」那四条路由(`/api/looks…`)。
 *
 * ★ **这一组测的是装配层 + 端到端的一小段**,不是用例层(那些在 `looks.test.ts`):
 *   ① 四条路由真的被挂上去了(`app.ts` 那一段漏了就是本仓头号 bug:用例全绿、前端一路 404);
 *   ② 封面那条真的把**逐字节相同**的图发出来,且带着对的 `content-type`;
 *   ③ 封面那条的 `cache-control: private, no-store` —— 档案能被用户删掉,
 *      缓存里的图不该活得比它久。少了这一行,删掉的封面在浏览器里还看得见。
 *
 * ⚠️ 封面这条**走真的 `FileSystemArtifactStore`**(不是假端口):它要证的正是
 *   "字节真的从盘上读出来、原样发出去",用假对象证不了。
 * ⚠️ 源图用假 `RenderSource` 指一个**真实存在的文件** —— 这一组关心的不是 agent 那条路
 *   (它的收窄由 `look-renders.test.ts` 盯着)。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { createAssetsModule } from '../src/modules/assets/index.js';
import { createAgentModule } from '../src/modules/agent/index.js';
import { createCabinetModule } from '../src/modules/cabinet/index.js';
import { createLooksModule } from '../src/modules/looks/index.js';
import { createProductsModule } from '../src/modules/products/index.js';
import { createUserModule } from '../src/modules/user/index.js';
import { createWeatherModule } from '../src/modules/weather/index.js';
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import { buildApp } from '../src/app.js';
import { createSessionArtifacts } from '../src/session-artifacts.js';
import type { Engine } from '../src/modules/makeup/index.js';
import { MockLlm } from './helpers/mock-llm.js';
import { MockWeatherProvider } from './helpers/mock-weather-provider.js';
import { FakeRenderSource } from './helpers/fakes.js';

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const stubEngine: Engine = {
  name: 'stub',
  generate: async () => {
    throw new Error('这一组用例不该出图');
  },
};

/** 一张**真的**能被解码的极小 PNG(1×1)。 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

interface Fixture {
  app: FastifyInstance;
  /** 这一次装配用的临时数据目录(带外动盘上的文件时要用)。 */
  dir: string;
  /** 建一个账号并返回它的 id。 */
  register: (nickname: string) => Promise<string>;
}

async function makeFixture(): Promise<Fixture> {
  const dir = mkdtempSync(path.join(tmpdir(), 'looks-route-'));
  dirs.push(dir);
  const config = loadConfig({
    DATA_DIR: dir,
    PRODUCTS_DIR: path.join(dir, 'no-products'),
  });
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const user = createUserModule({ dataDir: config.dataDir });
  // ★ 与生产同一份收窄:只把 `USER_NOT_FOUND` 翻成 false,别的错误照抛。
  const userExists = async (userId: string): Promise<boolean> => {
    try {
      await user.getUser.execute(userId);
      return true;
    } catch (err) {
      if (err instanceof AppError && err.code === ErrorCode.USER_NOT_FOUND) return false;
      throw err;
    }
  };

  // 源图:一个真实存在的本机文件(档案保存时从它**复制**字节)。
  const renderFile = path.join(dir, 'render.png');
  writeFileSync(renderFile, PNG_BYTES);

  const looks = createLooksModule({
    dataDir: config.dataDir,
    userExists,
    renders: FakeRenderSource.of({
      s1: { 1: { filePath: renderFile, mimeType: 'image/png' } },
    }),
    // ★ 走真的存储实现(生产里就是这三行桥)。
    covers: {
      save: (lookId, sourceFilePath, mimeType) =>
        artifactStore.putLook(lookId, sourceFilePath, mimeType),
      resolve: (lookId) => artifactStore.resolveLook(lookId),
      remove: (lookId) => artifactStore.removeLook(lookId),
    },
  });

  const agent = createAgentModule({
    llm: new MockLlm(),
    cosmetics: { listByUser: async () => [] },
    userExists,
    engine: stubEngine,
    artifacts: createSessionArtifacts(artifactStore, { engineOutDir: config.makeupOutDir }),
    palette: { toneKeysFor: () => undefined, labelOf: () => undefined },
    features: { byId: () => undefined },
    shades: { hexOf: () => '' },
  });

  const app = await buildApp({
    config,
    user,
    weather: createWeatherModule({ provider: new MockWeatherProvider() }),
    cabinet: createCabinetModule({ dataDir: config.dataDir, userExists }),
    looks,
    products: createProductsModule({ contentDir: config.productsDir }),
    agent,
  });

  return {
    app,
    dir,
    register: async (nickname) =>
      (await user.registerUser.execute({ nickname, password: 'secret1' })).id,
  };
}

/** 一份合法的存档请求体(方案那几格就是前端带回来的 `PlanView`)。 */
function body(userId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId,
    sessionId: 's1',
    seq: 1,
    sceneId: '',
    sceneName: '聚会',
    styleId: 'natural',
    styleName: '清透日常妆',
    lookDescription: '一套清透的日常妆',
    summary: '轻底妆 + 蜜桃色腮红',
    keywords: ['清透'],
    stepCount: 1,
    palette: [{ code: 'B01', name: '蜜桃色', hex: '#f0a0a0' }],
    products: [{ pid: 'p1', code: 'B01', name: '腮红', hex: '#f0a0a0' }],
    steps: [{ id: 'natural-01', name: '打底', desc: '薄薄一层', tips: [] }],
    personalized: [],
    ...overrides,
  };
}

describe('/api/looks', () => {
  it('POST 存一版 → 201,视图里 coverUrl 是裸路径', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('桃桃');

    const res = await app.inject({ method: 'POST', url: '/api/looks', payload: body(userId) });

    expect(res.statusCode).toBe(201);
    const view = res.json();
    expect(view.styleName).toBe('清透日常妆');
    expect(view.coverUrl).toBe(`/looks/${view.id}/cover`);
    await app.close();
  });

  it('GET 列出自己的 → 200;别人的一条都不在里面', async () => {
    const { app, register } = await makeFixture();
    const mine = await register('桃桃');
    const other = await register('别人');

    await app.inject({ method: 'POST', url: '/api/looks', payload: body(mine) });
    await app.inject({
      method: 'POST',
      url: '/api/looks',
      payload: body(other, { sessionId: 's-other', seq: 2 }),
    });

    const res = await app.inject({ method: 'GET', url: `/api/looks?userId=${mine}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    await app.close();
  });

  it('★ GET /looks/:id/cover 发的是逐字节相同的图,带对的 content-type 与 no-store', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('桃桃');
    const created = await app.inject({
      method: 'POST',
      url: '/api/looks',
      payload: body(userId),
    });
    const { id, coverUrl } = created.json();

    const res = await app.inject({ method: 'GET', url: `/api${coverUrl}?userId=${userId}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    // ★ 档案能被删掉 ⇒ 缓存里的图不该活得比它久(agent 那条没有这一行,它受 TTL 管)。
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(res.rawPayload, PNG_BYTES)).toBe(0);
    expect(id).toBeTruthy();
    await app.close();
  });

  it('DELETE → 204;删完再取封面就是 404', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('桃桃');
    const created = await app.inject({
      method: 'POST',
      url: '/api/looks',
      payload: body(userId),
    });
    const { id, coverUrl } = created.json();

    const del = await app.inject({ method: 'DELETE', url: `/api/looks/${id}?userId=${userId}` });
    expect(del.statusCode).toBe(204);

    const gone = await app.inject({ method: 'GET', url: `/api${coverUrl}?userId=${userId}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.code).toBe(ErrorCode.LOOK_NOT_FOUND);
    await app.close();
  });

  it('★ 越权取封面 ⇒ 404 LOOK_NOT_FOUND(与"不存在"同一句,不外泄存在性)', async () => {
    const { app, register } = await makeFixture();
    const mine = await register('桃桃');
    const other = await register('别人');
    const created = await app.inject({
      method: 'POST',
      url: '/api/looks',
      payload: body(mine),
    });
    const { coverUrl } = created.json();

    const res = await app.inject({ method: 'GET', url: `/api${coverUrl}?userId=${other}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe(ErrorCode.LOOK_NOT_FOUND);
    await app.close();
  });

  it('★ 记录在、字节读不到 ⇒ 404 LOOK_COVER_NOT_FOUND(不是 LOOK_NOT_FOUND)', async () => {
    const { app, dir, register } = await makeFixture();
    const userId = await register('桃桃');
    const created = await app.inject({
      method: 'POST',
      url: '/api/looks',
      payload: body(userId),
    });
    const { id } = created.json();

    // 带外删掉字节(正常路径不会):记录还在,图没了。
    rmSync(path.join(dir, 'look-covers', id), { recursive: true, force: true });

    const res = await app.inject({ method: 'GET', url: `/api/looks/${id}/cover?userId=${userId}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe(ErrorCode.LOOK_COVER_NOT_FOUND);
    await app.close();
  });

  it('★ 源图已经没了 ⇒ 404 LOOK_COVER_UNAVAILABLE,且列表里不多出一张', async () => {
    const { app, register } = await makeFixture();
    const userId = await register('桃桃');

    // 会话里没有第 9 张图(或会话已过期):四种"拿不到"都走这一条。
    const res = await app.inject({
      method: 'POST',
      url: '/api/looks',
      payload: body(userId, { seq: 9 }),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe(ErrorCode.LOOK_COVER_UNAVAILABLE);
    const list = await app.inject({ method: 'GET', url: `/api/looks?userId=${userId}` });
    expect(list.json().items).toEqual([]);
    await app.close();
  });

  it('未知账号 ⇒ 404 USER_NOT_FOUND', async () => {
    const { app } = await makeFixture();
    const res = await app.inject({
      method: 'GET',
      url: `/api/looks?userId=${'a'.repeat(10)}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe(ErrorCode.USER_NOT_FOUND);
    await app.close();
  });

  it('空的请求体 ⇒ 422 VALIDATION_ERROR(不是框架那句英文)', async () => {
    const { app } = await makeFixture();
    const res = await app.inject({ method: 'POST', url: '/api/looks', payload: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe(ErrorCode.VALIDATION_ERROR);
    await app.close();
  });
});
