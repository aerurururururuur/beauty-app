/**
 * test/helpers/product-content.ts —— 测试要用的**仓库里那份真产品库**。
 *
 * ★ 与 `face-catalog.ts` 同一个理由:现在不止一个测试文件要读它
 *   (`products` 自己、`styling` 那条色号回填的断言),各拼一遍路径的话,
 *   路径写错会**同时**让几处以同一种方式红,那时候很难一眼看出错的是路径。
 *
 * ⚠️ **这不是"假端口",别把它塞进 `fakes.ts`。** 那个文件装的是内存替身;
 *   这里加载的是**进 git 的、线上真正会读的那份内容**。拿一份假产品库去测
 *   "配方里的色号查不查得到",测到的只是"假库自己和自己一致"——
 *   真库被改瘸了,那边照样绿。
 *
 * ✏️ 2026-09-30:它此前不存在,因为色号当时住在**前端** `vue/src/api/kb/shades.js`
 *   (`frontend-kb.ts` 的 `frontendShades()`)。那次把前端三份 kb 并进 `products/`
 *   之后,色号的唯一来源变成了这里 —— 于是"配方里的 (pid, code) 都查得到"
 *   这条断言的对手也跟着从"另一个仓库的源文件"换成了"发出去的那份内容本身"。
 */
import path from 'node:path';
import { loadCatalogIfPresent } from '../../src/modules/products/index.js';
import type { ProductCatalog } from '../../src/modules/products/index.js';
import type { ShadeCatalog } from '../../src/modules/agent/index.js';

/** 仓库根。本文件在 `server/test/helpers/`,上溯三层到 `olyhks/`。 */
export const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** 仓库里那份真内容。★ 改了它的形状,读它的测试会红——那是应该的。 */
export const REAL_PRODUCTS_DIR = path.join(REPO_ROOT, 'products', 'ysl-property');

let cached: ProductCatalog | undefined;

/**
 * 加载真产品库。★ 只读一次就缓存:整库 66 条 × 163 行色号,每个用例重读一遍
 * 会让 `npm test` 在这一项上白花时间,而文件在测试期间不会变。
 *
 * ⚠️ **加载不到就抛,不是返回 `undefined`。** 生产里"目录不存在"是合法的关闭形态
 * (`loadCatalogIfPresent` 返回 `undefined`,agent 不注册产品工具);但在**测试里**
 * 那意味着一件事:路径写错了,或者内容被人删了。返回 `undefined` 会让下面每条断言
 * 都对着一个空库比 —— 那正是"空对空也相等"。所以这里把它当成失败。
 */
export function realCatalog(): ProductCatalog {
  if (cached) return cached;
  const catalog = loadCatalogIfPresent(REAL_PRODUCTS_DIR);
  if (!catalog) {
    throw new Error(
      `测试要用的产品库读不到:${REAL_PRODUCTS_DIR}\n` +
        '  它是进 git 的内容(`products/ysl-property/`),不该不存在。\n' +
        '  目录在但内容坏的话,这个调用本身会抛出加载器的报错 —— 那才是真的内容问题。',
    );
  }
  cached = catalog;
  return catalog;
}

/**
 * 组装根那道缝(`src/index.ts` 里的 `hexOf`)在测试里的版本。
 *
 * ★ 生产里它由 `src/index.ts` 把 `ProductCatalog` 包一层搭出来,这里照做。
 *   **取不到就是空串**,不抛 —— 与生产同义(空串 = 色板里那一格被丢掉)。
 *   要断言"不该取不到"的地方,拿这个空串去比,别在这里抛。
 */
export function realHexOf(pid: string, code: string): string {
  return realCatalog().find(pid)?.shades?.shades.find((s) => s.code === code)?.hex ?? '';
}

/**
 * `src/index.ts` 里那个 `shadeCatalog` 闭包在测试里的版本 —— 同一条缝的另一半
 * (「这个 pid **有哪些**色号」,与上面那个「这一对是什么颜色」不是一回事)。
 * ★ 判据与生产逐字相同:未知 pid / 没配库一律空数组。
 */
export function realShades(): ShadeCatalog {
  return {
    shadesOf: (pid) =>
      (realCatalog().find(pid)?.shades?.shades ?? []).map((s) => ({
        code: s.code,
        name: s.name,
        hex: s.hex,
      })),
  };
}
