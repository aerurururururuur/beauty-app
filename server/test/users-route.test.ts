/**
 * 账号资料那两条路由(`PATCH /api/users/:id` / `GET /api/users/:id/avatar`)。
 *
 * ★ **这一组测的是装配层 + 端到端的一小段**,不是用例层:三条只有走真 `buildApp` 才验得到 ——
 *   ① 两条路由真的被挂上去了(`app.ts` 那一段漏了就是本仓头号 bug:用例全绿、前端一路 404);
 *   ② `bodyLimit` 够大到能装下一个 dataURL(小了先到的是框架那句英文 413);
 *   ③ `GET .../avatar` 那两行响应头(`content-type` 与 `private, no-store`)。
 *
 * ⚠️ 改资料的**规则**在 `user.test.ts` 里直接调 `validateProfileInput` / `UpdateProfile` 测,
 *   走 HTTP 反而多一层与它们无关的框架行为。
 * ⚠️ 头像**没有版本号**:换头像后前端能立刻看到新图,靠的是 `no-store` 那一行 —— 下面钉住它。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { createAssetsModule } from '../src/modules/assets/index.js';
import { createCabinetModule } from '../src/modules/cabinet/index.js';
import { createAgentModule } from '../src/modules/agent/index.js';
import { createProductsModule } from '../src/modules/products/index.js';
import { createUserModule } from '../src/modules/user/index.js';
import { createWeatherModule } from '../src/modules/weather/index.js';
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';
import { ErrorCode } from '../src/modules/shared/index.js';
import { buildApp } from '../src/app.js';
import { createSessionArtifacts } from '../src/session-artifacts.js';
import type { Engine } from '../src/modules/makeup/index.js';
import type { UserModuleServices } from '../src/modules/user/index.js';
import { MockLlm } from './helpers/mock-llm.js';
import { MockWeatherProvider } from './helpers/mock-weather-provider.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'users-route-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** 这一组没有任何一条口该走到出图。 */
const stubEngine: Engine = {
  name: 'stub',
  generate: async () => {
    throw new Error('这一组用例不该出图');
  },
};

interface Fixture {
  app: FastifyInstance;
  dir: string;
  user: UserModuleServices;
  /** 建一个账号并返回它的 id(比走 HTTP 少一层,这一组关心的不是注册)。 */
  register: (nickname: string) => Promise<string>;
}

async function makeFixture(): Promise<Fixture> {
  const dir = tempDir();
  const config = loadConfig({
    DATA_DIR: dir,
    PRODUCTS_DIR: path.join(dir, 'no-products'),
  });
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const userExists = async (): Promise<boolean> => true;

  const user = createUserModule({ dataDir: config.dataDir });

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
    products: createProductsModule({ contentDir: config.productsDir }),
    agent,
  });

  return {
    app,
    dir,
    user,
    register: async (nickname) =>
      (await user.registerUser.execute({ nickname, password: 'secret1' })).id,
  };
}

/** 一张**真的**能被解码的极小 PNG(1×1)。 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

interface ProfileView {
  id: string;
  nickname: string;
  bio: string;
  avatarUrl: string;
  avatarSource: string;
}

describe('PATCH /api/users/:id —— 改资料', () => {
  it('改简介:回新视图,且 GET 能回读到同一份', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      payload: { bio: '混合偏干皮 · 冷调一白 · 淡颜系日常妆' },
    });
    expect(res.statusCode).toBe(200);
    const view = res.json<ProfileView>();
    expect(view.bio).toBe('混合偏干皮 · 冷调一白 · 淡颜系日常妆');
    // 没传头像 ⇒ 一个字节都不该有。
    expect(view.avatarSource).toBe('none');
    expect(view.avatarUrl).toBe('');

    const back = await app.inject({ method: 'GET', url: `/api/users/${id}` });
    expect(back.json<ProfileView>().bio).toBe('混合偏干皮 · 冷调一白 · 淡颜系日常妆');
  });

  it('★ 只改简介时**不碰头像**(没传的那一格保持不动)', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');

    await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      payload: { avatar: PNG_DATA_URL },
    });
    const afterBio = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      payload: { bio: '换了个说法' },
    });
    expect(afterBio.json<ProfileView>().avatarSource).toBe('stored');

    const img = await app.inject({ method: 'GET', url: `/api/users/${id}/avatar` });
    expect(img.statusCode).toBe(200);
    expect(img.rawPayload.equals(PNG_BYTES)).toBe(true);
  });

  it('换头像:视图给的是那条相对路径,字节可从 /avatar 取回(带两行响应头)', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      payload: { avatar: PNG_DATA_URL },
    });
    const view = res.json<ProfileView>();
    // ★ 不带 `/api`:后端不知道部署前缀,前端补(同 persona 的 photoUrl)。
    expect(view.avatarUrl).toBe(`/users/${id}/avatar`);
    expect(view.avatarSource).toBe('stored');

    const img = await app.inject({ method: 'GET', url: `/api/users/${id}/avatar` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toContain('image/png');
    // ★ 没有版本号 ⇒ 任何一层缓存留下它,换头像后会继续发旧的那张。
    expect(img.headers['cache-control']).toBe('private, no-store');
    expect(img.rawPayload.equals(PNG_BYTES)).toBe(true);
  });

  it('清空头像(`avatar: ""`):视图回到 none,之后那条口 404', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');
    await app.inject({ method: 'PATCH', url: `/api/users/${id}`, payload: { avatar: PNG_DATA_URL } });

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      payload: { avatar: '' },
    });
    expect(cleared.json<ProfileView>().avatarSource).toBe('none');

    const img = await app.inject({ method: 'GET', url: `/api/users/${id}/avatar` });
    expect(img.statusCode).toBe(404);
    expect(img.json<{ error: { code: string } }>().error.code).toBe(
      ErrorCode.USER_AVATAR_NOT_FOUND,
    );
  });

  it('两格都不给 ⇒ 422(空操作不该假装成功)', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${id}`, payload: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('简介超上限 ⇒ 422;账号不存在 ⇒ 404', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');

    const tooLong = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      payload: { bio: '很'.repeat(61) },
    });
    expect(tooLong.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/users/00000000-0000-4000-8000-000000000000',
      payload: { bio: '在吗' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.USER_NOT_FOUND);
  });
});

describe('GET /api/users/:id/avatar —— 取头像', () => {
  it('账号在但没设过头像 ⇒ 404 USER_AVATAR_NOT_FOUND(不是"账号不存在")', async () => {
    const { app, register } = await makeFixture();
    const id = await register('小美');
    const res = await app.inject({ method: 'GET', url: `/api/users/${id}/avatar` });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      ErrorCode.USER_AVATAR_NOT_FOUND,
    );
  });
});

describe('落盘兼容', () => {
  /**
   * ★★ 2026-10-01 之前建的账号**盘上没有 `bio` / `avatarMime` 这两格**。
   * 行是 `.strict()`,而这两格是 `.optional()` —— 这条钉住那个设计:
   * 一旦有人把可选项改成必填,老账号会在读出口整表读不出来(登录直接 500)。
   */
  it('★ 老 users.json(没有那两格)照样读得出来、登录得进去', async () => {
    const { app, user, dir, register } = await makeFixture();
    const id = await register('小美');

    // 手工把这两格从盘上抹掉,模拟旧版本写下的行。
    const file = path.join(dir, 'users', 'users.json');
    const table = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
    delete table[id]!.bio;
    delete table[id]!.avatarMime;
    writeFileSync(file, JSON.stringify(table), 'utf8');

    const login = await app.inject({
      method: 'POST',
      url: '/api/users/login',
      payload: { nickname: '小美', password: 'secret1' },
    });
    expect(login.statusCode).toBe(200);
    const view = login.json<ProfileView>();
    // ★ 两格恒在:没有就是 '' / none(视图契约),不是 undefined。
    expect(view.bio).toBe('');
    expect(view.avatarSource).toBe('none');
    expect((await user.getUser.execute(id)).nickname).toBe('小美');
  });
});
