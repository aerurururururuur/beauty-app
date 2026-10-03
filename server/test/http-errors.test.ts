/**
 * HTTP 错误体那几句话 —— 只有走真 `buildApp` 才验得到。
 *
 * ★ **这一组守的是一条界面规矩**:前端把 `error.message` **原样**打在界面上
 *   (vue/AGENTS.md §3 第 2 条),所以这个字段里**不许出现英文**。
 *   而 fastify / zod 给的缺省文案全是英文,不显式翻一遍,它们就会出现在用户眼前。
 *   三处现场:
 *   ① 没挂上的路由 —— fastify 缺省回的是 `{ message, error, statusCode }`,前端从
 *      `error` 那格取到字符串 `"Not Found"`,**界面上就是这四个字母**;
 *   ② 框架级错误(超限 / 空 body / 坏 JSON)—— `message` 是 fastify 的英文原文;
 *   ③ zod 的形状错(类型不对 / `.strict()` 多给字段)—— 同上。
 *
 * ⚠️ 第 ① 条**不是假想的**:`PRODUCTS_DIR` 指空时 `/products` 两条路由根本不注册
 *   (见 `app.ts` 那段),`/vanity` 两屏要的第一句人话走的就是这里。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { createAssetsModule } from '../src/modules/assets/index.js';
import { createCabinetModule } from '../src/modules/cabinet/index.js';
import { createAgentModule } from '../src/modules/agent/index.js';
import { createProductsModule } from '../src/modules/products/index.js';
import { createUserModule } from '../src/modules/user/index.js';
import { createWeatherModule } from '../src/modules/weather/index.js';
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';
import { buildApp } from '../src/app.js';
import { createSessionArtifacts } from '../src/session-artifacts.js';
import type { Engine } from '../src/modules/makeup/index.js';
import { MockLlm } from './helpers/mock-llm.js';
import { MockWeatherProvider } from './helpers/mock-weather-provider.js';
import { fakeLooksModule } from './helpers/fakes.js';

const dirs: string[] = [];
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

/** ★ `contentDir` 故意指一个不存在的目录 ⇒ `/api/products` 那两条路由**不注册**(见下第 ① 组)。 */
async function makeApp(): Promise<FastifyInstance> {
  const dir = mkdtempSync(path.join(tmpdir(), 'http-errors-'));
  dirs.push(dir);
  const config = loadConfig({
    DATA_DIR: dir,
    PRODUCTS_DIR: path.join(dir, 'no-products'),
  });
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const userExists = async (): Promise<boolean> => true;

  return buildApp({
    config,
    user: createUserModule({ dataDir: config.dataDir }),
    weather: createWeatherModule({ provider: new MockWeatherProvider() }),
    cabinet: createCabinetModule({ dataDir: config.dataDir, userExists }),
    looks: fakeLooksModule({ dataDir: config.dataDir, userExists }),
    products: createProductsModule({ contentDir: config.productsDir }),
    agent: createAgentModule({
      llm: new MockLlm(),
      cosmetics: { listByUser: async () => [] },
      userExists,
      engine: stubEngine,
      artifacts: createSessionArtifacts(artifactStore, { engineOutDir: config.makeupOutDir }),
      palette: { toneKeysFor: () => undefined, labelOf: () => undefined },
      features: { byId: () => undefined },
      shades: { hexOf: () => '' },
    }),
  });
}

/**
 * 界面上那句话不许是 fastify / zod 的英文原文。
 * ★ 判据是**逐条钉住改之前真会漏出来的那几句**,不是"一个 ASCII 字母都不许有" ——
 *   请求路径(`/api/products`)与字段名(`password`)本来就是 ASCII,而且是该留的。
 */
const ENGLISH_LEAKS = [
  'Not Found',
  'too large',
  'Request body',
  'Unrecognized',
  'Expected ',
  'received ',
  'Invalid input',
  'Body cannot be empty',
  'Body is not valid',
  'FST_',
];

function expectNoEnglishLeak(message: string): void {
  expect(message).not.toBe('');
  for (const leak of ENGLISH_LEAKS) {
    expect(message, `界面上漏出了英文原文「${leak}」`).not.toContain(leak);
  }
}

async function messageOf(
  app: FastifyInstance,
  opts: InjectOptions,
): Promise<{ status: number; code: string; message: string }> {
  const res = await app.inject(opts);
  const body = res.json<{ error?: { code?: string; message?: string } }>();
  expect(body.error, `响应体不是统一信封:${res.body.slice(0, 200)}`).toBeDefined();
  return {
    status: res.statusCode,
    code: body.error?.code ?? '',
    message: body.error?.message ?? '',
  };
}

describe('① 没挂上的路由 —— 也要回统一信封 + 中文', () => {
  it('★ 真实场景:`PRODUCTS_DIR` 指空 ⇒ `/api/products` 没注册 ⇒ 404,而不是裸的 "Not Found"', async () => {
    const app = await makeApp();
    const { status, code, message } = await messageOf(app, { method: 'GET', url: '/api/products' });

    expect(status).toBe(404);
    expect(code).toBe('HTTP_ERROR');
    expect(message).toContain('/api/products');
    expectNoEnglishLeak(message);
  });

  it('拼错的 URL:说出方法 + 路径', async () => {
    const app = await makeApp();
    const { status, message } = await messageOf(app, { method: 'POST', url: '/api/nope' });

    expect(status).toBe(404);
    expect(message).toContain('POST');
    expect(message).toContain('/api/nope');
  });

  it('★ 路径里不带 query —— 那句话是要给人看的,别把请求参数一起念出来', async () => {
    const app = await makeApp();
    const { message } = await messageOf(app, { method: 'GET', url: '/api/nope?userId=secret-1' });

    expect(message).toContain('/api/nope');
    expect(message).not.toContain('userId');
    expect(message).not.toContain('secret-1');
  });
});

describe('② 框架级错误 —— fastify 的英文原文不许露出去', () => {
  it('越过 bodyLimit:413 + 中文(不再有 "Request body is too large")', async () => {
    const app = await makeApp();
    // `PATCH /users/:id` 的 bodyLimit 是 4 MiB(`MAX_PHOTO_DATAURL * 2`)。
    const { status, code, message } = await messageOf(app, {
      method: 'PATCH',
      url: '/api/users/whatever',
      payload: { bio: 'x'.repeat(5 * 1024 * 1024) },
    });

    expect(status).toBe(413);
    expect(code).toBe('HTTP_ERROR');
    expectNoEnglishLeak(message);
  });

  it('坏 JSON:400 + 中文', async () => {
    const app = await makeApp();
    const { status, message } = await messageOf(app, {
      method: 'POST',
      url: '/api/users',
      headers: { 'content-type': 'application/json' },
      payload: '{"nickname":',
    });

    expect(status).toBe(400);
    expectNoEnglishLeak(message);
  });

  it('content-type 是 json 但 body 空的:400 + 中文', async () => {
    const app = await makeApp();
    const { status, message } = await messageOf(app, {
      method: 'POST',
      url: '/api/users',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(status).toBe(400);
    expectNoEnglishLeak(message);
  });
});

describe('③ zod 的形状错 —— 也不许露英文', () => {
  it('★ 多给一个键(`.strict()`):说"多给了不认识的字段",不是 "Unrecognized key(s)"', async () => {
    const app = await makeApp();
    const { status, code, message } = await messageOf(app, {
      method: 'POST',
      url: '/api/users',
      payload: { nickname: '小美', password: 'secret1', role: 'admin' },
    });

    expect(status).toBe(422);
    expect(code).toBe('VALIDATION_ERROR');
    expect(message).toContain('role');
    expectNoEnglishLeak(message);
  });

  it('类型整错(`password` 给数字):说人话,不是 "Expected string, received number"', async () => {
    const app = await makeApp();
    const { status, message } = await messageOf(app, {
      method: 'POST',
      url: '/api/users',
      payload: { nickname: '小美', password: 12345678 },
    });

    expect(status).toBe(422);
    expectNoEnglishLeak(message);
  });

  it('body 根本不是对象:`details.issues` 照旧原样留着(那是给排查的,不是给人看的)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { 'content-type': 'application/json' },
      payload: '"a string"',
    });
    const body = res.json<{ error?: { message?: string; details?: { issues?: unknown[] } } }>();

    expect(res.statusCode).toBe(422);
    expectNoEnglishLeak(body.error?.message ?? '');
    expect(body.error?.details?.issues?.length).toBeGreaterThan(0);
  });
});
