/**
 * products 模块:内容加载 + **坏数据启动即失败** + 体检报告。
 *
 * ★ 本文件测的是**这个模块唯一的实质判断**:什么样的目录算"没有产品库"(静默),
 *   什么样算"内容坏了"(炸)。两者的分界线写错了,后果不对称——
 *   划错前者的后果是功能没了(看得见);划错后者的后果是**模型从残缺库里推荐**(看不见)。
 *   所以下面"该炸"的那几条是这个文件里最要紧的。
 *
 * ★ 有一组用例直接跑**仓库里那份真内容**(`products/ysl-property/`)。
 *   那不是在测"内容对不对",是在测"**发出去的那份内容真的加载得起来**"——
 *   内容进 git 就等于是代码的一部分,它加载不起来 = 服务起不来。
 *
 * ⚠️ 与 `test/helpers/fakes.ts` 无关:本模块的假件就是**临时目录里的 JSON**,
 *   比假对象更接近真实(能顺带测到 zod 与文件系统那一层)。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DIMENSION_KEYS,
  JsonProductCatalog,
  createProductsModule,
  loadCatalogIfPresent,
  toLibraryView,
  toProductDetailView,
} from '../src/modules/products/index.js';
import type {
  Product,
  ProductCatalog,
  ProductDetailView,
  LibraryView,
} from '../src/modules/products/index.js';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');
/** 仓库里那份真内容。★ 改了它的形状,这个文件会红——那是应该的。 */
const REAL_CONTENT = path.join(REPO_ROOT, 'products', 'ysl-property');

/**
 * 端口只给领域类型,给模型看的样子要先过投影。
 * 这两个小帮手替组装根做同一件事(`src/index.ts` 那段粘合),这样断言写起来还是老样子。
 */
function viewOf(catalog: ProductCatalog): LibraryView {
  return toLibraryView(catalog.library(), catalog.list());
}
function detailOf(catalog: ProductCatalog, id: string): ProductDetailView | undefined {
  const p = catalog.find(id);
  return p ? toProductDetailView(p, catalog.library()) : undefined;
}

let dir: string;
let tempDirs: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'products-'));
  tempDirs.push(dir);
});
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ── 搭一个最小但合法的小库 ───────────────────────────────────────────────────

function productFile(over: Partial<Product> = {}): Product {
  return {
    id: '01-x',
    number: 1,
    name: '某产品',
    category: 'lip',
    dimensions: { texture: '哑光。' },
    derived: { lookSpecSlots: ['zones.lip'] },
    ...over,
  };
}

function libraryFile(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-lib',
    name: '测试库',
    brand: '测试牌',
    source: { file: 'source/x.docx', sha256: 'abc', importedAt: '2026-09-16T00:00:00.000Z', importer: 'test' },
    dimensions: [{ key: 'texture', label: '质地/妆效' }],
    categories: [
      {
        id: 'lip',
        label: '唇部彩妆',
        order: 1,
        statedCount: null,
        actualCount: 1,
        lookSpecSlots: ['zones.lip'],
        series: [],
      },
    ],
    matchingGuide: { columns: ['条件', '首选'], rows: [] },
    notes: [],
    health: {
      statedVsActual: { perCategory: [], statedTotals: [], actualTotal: 1 },
      missingDimensions: [],
      missingOptionalDimensions: [],
      suspectedDuplicates: [],
      shadeLeakage: [],
      missingEnglishName: [],
    },
    ...over,
  };
}

/** 把一份 library.json + 若干条目落成 `root` 这个内容目录,返回 `root`。 */
function writeLibraryAt(
  root: string,
  library: Record<string, unknown>,
  files: Record<string, Product>,
): string {
  mkdirSync(path.join(root, 'lip'), { recursive: true });
  writeFileSync(path.join(root, 'library.json'), JSON.stringify(library, null, 2));
  for (const [name, product] of Object.entries(files)) {
    writeFileSync(path.join(root, 'lip', `${name}.json`), JSON.stringify(product, null, 2));
  }
  return root;
}

/** 落一个内容目录到 `<tmp>/lib`,返回库根。 */
function writeLibrary(
  library: Record<string, unknown>,
  files: Record<string, Product>,
): string {
  return writeLibraryAt(path.join(dir, 'lib'), library, files);
}

// ── 该静默的:目录不存在 = 没有产品库 ────────────────────────────────────────

describe('没有产品库(静默,不炸)', () => {
  it('目录不存在 → catalog 是 undefined,而不是"空库"', () => {
    const services = createProductsModule({ contentDir: path.join(dir, '并不存在') });
    expect(services.catalog).toBeUndefined();
    expect(services.loaded).toBeUndefined();
  });

  it('路径指向一个**文件**而不是目录 → 同样视为没有', () => {
    const file = path.join(dir, 'a.txt');
    writeFileSync(file, 'x');
    expect(loadCatalogIfPresent(file)).toBeUndefined();
    expect(() => createProductsModule({ contentDir: file })).not.toThrow();
  });
});

// ── 该炸的:目录在但内容坏 ──────────────────────────────────────────────────

describe('★ 坏数据一律启动即失败(绝不静默跳过)', () => {
  /** 断言"炸了,且那句错话说明了是哪份文件、哪里不对"。 */
  function expectStartupFailure(root: string, ...mustMention: string[]): void {
    let thrown: unknown;
    try {
      createProductsModule({ contentDir: root });
    } catch (err) {
      thrown = err;
    }
    expect(thrown, '这个库本该让启动失败,但它没有').toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    for (const fragment of mustMention) expect(message).toContain(fragment);
  }

  it('目录里没有 library.json', () => {
    mkdirSync(path.join(dir, 'empty'), { recursive: true });
    expectStartupFailure(path.join(dir, 'empty'), 'library.json');
  });

  it('JSON 语法坏了', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    writeFileSync(path.join(root, 'library.json'), '{ 这不是 JSON');
    expectStartupFailure(root, '读不出来');
  });

  it('条目缺字段(zod 挡下)', () => {
    const broken = productFile();
    delete (broken as { name?: string }).name;
    const root = writeLibrary(libraryFile(), { '01-x': broken });
    expectStartupFailure(root, 'name');
  });

  it('★ 条目多了字段也炸(.strict)——那是"有人改了导入器而模块没跟上"', () => {
    const root = writeLibrary(libraryFile(), {
      '01-x': { ...productFile(), 多出来的: 'x' } as unknown as Product,
    });
    expectStartupFailure(root, '多出来的');
  });

  it('★ 维度列表里多出一个键也炸(`dimensionsSchema` 自己也是 .strict())', () => {
    // 与上一条不同的地方:这是在**嵌套的那一层**。上一条只挡住产品文件的顶层键,
    // 而"导入器加了个第七维度"改的正是这一层。
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({
        dimensions: { ...productFile().dimensions, 新维度: 'x' } as Product['dimensions'],
      }),
    });
    expectStartupFailure(root, '新维度');
  });

  it('★ category 与所在目录不符(目录即索引,两处必须一致)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile({ category: 'base' }) });
    expectStartupFailure(root, '目录即索引');
  });

  it('★ library.json 里没登记的目录(绝不静默跳过——那会让产品凭空消失)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    mkdirSync(path.join(root, '不认识的类目'), { recursive: true });
    expectStartupFailure(root, '不认识的目录');
  });

  it('★ 类目登记的条数与实际扫到的对不上(有人删了文件却没重导)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    writeFileSync(
      path.join(root, 'lip', '02-y.json'),
      JSON.stringify(productFile({ id: '02-y', number: 2 })),
    );
    expectStartupFailure(root, '实际扫到 2 条');
  });

  it('产品 id 重复', () => {
    const root = writeLibrary(libraryFile({
      categories: [
        { id: 'lip', label: '唇部彩妆', order: 1, statedCount: null, actualCount: 2, lookSpecSlots: [], series: [] },
      ],
    }), {
      '01-x': productFile(),
      '02-y': productFile(), // 同一个 id
    });
    expectStartupFailure(root, 'id 重复');
  });

  it('source/ 不是类目,要被跳过(它是溯源副本)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    mkdirSync(path.join(root, 'source'), { recursive: true });
    writeFileSync(path.join(root, 'source', 'x.docx'), 'binary-ish');
    expect(() => createProductsModule({ contentDir: root })).not.toThrow();
  });
});

// ── 两种指法:指到库根,或指到装着它的容器 ──────────────────────────────────
//
// ★ 缺省 `PRODUCTS_DIR=../products` 指的是**容器**,所以这一组不是边角料,是缺省路径。
//   它同时是"什么时候静默"那条分界线**最容易划错**的地方:容器扫描返回 0 个库,
//   一眼看上去很像"没有产品库",但它其实是**内容没复制全 / library.json 被删**。
//   划错的后果就是本文件开头说的那种:功能静默没了,没有一行日志说为什么。

describe('★ 两种指法(库根 / 容器)', () => {
  it('指到容器 → 取出下面唯一的那个库', () => {
    const container = path.join(dir, 'container');
    writeLibraryAt(path.join(container, 'only-lib'), libraryFile(), { '01-x': productFile() });

    const catalog = loadCatalogIfPresent(container);
    expect(catalog).toBeDefined();
    expect(catalog!.find('01-x')?.name).toBe('某产品');
  });

  it('★ 容器下有 >=2 个库 → 抛错,且把两个库名都报出来(不猜)', () => {
    const container = path.join(dir, 'two');
    writeLibraryAt(path.join(container, 'lib-a'), libraryFile({ id: 'a' }), {
      '01-x': productFile(),
    });
    writeLibraryAt(path.join(container, 'lib-b'), libraryFile({ id: 'b' }), {
      '02-y': productFile({ id: '02-y', number: 2 }),
    });

    // 随便挑一个的后果是模型只看得见一个品牌而它自己不知道 —— 所以必须炸。
    expect(() => createProductsModule({ contentDir: container })).toThrow(/lib-a/);
    expect(() => createProductsModule({ contentDir: container })).toThrow(/lib-b/);
    expect(() => createProductsModule({ contentDir: container })).toThrow(/不知道该用哪个/);
  });

  it('★★ 容器在、但下面一个库都没有(内容没复制全)→ 抛错,不当"没有产品库"', () => {
    const container = path.join(dir, 'half-copied');
    // 有子目录,但里面没有 library.json —— 正是"复制到一半"的样子。
    mkdirSync(path.join(container, 'ysl-property', 'lip'), { recursive: true });
    writeFileSync(path.join(container, 'ysl-property', 'lip', '01-x.json'), '{}');

    expect(() => createProductsModule({ contentDir: container })).toThrow(/library\.json/);
  });

  it('★ 库根自己少了 library.json(不是容器,是库)→ 同样抛错', () => {
    const root = path.join(dir, 'lib-lost-its-json');
    mkdirSync(path.join(root, 'lip'), { recursive: true });
    writeFileSync(path.join(root, 'lip', '01-x.json'), '{}');

    expect(() => createProductsModule({ contentDir: root })).toThrow(/library\.json/);
  });
});

// ── 概览与查询 ──────────────────────────────────────────────────────────────

describe('overview / find', () => {
  it('find 按 id 取;查不到是 undefined,不抛错', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    const catalog = loadCatalogIfPresent(root)!;

    expect(catalog.find('01-x')?.name).toBe('某产品');
    expect(catalog.find('不存在')).toBeUndefined();
  });

  it('★ `textureFirst` 取的是**首句**而不是截断', () => {
    const long = '哑光质地，显色度高。第二句不该出现。第三句也不该。';
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({ dimensions: { texture: long } }),
    });
    const catalog = loadCatalogIfPresent(root)!;

    expect(viewOf(catalog).products[0]?.textureFirst).toBe('哑光质地，显色度高。');
  });

  it('缺的维度在详情里**不出现**(不是空串)——那是"源资料没写",不是"没这个性质"', () => {
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({ dimensions: { texture: '哑光。', warnings: '含香精。' } }),
    });
    const catalog = loadCatalogIfPresent(root)!;

    expect(detailOf(catalog, '01-x')?.dimensions.map((d) => d.key)).toEqual(['texture', 'warnings']);
  });

  it('★ 六个维度全给 → 一个不少、顺序也对(dimensionsSchema 与 DIMENSION_KEYS 对表)', () => {
    // `dimensionsSchema` 的六格是**逐字写**的(生成出来会退化成 Record,见 schema 里的注释),
    // 于是同一份清单有两处:那六格,以及 DIMENSION_KEYS。这条钉的是"两处一字不差"。
    // ★ 为什么值得单独钉:今天漏一格多半会炸(`.strict()` 撞上真内容里那份六格齐全的
    //   文件),但"会炸"靠的是内容碰巧带了那一维——换一份内容就没人报了。这条与内容无关。
    const all = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, '原文。'])) as Product['dimensions'];
    const root = writeLibrary(libraryFile(), { '01-x': productFile({ dimensions: all }) });
    const catalog = loadCatalogIfPresent(root)!;

    // 顺序一起钉:出详情的顺序就是展示顺序,两处顺序不同样是"说一套做一套"。
    expect(detailOf(catalog, '01-x')?.dimensions.map((d) => d.key)).toEqual([...DIMENSION_KEYS]);
  });

  it('overview 里透出的条目数就是实际扫到的数', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    const catalog = loadCatalogIfPresent(root)!;
    expect(viewOf(catalog).products).toHaveLength(1);
    expect(viewOf(catalog).categories[0]?.count).toBe(1);
  });
});

// ── 真内容:发出去的那份加载得起来 ──────────────────────────────────────────

describe('★ 仓库里那份真内容(改了它的形状这里会红)', () => {
  it('加载得起来,条数与类目对得上', () => {
    const catalog = new JsonProductCatalog(REAL_CONTENT);
    const overview = viewOf(catalog);

    expect(overview.categories).toHaveLength(9);
    // 条数写死是**故意的**:这份数字变了,要么是内容真的变了(那就该来改这里),
    // 要么是导入器坏了。两种都该有人看一眼。
    expect(overview.products).toHaveLength(57);
    expect(overview.matchingGuide.rows).toHaveLength(13);
    expect(overview.matchingGuide.columns[0]).toBe('天气/场景条件');
  });

  it('每一条都能按 id 取回详情(索引里的 id 与 find 对得上)', () => {
    const catalog = new JsonProductCatalog(REAL_CONTENT);
    for (const entry of viewOf(catalog).products) {
      expect(catalog.find(entry.id), `索引里的 ${entry.id} 取不回详情`).toBeDefined();
    }
  });

  it('★ 体检报告抓得到我们手工核出来的那几类问题(正向验证)', () => {
    // 这一条是"规则写对了"的证明,不是"数据干净"的证明:
    // 已知有四类问题,体检报告一项都没报出来才说明它坏了。
    const health = new JsonProductCatalog(REAL_CONTENT).library().health;

    expect(health.statedVsActual.statedTotals.length).toBeGreaterThan(1); // 资料内 55/57 两种说法
    expect(health.missingDimensions.length).toBeGreaterThan(0); // #36 空占位、#40 缺成分
    expect(health.suspectedDuplicates.length).toBeGreaterThan(0);
    expect(health.shadeLeakage.length).toBeGreaterThan(0);
    expect(health.missingEnglishName.length).toBeGreaterThan(0);
    // 类别自称与实际对不上(护肤 21 vs 22)。
    expect(health.statedVsActual.perCategory.some((c) => !c.ok)).toBe(true);
  });
});
