/**
 * 产品库那两条只读路由(`GET /api/products` / `GET /api/products/:id`)。
 *
 * ★ **这一组测的是装配层,不是用例层。** 三个断言里有两个只有走真 `buildApp` 才验得到:
 *   ① 两条路由真的被挂上去了(`app.ts` 那一段漏了就是本仓头号 bug:配好了库、
 *      日志也照打"loaded …",而前端一路 404);
 *   ② **库不存在时它们根本不在**(`PRODUCTS_DIR` 指了空路径)。
 *      口径写在 `products/presentation/routes/products.route.ts`:**不做成"注册了但回空目录"**。
 *
 * ⚠️ 用例层(投影 / 404 的翻译)不在这里 —— 那些在 `products.test.ts` 里直接调用例测,
 *   走 HTTP 反而多一层与它们无关的框架行为。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
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
import { REAL_PRODUCTS_DIR } from './helpers/product-content.js';
import { fakeLooksModule } from './helpers/fakes.js';
import { MockLlm } from './helpers/mock-llm.js';
import { MockWeatherProvider } from './helpers/mock-weather-provider.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'products-route-'));
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

/**
 * 装一个真的 `buildApp`,产品库那一格由 `productsDir` 决定 ——
 * **这正是要验的那一格**:同一个 `buildApp`,只换这一个配置值。
 */
async function makeApp(productsDir: string): Promise<FastifyInstance> {
  const dir = tempDir();
  const config = loadConfig({
    DATA_DIR: dir,
    PRODUCTS_DIR: productsDir,
  });
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const userExists = async (): Promise<boolean> => true;

  const agent = createAgentModule({
    llm: new MockLlm(),
    cosmetics: { listByUser: async () => [] },
    userExists,
    engine: stubEngine,
    artifacts: createSessionArtifacts(artifactStore, { engineOutDir: config.makeupOutDir }),
    // 这三样只在 propose_look 那一步被读,这一组不碰妆面校验。
    palette: { toneKeysFor: () => undefined, labelOf: () => undefined },
    features: { byId: () => undefined },
    shades: { hexOf: () => '' },
  });

  return buildApp({
    config,
    user: createUserModule({ dataDir: config.dataDir }),
    weather: createWeatherModule({ provider: new MockWeatherProvider() }),
    cabinet: createCabinetModule({ dataDir: config.dataDir, userExists }),
    looks: fakeLooksModule({ dataDir: config.dataDir, userExists }),
    // ★ 与 `src/index.ts` 同一条路:真 compose,不是手搓的空壳。
    products: createProductsModule({ contentDir: config.productsDir }),
    agent,
  });
}

describe('GET /api/products', () => {
  it('200:回目录树 + 卡片 + 全部色号;每张卡片的水位与分类对得上', async () => {
    const app = await makeApp(REAL_PRODUCTS_DIR);
    const res = await app.inject({ method: 'GET', url: '/api/products' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      groups: { id: string; label: string; children: { id: string; label: string }[] }[];
      products: { id: string; name: string; categoryId: string; text: string; shadeCount: number; hasShades: boolean }[];
      shades: Record<string, { label: string; shades: { code: string; hex: string }[] }>;
    };

    // 两组(护肤 / 彩妆),九个叶子类目。
    expect(body.groups.map((g) => g.id)).toEqual(['skincare', 'makeup']);
    const leaves = body.groups.flatMap((g) => g.children);
    expect(leaves.map((c) => c.id)).toEqual([
      'precare', 'primer', 'base', 'concealer', 'setting', 'blush', 'eye', 'lip', 'contour',
    ]);

    // ★ 每一张卡片都指着一个真的存在的叶子 —— 悬空的 `categoryId` 会让前端把这张卡
    //   渲染到任何分类里都找不到的位置,而界面上只是"少了几件产品"。
    const leafIds = new Set(leaves.map((c) => c.id));
    expect(body.products.length).toBeGreaterThan(0);
    for (const card of body.products) {
      expect(leafIds.has(card.categoryId), `${card.id} 的分类 ${card.categoryId} 不在目录树里`).toBe(true);
      expect(card.name).not.toBe('');
    }

    // ★ 色号字典的键必须都是**真的在卡片里出现过**的产品 id:多出来的键没人读
    //   (假开关),少了的键则是"试色面板整块打不开"。
    const ids = new Set(body.products.map((p) => p.id));
    for (const pid of Object.keys(body.shades)) {
      expect(ids.has(pid), `色号字典里的 ${pid} 没有对应的卡片`).toBe(true);
      expect(body.shades[pid]!.shades.length).toBeGreaterThan(0);
    }
    for (const card of body.products) {
      // `hasShades` 的判据是**内容文件里有没有 `shades`**,不是 `shadeCount > 0`。
      expect(card.hasShades).toBe(body.shades[card.id] !== undefined);
      if (card.hasShades) expect(card.shadeCount).toBe(body.shades[card.id]!.shades.length);
    }
  });

  it('★ 库不存在 ⇒ 两条路由**都不在**(404),而不是回一个空目录的 200', async () => {
    const app = await makeApp(path.join(tempDir(), 'no-products'));

    const list = await app.inject({ method: 'GET', url: '/api/products' });
    expect(list.statusCode).toBe(404);

    const detail = await app.inject({ method: 'GET', url: '/api/products/lip-gold' });
    expect(detail.statusCode).toBe(404);

    // ★ 404 不是因为整个 web shell 没起来:同一条装配里别的口照旧在。
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });
});

describe('GET /api/products/:id', () => {
  it('200:六维原文 + 手写补充**分开**给,色号随附', async () => {
    const app = await makeApp(REAL_PRODUCTS_DIR);
    // 点名一件**源资料里有六维原文**的产品(恒久粉底液)。
    // ⚠️ 别拿 `list()[0]` 来试:排在最前的是手写层补录 / 系列卡那几种,
    //    它们本来就没有六维原文,拿它们断言"六维非空"会红在一条假的前提上。
    const res = await app.inject({ method: 'GET', url: '/api/products/base-fd-new' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      id: string;
      name: string;
      categoryId: string;
      number: number | null;
      dimensions: { key: string; label: string; text: string }[];
      wording: { key: string; label: string; text: string }[];
      shades?: { label: string; shades: { code: string; hex: string }[] };
    };
    expect(body.id).toBe('base-fd-new');
    expect(body.name).not.toBe('');
    expect(body.categoryId).toBe('base');
    // ★ 两路**分开**:`dimensions` 是品牌资料原文,`wording` 是手写补的话。
    //   合成一路的话,界面上就再也分不清哪句是谁说的了(provenance 会丢)。
    for (const dim of body.dimensions) expect(dim.text).not.toBe('');
    for (const w of body.wording) expect(w.text).not.toBe('');
    expect(body.dimensions.length).toBeGreaterThan(0);
    expect(body.shades?.shades.length).toBeGreaterThan(0);
  });

  it('未知 id ⇒ 404(码是 PRODUCT_NOT_FOUND,不是归属类的那些)', async () => {
    const app = await makeApp(REAL_PRODUCTS_DIR);
    const res = await app.inject({ method: 'GET', url: '/api/products/no-such-product' });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('★ 形状不合法的 id 也是 404,**不是 422**', async () => {
    // 产品库是**品牌内容**,不挂账号、没有归属可校验 ⇒ 这里不存在"格式不对"与
    // "查不到"两种情形,只有后者(口径见 `routes/products.route.ts`)。
    const app = await makeApp(REAL_PRODUCTS_DIR);
    const res = await app.inject({ method: 'GET', url: '/api/products/NOT_A_SLUG' });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe('PRODUCT_NOT_FOUND');
  });
});
